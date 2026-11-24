import { createHmac, pbkdf2, randomBytes, randomInt, timingSafeEqual } from "crypto";
import { promises as fs } from "fs";
import nodemailer from "nodemailer";
import path from "path";
import type { Express, NextFunction, Request, Response } from "express";
import { getMongoDatabase } from "./mongo";

type Role = "CUSTOMER" | "ARENA_OWNER" | "SHOPKEEPER" | "ADMIN";
type AccountType = Exclude<Role, "ADMIN">;
type RequestUser = { id: string; email: string; fullName: string; role: Role };
type ApiRequest = Request & { user?: RequestUser };
type FileInput = { name?: string; type?: string; data?: string };

const SESSION_COOKIE = "arenahub_session";
const SPORTS = ["Badminton", "Basketball", "Cricket", "Football", "Pickleball", "Table Tennis", "Tennis", "Volleyball"];
const STATUS_TRANSITIONS: Record<string, string[]> = {
  PENDING_REVIEW: ["UNDER_REVIEW"],
  UNDER_REVIEW: ["CHANGES_REQUESTED", "REJECTED", "APPROVED"],
  APPROVED: ["SUSPENDED"],
};
const APPROVAL_CHECKLIST = ["owner_information", "contact_information", "arena_name", "sports", "courts", "location", "google_maps_location", "operating_hours", "pricing", "amenities", "images", "equipment", "required_information", "duplicate_check", "arena_valid"];
const EMAIL_VERIFICATION_TTL_MS = 10 * 60 * 1000;
const EMAIL_RESEND_COOLDOWN_MS = 60 * 1000;
const RAZORPAY_SESSION_TTL_MS = 15 * 60 * 1000;

function now() { return new Date().toISOString(); }
function id() { return crypto.randomUUID(); }
function error(res: Response, status: number, message: string) { return res.status(status).json({ error: message }); }
function normalizeRole(value: unknown): Role {
  if (value === "ARENA_OWNER" || value === "SHOPKEEPER" || value === "ADMIN" || value === "CUSTOMER") return value;
  // Existing ArenaHub accounts used USER before role-specific accounts were introduced.
  return "CUSTOMER";
}
function accountType(value: unknown): AccountType | undefined {
  if (value === "CUSTOMER" || value === "ARENA_OWNER" || value === "SHOPKEEPER") return value;
  return undefined;
}
function roleLabel(role: Role) {
  return role === "ARENA_OWNER" ? "arena owner" : role === "SHOPKEEPER" ? "shopkeeper" : role === "CUSTOMER" ? "customer" : "administrator";
}
function secret() {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
  if (process.env.NODE_ENV === "production") throw new Error("JWT_SECRET is required in production.");
  return "arenahub-development-secret-change-me";
}
function signSession(userId: string, role: Role) {
  const payload = Buffer.from(JSON.stringify({ userId, role, exp: Date.now() + 1000 * 60 * 60 * 24 * 7 })).toString("base64url");
  return `${payload}.${createHmac("sha256", secret()).update(payload).digest("base64url")}`;
}
function createEmailOtp() { return randomInt(0, 1_000_000).toString().padStart(6, "0"); }
function emailOtpHash(email: string, code: string) { return createHmac("sha256", secret()).update(`${email}:${code}`).digest("hex"); }
function isDevelopment() { return process.env.NODE_ENV !== "production"; }
async function sendEmailOtp(email: string, code: string) {
  const gmailUser = process.env.GMAIL_USER?.trim();
  // App passwords are often displayed in four-character groups. Gmail accepts
  // the same password without the spaces, which is safer to store in .env.
  const gmailAppPassword = process.env.GMAIL_APP_PASSWORD?.replace(/\s+/g, "");
  if (!gmailUser || !gmailAppPassword) {
    if (isDevelopment()) {
      console.info(`[Email verification] Development OTP for ${email}: ${code}`);
      return { developmentOtp: code };
    }
    throw new Error("Email delivery is not configured. Set GMAIL_USER and GMAIL_APP_PASSWORD.");
  }

  const mailer = nodemailer.createTransport({
    service: "gmail",
    auth: { user: gmailUser, pass: gmailAppPassword },
  });
  await mailer.sendMail({
    from: process.env.GMAIL_FROM?.trim() || gmailUser,
    to: email,
    subject: "Your ArenaHub verification code",
    text: `Your ArenaHub verification code is ${code}. It expires in 10 minutes. Do not share this code. If you did not create an account, you can ignore this email.`,
  });
  return {};
}
async function issueEmailVerification(db: Awaited<ReturnType<typeof getMongoDatabase>>, user: any) {
  const code = createEmailOtp();
  const sentAt = new Date();
  const delivery = await sendEmailOtp(user.email, code);
  await db.collection("users").updateOne({ id: user.id }, { $set: { emailVerificationCodeHash: emailOtpHash(user.email, code), emailVerificationExpiresAt: new Date(sentAt.getTime() + EMAIL_VERIFICATION_TTL_MS).toISOString(), emailVerificationSentAt: sentAt.toISOString() } });
  return delivery;
}
function readCookie(req: Request, name: string) {
  const value = req.headers.cookie?.split(";").map(item => item.trim()).find(item => item.startsWith(`${name}=`))?.slice(name.length + 1);
  return value ? decodeURIComponent(value) : undefined;
}
function verifySession(token?: string): { userId: string; role: Role } | undefined {
  if (!token) return undefined;
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return undefined;
  const expected = createHmac("sha256", secret()).update(payload).digest("base64url");
  if (expected.length !== signature.length || !timingSafeEqual(Buffer.from(expected), Buffer.from(signature))) return undefined;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString()) as { userId?: string; role?: unknown; exp?: number };
    const role = normalizeRole(data.role);
    return data.userId && data.role && data.exp && data.exp > Date.now() ? { userId: data.userId, role } : undefined;
  } catch { return undefined; }
}
async function hashPassword(password: string, salt = randomBytes(16).toString("hex")) {
  const derived = await new Promise<Buffer>((resolve, reject) => pbkdf2(password, salt, 120000, 64, "sha512", (err, key) => err ? reject(err) : resolve(key)));
  return { salt, hash: derived.toString("hex") };
}
async function passwordMatches(password: string, salt: string, expected: string) {
  const { hash } = await hashPassword(password, salt);
  return hash.length === expected.length && timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(expected, "hex"));
}
function publicUser(user: any): RequestUser { return { id: user.id, email: user.email, fullName: user.fullName, role: normalizeRole(user.role) }; }
function setSession(res: Response, user: RequestUser) {
  res.cookie(SESSION_COOKIE, signSession(user.id, user.role), { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 1000 * 60 * 60 * 24 * 7, path: "/" });
}
function toNumber(value: unknown, defaultValue = 0) { const numeric = Number(value); return Number.isFinite(numeric) ? numeric : defaultValue; }
function safeFileName(name = "upload") { return name.replace(/[^a-zA-Z0-9._-]/g, "-").slice(-100) || "upload"; }
function normalizeArena(arena: any) {
  const sports = Array.isArray(arena.sports) ? arena.sports : [];
  const courts = Array.isArray(arena.courts) ? arena.courts : [];
  const images = Array.isArray(arena.images) ? arena.images : [];
  const slots = Array.isArray(arena.slots) ? arena.slots : [];
  const equipment = Array.isArray(arena.equipment) ? arena.equipment : [];
  return {
    id: arena.id, owner_id: arena.ownerId, owner_name: arena.ownerName, owner_email: arena.ownerEmail, owner_phone: arena.ownerPhone,
    business_name: arena.businessName, business_registration_number: arena.businessRegistrationNumber, name: arena.name, slug: arena.slug,
    description: arena.description ?? null, address: arena.address, locality: arena.locality, city: arena.city, state: arena.state, pin_code: arena.pinCode,
    google_maps_url: arena.googleMapsUrl ?? null, latitude: arena.latitude ?? null, longitude: arena.longitude ?? null,
    opening_time: arena.openingTime ?? null, closing_time: arena.closingTime ?? null, weekly_schedule: arena.weeklySchedule ?? {}, amenities: arena.amenities ?? [],
    verification_document_path: arena.verificationDocumentPath ?? null, verification_status: arena.verificationStatus, verification_notes: arena.verificationNotes ?? null,
    rating: arena.rating ?? 0, review_count: arena.reviewCount ?? 0, cover_image_path: arena.coverImagePath ?? images[0]?.storagePath ?? null,
    created_at: arena.createdAt, updated_at: arena.updatedAt,
    sports, arena_sports: sports.map((sport: any) => ({ sport_id: sport.id, sports: { name: sport.name } })),
    arena_images: images.map((image: any) => ({ id: image.id, storage_path: image.storagePath, alt_text: image.altText ?? null, sort_order: image.sortOrder ?? 0 })),
    arena_courts: courts.map((court: any) => ({ id: court.id, arena_id: arena.id, sport_id: court.sportId, name: court.name, description: court.description ?? null, hourly_price: court.hourlyPrice, capacity: court.capacity, indoor: Boolean(court.indoor), active: court.active !== false, sports: { name: court.sportName ?? "Sport" } })),
    arena_slots: slots.map((slot: any) => ({ id: slot.id, arena_id: arena.id, court_id: slot.courtId, sport_id: slot.sportId, slot_date: slot.slotDate, start_time: slot.startTime, end_time: slot.endTime, price: slot.price, currency: slot.currency ?? "INR", status: slot.status })),
    equipment: equipment.map((item: any) => ({ id: item.id, arena_id: arena.id, name: item.name, category: item.category ?? "Arena equipment", description: item.description ?? null, stock: item.stock, available_stock: item.availableStock ?? item.stock, rental_price: item.rentalPrice, active: item.active !== false })),
    events: arena.events ?? [], products: arena.products ?? [], arena_verification_history: arena.history ?? [],
  };
}
async function saveFile(file: FileInput | undefined, arenaId: string, folder: string) {
  if (!file?.data) return undefined;
  const matches = /^data:([^;]+);base64,(.+)$/.exec(file.data);
  if (!matches || !matches[1].startsWith("image/") && matches[1] !== "application/pdf") throw new Error("Unsupported upload format.");
  const content = Buffer.from(matches[2], "base64");
  if (!content.length || content.length > 10 * 1024 * 1024) throw new Error("Uploads must be between 1 byte and 10 MB.");
  const name = `${arenaId}-${id()}-${safeFileName(file.name)}`;
  const directory = path.resolve(process.cwd(), "uploads", folder);
  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(path.join(directory, name), content);
  return `/uploads/${folder}/${name}`;
}
async function loadRequestUser(req: ApiRequest, _res: Response, next: NextFunction) {
  try {
    const session = verifySession(readCookie(req, SESSION_COOKIE));
    if (session) {
      const db = await getMongoDatabase();
      const user = await db.collection("users").findOne({ id: session.userId });
      const safeUser = user ? publicUser(user) : undefined;
      // A role is signed into the session and is checked again against MongoDB on every request.
      if (safeUser && safeUser.role === session.role) req.user = safeUser;
    }
    next();
  } catch (cause) { next(cause); }
}
function requireUser(req: ApiRequest, res: Response): req is ApiRequest & { user: RequestUser } {
  if (!req.user) { error(res, 401, "Sign in is required."); return false; }
  return true;
}
function requireAdmin(req: ApiRequest, res: Response): req is ApiRequest & { user: RequestUser } {
  return requireUser(req, res) && req.user.role === "ADMIN" ? true : req.user ? (error(res, 403, "Administrator access is required."), false) : false;
}
function requireRole(req: ApiRequest, res: Response, roles: Role[]): req is ApiRequest & { user: RequestUser } {
  if (!requireUser(req, res)) return false;
  if (roles.includes(req.user.role)) return true;
  error(res, 403, `This action requires a ${roles.map(roleLabel).join(" or ")} account.`);
  return false;
}
function razorpayKeys() {
  const keyId = process.env.RAZORPAY_KEY_ID?.trim();
  const keySecret = process.env.RAZORPAY_KEY_SECRET?.trim();
  return keyId && keySecret ? { keyId, keySecret } : undefined;
}
async function createRazorpayOrder(input: { amount: number; receipt: string; notes: Record<string, string>; linkedAccountId?: string }) {
  const keys = razorpayKeys();
  if (!keys) throw new Error("Razorpay is not configured. Add RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET to .env, then restart the server.");
  const body: Record<string, unknown> = { amount: input.amount, currency: "INR", receipt: input.receipt, notes: input.notes };
  if (input.linkedAccountId && process.env.RAZORPAY_ROUTE_ENABLED === "true") {
    body.transfers = [{ account: input.linkedAccountId, amount: input.amount, currency: "INR", on_hold: false }];
  }
  const response = await fetch("https://api.razorpay.com/v1/orders", {
    method: "POST",
    headers: { Authorization: `Basic ${Buffer.from(`${keys.keyId}:${keys.keySecret}`).toString("base64")}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    console.error("[Razorpay] order creation failed", response.status, await response.text());
    throw new Error("Razorpay could not create the payment order. Check the account settings and try again.");
  }
  return await response.json() as { id: string; amount: number; currency: string };
}
function verifyRazorpaySignature(orderId: string, paymentId: string, signature: string) {
  const keys = razorpayKeys();
  if (!keys) return false;
  const expected = createHmac("sha256", keys.keySecret).update(`${orderId}|${paymentId}`).digest("hex");
  return expected.length === signature.length && timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(signature, "hex"));
}
function publicPayoutProfile(profile: any) {
  if (!profile) return { configured: false, razorpayLinkedAccountId: null, updatedAt: null };
  return { configured: Boolean(profile.razorpayLinkedAccountId), razorpayLinkedAccountId: profile.razorpayLinkedAccountId ?? null, updatedAt: profile.updatedAt ?? null };
}
async function restorePaymentReservation(db: any, payment: any) {
  const equipment = Array.isArray(payment.equipment) ? payment.equipment : [];
  const slotUpdate = await db.collection("arenas").updateOne(
    { id: payment.arenaId },
    { $set: { "slots.$[slot].status": "AVAILABLE", updatedAt: now() } },
    { arrayFilters: [{ "slot.id": payment.slotId, "slot.status": "HELD" }] }
  );

  // A payment reservation owns the held slot. If that slot is no longer held,
  // it has already been completed or released and must not be restocked again.
  if (!slotUpdate.modifiedCount) return;

  for (const item of equipment) {
    await db.collection("arenas").updateOne(
      { id: payment.arenaId },
      { $inc: { "equipment.$[item].availableStock": Number(item.quantity) } },
      { arrayFilters: [{ "item.id": item.id }] }
    );
  }
}

async function releaseExpiredPaymentSessions(db: any) {
  const expired = await db.collection("payments")
    .find({ status: "PENDING", expiresAt: { $lte: now() } })
    .toArray();

  for (const payment of expired) {
    const claimed = await db.collection("payments").findOneAndUpdate(
      { id: payment.id, status: "PENDING", expiresAt: { $lte: now() } },
      { $set: { status: "EXPIRED", expiredAt: now(), updatedAt: now() } },
      { returnDocument: "before" }
    );
    if (claimed) await restorePaymentReservation(db, claimed);
  }
}

async function releaseNewPaymentReservation(db: any, payment: { arenaId: string; slotId: string; equipment: Array<{ id: string; quantity: number }> }) {
  await restorePaymentReservation(db, payment);
}
async function seedSports() {
  const db = await getMongoDatabase();
  await Promise.all(SPORTS.map(name => db.collection("sports").updateOne({ name }, { $setOnInsert: { id: id(), name, active: true } }, { upsert: true })));
}

export function registerMongoApi(app: Express) {
  app.use(loadRequestUser);
  app.get("/api/health", async (_req, res, next) => { try { const db = await getMongoDatabase(); await db.command({ ping: 1 }); res.json({ database: "mongodb", status: "ok" }); } catch (cause) { next(cause); } });
  app.post("/api/auth/register", async (req, res, next) => {
    try {
      const { fullName, email, password, accountType: requestedAccountType } = req.body ?? {};
      if (typeof fullName !== "string" || !fullName.trim() || typeof email !== "string" || !/^\S+@\S+\.\S+$/.test(email) || typeof password !== "string" || password.length < 6) return error(res, 400, "Enter a name, valid email, and a password of at least 6 characters.");
      const selectedRole = accountType(requestedAccountType);
      if (!selectedRole) return error(res, 400, "Choose whether this is a customer, arena owner, or shopkeeper account.");
      const db = await getMongoDatabase(); const normalizedEmail = email.trim().toLowerCase(); const { salt, hash } = await hashPassword(password);
      const isAdmin = (process.env.ADMIN_EMAILS ?? "").split(",").map(value => value.trim().toLowerCase()).includes(normalizedEmail);
      const user = { id: id(), fullName: fullName.trim(), email: normalizedEmail, passwordSalt: salt, passwordHash: hash, role: isAdmin ? "ADMIN" as Role : selectedRole, emailVerifiedAt: null, createdAt: now() };
      await db.collection("users").insertOne(user);
      const delivery = await issueEmailVerification(db, user);
      res.status(201).json({ message: "Verification code sent. Check your email to activate your account.", ...delivery });
    } catch (cause: any) { if (cause?.code === 11000) return error(res, 409, "An account with that email already exists."); next(cause); }
  });
  app.post("/api/auth/verify-email", async (req, res, next) => {
    try {
      const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
      const code = typeof req.body?.code === "string" ? req.body.code.trim() : "";
      if (!/^\S+@\S+\.\S+$/.test(email) || !/^\d{6}$/.test(code)) return error(res, 400, "Enter the email address and six-digit verification code.");
      const db = await getMongoDatabase(); const user = await db.collection("users").findOne({ email });
      if (!user || user.emailVerifiedAt || !user.emailVerificationCodeHash || !user.emailVerificationExpiresAt || new Date(user.emailVerificationExpiresAt).getTime() < Date.now() || !timingSafeEqual(Buffer.from(user.emailVerificationCodeHash, "hex"), Buffer.from(emailOtpHash(email, code), "hex"))) return error(res, 400, "That verification code is invalid or has expired.");
      const verifiedAt = now();
      await db.collection("users").updateOne({ id: user.id }, { $set: { emailVerifiedAt: verifiedAt }, $unset: { emailVerificationCodeHash: "", emailVerificationExpiresAt: "", emailVerificationSentAt: "" } });
      const safeUser = publicUser(user); setSession(res, safeUser); res.json({ user: safeUser });
    } catch (cause) { next(cause); }
  });
  app.post("/api/auth/resend-email-verification", async (req, res, next) => {
    try {
      const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
      if (!/^\S+@\S+\.\S+$/.test(email)) return error(res, 400, "Enter a valid email address.");
      const db = await getMongoDatabase(); const user = await db.collection("users").findOne({ email });
      if (!user || user.emailVerifiedAt) return res.json({ message: "If the account needs verification, a code has been sent." });
      if (user.emailVerificationSentAt && Date.now() - new Date(user.emailVerificationSentAt).getTime() < EMAIL_RESEND_COOLDOWN_MS) return error(res, 429, "Please wait one minute before requesting another code.");
      const delivery = await issueEmailVerification(db, user);
      res.json({ message: "Verification code sent.", ...delivery });
    } catch (cause) { next(cause); }
  });
  app.post("/api/auth/login", async (req, res, next) => {
    try {
      const { email, password, accountType: requestedAccountType } = req.body ?? {};
      const selectedRole = accountType(requestedAccountType);
      if (!selectedRole) return error(res, 400, "Choose the account type you want to sign in with.");
      const db = await getMongoDatabase();
      const user = typeof email === "string" ? await db.collection("users").findOne({ email: email.trim().toLowerCase() }) : undefined;
      if (!user || typeof password !== "string" || !await passwordMatches(password, user.passwordSalt, user.passwordHash)) return error(res, 401, "Email or password is incorrect.");
      const safeUser = publicUser(user);
      if (safeUser.role !== selectedRole && safeUser.role !== "ADMIN") return error(res, 403, `This email is registered as an ${roleLabel(safeUser.role)}. Use that sign-in session instead.`);
      if (!user.emailVerifiedAt) return error(res, 403, "Verify your email with the six-digit code before signing in.");
      setSession(res, safeUser);
      res.json({ user: safeUser });
    } catch (cause) { next(cause); }
  });
  app.post("/api/auth/logout", (_req, res) => { res.clearCookie(SESSION_COOKIE, { path: "/" }); res.status(204).end(); });
  app.post("/api/auth/password-reset", (_req, res) => res.json({ message: "If an account exists, password reset instructions will be sent when email delivery is configured." }));
  app.get("/api/auth/me", (req: ApiRequest, res) => res.json({ user: req.user ?? null }));

  app.get("/api/sports", async (_req, res, next) => { try { await seedSports(); const db = await getMongoDatabase(); res.json(await db.collection("sports").find({ active: true }).sort({ name: 1 }).toArray()); } catch (cause) { next(cause); } });
  app.get("/api/arenas", async (req: ApiRequest, res, next) => { try { const db = await getMongoDatabase(); const status = req.query.status === "all" && req.user?.role === "ADMIN" ? {} : { verificationStatus: String(req.query.status ?? "APPROVED") }; const arenas = await db.collection("arenas").find(status).sort({ updatedAt: -1 }).toArray(); res.json(arenas.map(normalizeArena)); } catch (cause) { next(cause); } });
  app.get("/api/arenas/mine", async (req: ApiRequest, res, next) => { try { if (!requireRole(req, res, ["ARENA_OWNER", "ADMIN"])) return; const db = await getMongoDatabase(); const arenas = await db.collection("arenas").find({ ownerId: req.user.id }).sort({ updatedAt: -1 }).toArray(); res.json(arenas.map(normalizeArena)); } catch (cause) { next(cause); } });
  app.get("/api/arenas/admin", async (req: ApiRequest, res, next) => { try { if (!requireAdmin(req, res)) return; const db = await getMongoDatabase(); const arenas = await db.collection("arenas").find({ verificationStatus: { $in: ["PENDING_REVIEW", "UNDER_REVIEW", "CHANGES_REQUESTED", "APPROVED"] } }).sort({ updatedAt: -1 }).toArray(); res.json(arenas.map(normalizeArena)); } catch (cause) { next(cause); } });
  app.get("/api/arenas/:id/manage", async (req: ApiRequest, res, next) => { try { if (!requireRole(req, res, ["ARENA_OWNER", "ADMIN"])) return; const db = await getMongoDatabase(); const arena = await db.collection("arenas").findOne({ id: req.params.id }); if (!arena) return error(res, 404, "Arena not found."); if (arena.ownerId !== req.user.id && req.user.role !== "ADMIN") return error(res, 403, "This arena is not available to your account."); res.json(normalizeArena(arena)); } catch (cause) { next(cause); } });
  app.get("/api/arenas/:id", async (req, res, next) => { try { const db = await getMongoDatabase(); const arena = await db.collection("arenas").findOne({ id: req.params.id, verificationStatus: "APPROVED" }); if (!arena) return error(res, 404, "Approved arena not found."); res.json(normalizeArena(arena)); } catch (cause) { next(cause); } });
  app.post("/api/arenas", async (req: ApiRequest, res, next) => {
    try {
      if (!requireRole(req, res, ["ARENA_OWNER", "ADMIN"])) return; const body = req.body ?? {}; const input = body.arena ?? {}; if (typeof input.name !== "string" || !input.name.trim()) return error(res, 400, "Arena name is required.");
      const db = await getMongoDatabase(); const time = now(); const existing = body.id ? await db.collection("arenas").findOne({ id: body.id }) : undefined;
      if (existing && existing.ownerId !== req.user.id && req.user.role !== "ADMIN") return error(res, 403, "You cannot edit this arena.");
      if (existing && !["DRAFT", "CHANGES_REQUESTED", "REJECTED"].includes(existing.verificationStatus) && req.user.role !== "ADMIN") return error(res, 409, "Arena details are locked while verification is active or approved.");
      const arenaId = existing?.id ?? id(); const images = [...(existing?.images ?? [])];
      for (const file of Array.isArray(body.images) ? body.images : []) { const storagePath = await saveFile(file, arenaId, "arena-images"); if (storagePath) images.push({ id: id(), storagePath, altText: `${input.name} venue image`, sortOrder: images.length }); }
      const documentPath = body.document ? await saveFile(body.document, arenaId, "verification-documents") : existing?.verificationDocumentPath;
      const selectedSports = Array.isArray(body.sports) ? body.sports : []; const allSports = await db.collection("sports").find({ id: { $in: selectedSports } }).toArray();
      const sportMap = new Map(allSports.map(sport => [sport.id, sport.name]));
      const arena = { ...existing, id: arenaId, ownerId: existing?.ownerId ?? req.user.id, ownerName: String(input.ownerName ?? "").trim(), ownerEmail: String(input.ownerEmail ?? req.user.email).trim(), ownerPhone: String(input.ownerPhone ?? "").trim(), businessName: String(input.businessName ?? "").trim(), businessRegistrationNumber: String(input.businessRegistrationNumber ?? "").trim(), name: input.name.trim(), slug: String(input.slug ?? input.name).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, ""), description: String(input.description ?? "").trim(), address: String(input.address ?? "").trim(), locality: String(input.locality ?? "").trim(), city: String(input.city ?? "").trim(), state: String(input.state ?? "").trim(), pinCode: String(input.pinCode ?? "").trim(), googleMapsUrl: input.googleMapsUrl || null, latitude: input.latitude ?? null, longitude: input.longitude ?? null, openingTime: input.openingTime ?? null, closingTime: input.closingTime ?? null, weeklySchedule: input.weeklySchedule ?? {}, amenities: Array.isArray(input.amenities) ? input.amenities : [], verificationDocumentPath: documentPath ?? null, verificationStatus: existing?.verificationStatus ?? "DRAFT", verificationNotes: existing?.verificationNotes ?? null, sports: allSports.map(sport => ({ id: sport.id, name: sport.name })), courts: (Array.isArray(body.courts) ? body.courts : []).map((court: any) => ({ id: id(), sportId: court.sportId, sportName: sportMap.get(court.sportId) ?? "Sport", name: String(court.name ?? "").trim(), hourlyPrice: toNumber(court.hourlyPrice), capacity: toNumber(court.capacity, 1), indoor: Boolean(court.indoor), active: true })), equipment: (Array.isArray(body.equipment) ? body.equipment : []).filter((item: any) => item.name?.trim()).map((item: any) => ({ id: id(), name: item.name.trim(), category: "Arena equipment", stock: toNumber(item.stock), availableStock: toNumber(item.stock), rentalPrice: toNumber(item.rentalPrice), active: true })), images, slots: existing?.slots ?? [], history: existing?.history ?? [], createdAt: existing?.createdAt ?? time, updatedAt: time };
      await db.collection("arenas").replaceOne({ id: arenaId }, arena, { upsert: true }); res.status(existing ? 200 : 201).json(normalizeArena(arena));
    } catch (cause) { next(cause); }
  });
  app.post("/api/arenas/:id/submit", async (req: ApiRequest, res, next) => { try { if (!requireRole(req, res, ["ARENA_OWNER", "ADMIN"])) return; const db = await getMongoDatabase(); const arena = await db.collection("arenas").findOne({ id: req.params.id }); if (!arena) return error(res, 404, "Arena not found."); if (arena.ownerId !== req.user.id) return error(res, 403, "You cannot submit this arena."); if (!arena.images?.length || !arena.verificationDocumentPath || !arena.sports?.length || !arena.courts?.length) return error(res, 400, "Add sports, at least one court, an image, and a verification document before submitting."); const history = [...(arena.history ?? []), { id: id(), actor_id: req.user.id, action: "SUBMITTED_FOR_REVIEW", reason: null, created_at: now() }]; await db.collection("arenas").updateOne({ id: arena.id }, { $set: { verificationStatus: "PENDING_REVIEW", verificationNotes: null, history, updatedAt: now() } }); res.json({ ok: true }); } catch (cause) { next(cause); } });
  app.post("/api/arenas/:id/status", async (req: ApiRequest, res, next) => { try { if (!requireAdmin(req, res)) return; const status = String(req.body?.status ?? ""); const db = await getMongoDatabase(); const arena = await db.collection("arenas").findOne({ id: req.params.id }); if (!arena) return error(res, 404, "Arena not found."); if (!STATUS_TRANSITIONS[arena.verificationStatus]?.includes(status)) return error(res, 409, "That verification transition is not permitted."); if (["CHANGES_REQUESTED", "REJECTED", "SUSPENDED"].includes(status) && !String(req.body?.reason ?? "").trim()) return error(res, 400, "A reason is required for this decision."); const checklist = req.body?.checklist ?? {}; if (status === "APPROVED" && !APPROVAL_CHECKLIST.every(key => checklist[key] === true)) return error(res, 400, "Complete the verification checklist before approval."); const history = [...(arena.history ?? []), { id: id(), actor_id: req.user.id, action: status, reason: req.body?.reason?.trim() || null, checklist, created_at: now() }]; await db.collection("arenas").updateOne({ id: arena.id }, { $set: { verificationStatus: status, verificationNotes: req.body?.reason?.trim() || null, history, updatedAt: now() } }); res.json({ ok: true }); } catch (cause) { next(cause); } });
  app.post("/api/arenas/:id/slots", async (req: ApiRequest, res, next) => { try { if (!requireRole(req, res, ["ARENA_OWNER", "ADMIN"])) return; const db = await getMongoDatabase(); const arena = await db.collection("arenas").findOne({ id: req.params.id }); if (!arena || (arena.ownerId !== req.user.id && req.user.role !== "ADMIN")) return error(res, 404, "Arena not found."); const input = req.body ?? {}; if (!arena.courts?.some((court: any) => court.id === input.courtId)) return error(res, 400, "Choose one of this arena’s courts."); if (!input.slotDate || !input.startTime || !input.endTime || input.startTime >= input.endTime) return error(res, 400, "Enter a valid slot date and time range."); if (arena.slots?.some((slot: any) => slot.courtId === input.courtId && slot.slotDate === input.slotDate && slot.startTime === input.startTime && slot.endTime === input.endTime)) return error(res, 409, "A slot already exists for this court and time."); const court = arena.courts.find((item: any) => item.id === input.courtId); const slot = { id: id(), courtId: court.id, sportId: court.sportId, slotDate: input.slotDate, startTime: input.startTime, endTime: input.endTime, price: toNumber(input.price), currency: "INR", status: input.status === "BLOCKED" ? "BLOCKED" : "AVAILABLE" }; await db.collection("arenas").updateOne({ id: arena.id }, { $set: { slots: [...(arena.slots ?? []), slot], updatedAt: now() } }); res.status(201).json(slot); } catch (cause) { next(cause); } });
  app.put("/api/arenas/:id/slots/:slotId", async (req: ApiRequest, res, next) => { try { if (!requireUser(req, res)) return; const db = await getMongoDatabase(); const arena = await db.collection("arenas").findOne({ id: req.params.id }); if (!arena || (arena.ownerId !== req.user.id && req.user.role !== "ADMIN")) return error(res, 404, "Arena not found."); const slot = arena.slots?.find((item: any) => item.id === req.params.slotId); if (!slot) return error(res, 404, "Slot not found."); if (!["AVAILABLE", "BLOCKED"].includes(slot.status)) return error(res, 409, "Held and booked slots cannot be changed."); const input = req.body ?? {}; if (!input.slotDate || !input.startTime || !input.endTime || input.startTime >= input.endTime) return error(res, 400, "Enter a valid slot date and time range."); const slots = arena.slots.map((item: any) => item.id === slot.id ? { ...item, slotDate: input.slotDate, startTime: input.startTime, endTime: input.endTime, price: toNumber(input.price), status: input.status === "BLOCKED" ? "BLOCKED" : "AVAILABLE" } : item); await db.collection("arenas").updateOne({ id: arena.id }, { $set: { slots, updatedAt: now() } }); res.json({ ok: true }); } catch (cause) { next(cause); } });
  app.delete("/api/arenas/:id/slots/:slotId", async (req: ApiRequest, res, next) => { try { if (!requireUser(req, res)) return; const db = await getMongoDatabase(); const arena = await db.collection("arenas").findOne({ id: req.params.id }); if (!arena || (arena.ownerId !== req.user.id && req.user.role !== "ADMIN")) return error(res, 404, "Arena not found."); const slot = arena.slots?.find((item: any) => item.id === req.params.slotId); if (!slot) return error(res, 404, "Slot not found."); if (!["AVAILABLE", "BLOCKED"].includes(slot.status)) return error(res, 409, "Held and booked slots cannot be removed."); await db.collection("arenas").updateOne({ id: arena.id }, { $set: { slots: arena.slots.filter((item: any) => item.id !== slot.id), updatedAt: now() } }); res.status(204).end(); } catch (cause) { next(cause); } });
  app.get("/api/owner/shopkeepers", async (req: ApiRequest, res, next) => {
    try {
      if (!requireRole(req, res, ["ARENA_OWNER", "ADMIN"])) return;
      const db = await getMongoDatabase();
      const assignments = await db.collection("shopkeeperAssignments").find(req.user.role === "ADMIN" ? {} : { ownerId: req.user.id }).sort({ createdAt: -1 }).toArray();
      const shopkeeperIds = assignments.map(item => item.shopkeeperId);
      const arenaIds = assignments.map(item => item.arenaId);
      const [shopkeepers, arenas, profiles] = await Promise.all([
        db.collection("users").find({ id: { $in: shopkeeperIds } }).toArray(),
        db.collection("arenas").find({ id: { $in: arenaIds } }).toArray(),
        db.collection("payoutProfiles").find({ userId: { $in: shopkeeperIds } }).toArray(),
      ]);
      const usersById = new Map(shopkeepers.map(item => [item.id, item]));
      const arenasById = new Map(arenas.map(item => [item.id, item]));
      const profilesByUser = new Map(profiles.map(item => [item.userId, item]));
      res.json(assignments.map(assignment => {
        const shopkeeper = usersById.get(assignment.shopkeeperId);
        const arena = arenasById.get(assignment.arenaId);
        return { id: assignment.id, status: assignment.status, createdAt: assignment.createdAt, shopkeeper: shopkeeper ? { id: shopkeeper.id, fullName: shopkeeper.fullName, email: shopkeeper.email } : null, arena: arena ? { id: arena.id, name: arena.name, locality: arena.locality, city: arena.city } : null, payout: publicPayoutProfile(profilesByUser.get(assignment.shopkeeperId)) };
      }));
    } catch (cause) { next(cause); }
  });
  app.post("/api/owner/shopkeepers", async (req: ApiRequest, res, next) => {
    try {
      if (!requireRole(req, res, ["ARENA_OWNER", "ADMIN"])) return;
      const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
      const arenaId = typeof req.body?.arenaId === "string" ? req.body.arenaId : "";
      if (!/^\S+@\S+\.\S+$/.test(email) || !arenaId) return error(res, 400, "Enter a shopkeeper email address and select one of your arenas.");
      const db = await getMongoDatabase();
      const arena = await db.collection("arenas").findOne({ id: arenaId });
      if (!arena || (req.user.role !== "ADMIN" && arena.ownerId !== req.user.id)) return error(res, 404, "That arena is not available to your owner account.");
      const shopkeeper = await db.collection("users").findOne({ email });
      if (!shopkeeper || normalizeRole(shopkeeper.role) !== "SHOPKEEPER") return error(res, 404, "No verified shopkeeper account exists for that email. Ask them to create and verify a Shopkeeper account first.");
      const assignment = { id: id(), ownerId: arena.ownerId, arenaId: arena.id, shopkeeperId: shopkeeper.id, status: "ACTIVE", createdAt: now(), updatedAt: now() };
      await db.collection("shopkeeperAssignments").updateOne({ ownerId: assignment.ownerId, arenaId: assignment.arenaId, shopkeeperId: assignment.shopkeeperId }, { $set: { status: "ACTIVE", updatedAt: assignment.updatedAt }, $setOnInsert: assignment }, { upsert: true });
      res.status(201).json({ id: assignment.id, status: "ACTIVE", shopkeeper: { id: shopkeeper.id, fullName: shopkeeper.fullName, email: shopkeeper.email }, arena: { id: arena.id, name: arena.name } });
    } catch (cause) { next(cause); }
  });
  app.get("/api/shopkeeper/dashboard", async (req: ApiRequest, res, next) => {
    try {
      if (!requireRole(req, res, ["SHOPKEEPER"])) return;
      const db = await getMongoDatabase();
      const assignments = await db.collection("shopkeeperAssignments").find({ shopkeeperId: req.user.id, status: "ACTIVE" }).sort({ createdAt: -1 }).toArray();
      const arenaIds = assignments.map(item => item.arenaId);
      const ownerIds = assignments.map(item => item.ownerId);
      const [arenas, owners, payout] = await Promise.all([
        db.collection("arenas").find({ id: { $in: arenaIds } }).toArray(),
        db.collection("users").find({ id: { $in: ownerIds } }).toArray(),
        db.collection("payoutProfiles").findOne({ userId: req.user.id }),
      ]);
      const arenasById = new Map(arenas.map(item => [item.id, item]));
      const ownersById = new Map(owners.map(item => [item.id, item]));
      res.json({ assignments: assignments.map(assignment => { const arena = arenasById.get(assignment.arenaId); const owner = ownersById.get(assignment.ownerId); return { id: assignment.id, arena: arena ? { id: arena.id, name: arena.name, locality: arena.locality, city: arena.city } : null, owner: owner ? { fullName: owner.fullName, email: owner.email } : null }; }), payout: publicPayoutProfile(payout) });
    } catch (cause) { next(cause); }
  });
  app.get("/api/payments/payout-profile", async (req: ApiRequest, res, next) => {
    try {
      if (!requireRole(req, res, ["ARENA_OWNER", "SHOPKEEPER"])) return;
      const profile = await (await getMongoDatabase()).collection("payoutProfiles").findOne({ userId: req.user.id });
      res.json({ ...publicPayoutProfile(profile), platformConfigured: Boolean(razorpayKeys()), routeEnabled: process.env.RAZORPAY_ROUTE_ENABLED === "true" });
    } catch (cause) { next(cause); }
  });
  app.put("/api/payments/payout-profile", async (req: ApiRequest, res, next) => {
    try {
      if (!requireRole(req, res, ["ARENA_OWNER", "SHOPKEEPER"])) return;
      const razorpayLinkedAccountId = typeof req.body?.razorpayLinkedAccountId === "string" ? req.body.razorpayLinkedAccountId.trim() : "";
      if (!/^acc_[A-Za-z0-9]+$/.test(razorpayLinkedAccountId)) return error(res, 400, "Enter a valid Razorpay linked account ID (for example, acc_xxxxx). Complete KYC and bank details in Razorpay, not in ArenaHub.");
      const profile = { userId: req.user.id, role: req.user.role, razorpayLinkedAccountId, updatedAt: now() };
      await (await getMongoDatabase()).collection("payoutProfiles").updateOne({ userId: req.user.id }, { $set: profile, $setOnInsert: { id: id(), createdAt: now() } }, { upsert: true });
      res.json({ ...publicPayoutProfile(profile), platformConfigured: Boolean(razorpayKeys()), routeEnabled: process.env.RAZORPAY_ROUTE_ENABLED === "true" });
    } catch (cause) { next(cause); }
  });
  app.post("/api/payments/orders", async (req: ApiRequest, res, next) => {
    try {
      if (!requireRole(req, res, ["CUSTOMER"])) return;
      const arenaId = typeof req.body?.arenaId === "string" ? req.body.arenaId : "";
      const slotId = typeof req.body?.slotId === "string" ? req.body.slotId : "";
      if (!arenaId || !slotId) return error(res, 400, "Choose an approved arena and an available time slot before paying.");
      const db = await getMongoDatabase();
      await releaseExpiredPaymentSessions(db);
      const arena = await db.collection("arenas").findOne({ id: arenaId, verificationStatus: "APPROVED" });
      const slot = arena?.slots?.find((item: any) => item.id === slotId && item.status === "AVAILABLE");
      if (!arena || !slot) return error(res, 409, "That arena slot is no longer available. Refresh availability and choose another time.");
      const requestedEquipment = Array.isArray(req.body?.equipment) ? req.body.equipment : [];
      const equipment = requestedEquipment.map((item: any) => {
        const saved = arena.equipment?.find((candidate: any) => candidate.id === item?.id && candidate.active !== false);
        const quantity = Number(item?.quantity);
        if (!saved || !Number.isInteger(quantity) || quantity < 1 || quantity > Number(saved.availableStock ?? saved.stock ?? 0)) throw new Error("One of the requested equipment quantities is unavailable.");
        return { id: saved.id, name: saved.name, quantity, rentalPrice: toNumber(saved.rentalPrice) };
      });
      if (new Set(equipment.map((item: { id: string }) => item.id)).size !== equipment.length) return error(res, 400, "Each equipment item can only be added once.");
      const totalRupees = toNumber(slot.price) + equipment.reduce((total: number, item: any) => total + item.rentalPrice * item.quantity, 0);
      const amount = Math.round(totalRupees * 100);
      if (amount < 100) return error(res, 400, "The selected booking total must be at least ₹1.");
      const payout = await db.collection("payoutProfiles").findOne({ userId: arena.ownerId });
      const paymentId = id();
      const sessionExpiresAt = new Date(Date.now() + RAZORPAY_SESSION_TTL_MS).toISOString();

      // Atomically hold the selected slot first. This prevents a second
      // customer from opening a payment session for the same slot.
      const heldSlot = await db.collection("arenas").findOneAndUpdate(
        { id: arena.id, verificationStatus: "APPROVED", slots: { $elemMatch: { id: slot.id, status: "AVAILABLE" } } },
        { $set: { "slots.$.status": "HELD", updatedAt: now() } },
        { returnDocument: "after" }
      );
      if (!heldSlot) return error(res, 409, "That time slot was just selected by another customer. Please choose a different slot.");

      const reservedEquipment: Array<{ id: string; quantity: number }> = [];
      try {
        // Reserve every selected rental item. Each decrement is conditional so
        // a concurrent checkout cannot take stock below zero.
        for (const item of equipment) {
          const reserved = await db.collection("arenas").findOneAndUpdate(
            { id: arena.id, equipment: { $elemMatch: { id: item.id, active: { $ne: false }, availableStock: { $gte: item.quantity } } } },
            { $inc: { "equipment.$.availableStock": -item.quantity }, $set: { updatedAt: now() } },
            { returnDocument: "after" }
          );
          if (!reserved) throw new Error("One of the selected rental items was just reserved by another customer.");
          reservedEquipment.push({ id: item.id, quantity: item.quantity });
        }

        const order = await createRazorpayOrder({ amount, receipt: `ah_${paymentId.replaceAll("-", "").slice(0, 30)}`, notes: { payment_id: paymentId, arena_id: arena.id, purchaser_id: req.user.id }, linkedAccountId: payout?.razorpayLinkedAccountId });
        const payment = {
          id: paymentId,
          purchaserId: req.user.id,
          arenaId: arena.id,
          slotId: slot.id,
          equipment,
          amount,
          currency: "INR",
          razorpayOrderId: order.id,
          recipientOwnerId: arena.ownerId,
          routeTransferRequested: Boolean(payout?.razorpayLinkedAccountId && process.env.RAZORPAY_ROUTE_ENABLED === "true"),
          status: "PENDING",
          expiresAt: sessionExpiresAt,
          createdAt: now(),
          updatedAt: now(),
        };
        await db.collection("payments").insertOne(payment);
        res.status(201).json({ paymentId, orderId: order.id, amount: order.amount, currency: order.currency, keyId: razorpayKeys()?.keyId, name: "ArenaHub", description: `${arena.name} booking`, expiresAt: sessionExpiresAt });
      } catch (cause) {
        await releaseNewPaymentReservation(db, { arenaId: arena.id, slotId: slot.id, equipment: reservedEquipment });
        throw cause;
      }
    } catch (cause) { next(cause); }
  });
  app.post("/api/payments/verify", async (req: ApiRequest, res, next) => {
    try {
      if (!requireRole(req, res, ["CUSTOMER"])) return;
      const paymentId = typeof req.body?.paymentId === "string" ? req.body.paymentId : "";
      const orderId = typeof req.body?.razorpay_order_id === "string" ? req.body.razorpay_order_id : "";
      const razorpayPaymentId = typeof req.body?.razorpay_payment_id === "string" ? req.body.razorpay_payment_id : "";
      const signature = typeof req.body?.razorpay_signature === "string" ? req.body.razorpay_signature : "";
      const db = await getMongoDatabase();
      await releaseExpiredPaymentSessions(db);
      const payment = await db.collection("payments").findOne({ id: paymentId, purchaserId: req.user.id, status: "PENDING", expiresAt: { $gt: now() } });
      if (!payment || payment.razorpayOrderId !== orderId) return error(res, 404, "That pending payment session was not found.");
      if (!verifyRazorpaySignature(orderId, razorpayPaymentId, signature)) return error(res, 400, "Razorpay payment verification failed.");
      const confirmed = await db.collection("payments").updateOne(
        { id: payment.id, status: "PENDING", expiresAt: { $gt: now() } },
        { $set: { status: "PAID", razorpayPaymentId, paidAt: now(), updatedAt: now() } }
      );
      if (!confirmed.modifiedCount) return error(res, 409, "This payment session has already expired or been finalized.");
      await db.collection("arenas").updateOne(
        { id: payment.arenaId },
        { $set: { "slots.$[slot].status": "BOOKED", updatedAt: now() } },
        { arrayFilters: [{ "slot.id": payment.slotId, "slot.status": "HELD" }] }
      );
      res.json({ ok: true, paymentId: payment.id, status: "PAID" });
    } catch (cause) { next(cause); }
  });
  app.get("/api/profile/dashboard", async (req: ApiRequest, res, next) => { try { if (!requireUser(req, res)) return; const db = await getMongoDatabase(); const arenas = await db.collection("arenas").find({ ownerId: req.user.id }).sort({ updatedAt: -1 }).toArray(); const reviewQueue = req.user.role === "ADMIN" ? await db.collection("arenas").countDocuments({ verificationStatus: { $in: ["PENDING_REVIEW", "UNDER_REVIEW"] } }) : 0; const members = req.user.role === "ADMIN" ? await db.collection("users").countDocuments() : 0; const decisions = req.user.role === "ADMIN" ? await db.collection("arenas").countDocuments({ "history.actor_id": req.user.id }) : 0; res.json({ profile: { full_name: req.user.fullName, email: req.user.email, phone: null, avatar_path: null, role: req.user.role, created_at: (await db.collection("users").findOne({ id: req.user.id }))?.createdAt }, arenas: arenas.map(normalizeArena), stats: { bookings: 0, rentals: 0, registrations: 0, favorites: 0, notifications: 0, reviewQueue, members, decisions } }); } catch (cause) { next(cause); } });
  app.use((cause: unknown, _req: Request, res: Response, _next: NextFunction) => { console.error("[API]", cause); const message = cause instanceof Error ? cause.message : "Unexpected server error."; error(res, 500, message); });
}
