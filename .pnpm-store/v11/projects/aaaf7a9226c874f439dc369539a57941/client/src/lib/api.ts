export type AccountType = "CUSTOMER" | "ARENA_OWNER" | "SHOPKEEPER";
export type ApiUser = { id: string; email: string; fullName: string; role: AccountType | "ADMIN" };
export type PayoutProfile = { configured: boolean; razorpayLinkedAccountId: string | null; updatedAt: string | null; platformConfigured: boolean; routeEnabled: boolean };
export type ShopkeeperAssignment = { id: string; status: string; createdAt: string; shopkeeper: { id: string; fullName: string; email: string } | null; arena: { id: string; name: string; locality?: string; city?: string } | null; payout: Pick<PayoutProfile, "configured" | "razorpayLinkedAccountId" | "updatedAt"> };

export class ApiError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

async function request<T>(url: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(url, {
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", ...(init.headers ?? {}) },
    ...init,
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new ApiError(body.error || "Request failed.", response.status);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

async function fileToUpload(file?: File) {
  if (!file) return undefined;
  if (file.size > 10 * 1024 * 1024) throw new ApiError(`${file.name} is larger than 10 MB.`, 400);
  return { name: file.name, type: file.type, data: await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onerror = () => reject(new ApiError(`Unable to read ${file.name}.`, 400)); reader.onload = () => resolve(String(reader.result)); reader.readAsDataURL(file); }) };
}

export const api = {
  me: () => request<{ user: ApiUser | null }>("/api/auth/me"),
  register: (fullName: string, email: string, password: string, accountType: AccountType) => request<{ message: string; developmentOtp?: string }>("/api/auth/register", { method: "POST", body: JSON.stringify({ fullName, email, password, accountType }) }),
  verifyEmail: (email: string, code: string) => request<{ user: ApiUser }>("/api/auth/verify-email", { method: "POST", body: JSON.stringify({ email, code }) }),
  resendEmailVerification: (email: string) => request<{ message: string; developmentOtp?: string }>("/api/auth/resend-email-verification", { method: "POST", body: JSON.stringify({ email }) }),
  login: (email: string, password: string, accountType: AccountType) => request<{ user: ApiUser }>("/api/auth/login", { method: "POST", body: JSON.stringify({ email, password, accountType }) }),
  logout: () => request<void>("/api/auth/logout", { method: "POST" }),
  passwordReset: (email: string) => request<{ message: string }>("/api/auth/password-reset", { method: "POST", body: JSON.stringify({ email }) }),
  sports: () => request<Array<{ id: string; name: string }>>("/api/sports"),
  approvedArenas: () => request<any[]>("/api/arenas"),
  arena: (id: string) => request<any>(`/api/arenas/${encodeURIComponent(id)}`),
  myArenas: () => request<any[]>("/api/arenas/mine"),
  adminArenas: () => request<any[]>("/api/arenas/admin"),
  managedArena: (id: string) => request<any>(`/api/arenas/${encodeURIComponent(id)}/manage`),
  saveArena: async (payload: { id?: string; arena: Record<string, unknown>; sports: string[]; courts: unknown[]; equipment: unknown[]; images: File[]; document?: File }) => request<any>("/api/arenas", { method: "POST", body: JSON.stringify({ id: payload.id, arena: payload.arena, sports: payload.sports, courts: payload.courts, equipment: payload.equipment, images: await Promise.all(payload.images.map(fileToUpload)), document: await fileToUpload(payload.document) }) }),
  submitArena: (id: string) => request<{ ok: true }>(`/api/arenas/${encodeURIComponent(id)}/submit`, { method: "POST" }),
  transitionArena: (id: string, status: string, reason: string, checklist: Record<string, boolean>) => request<{ ok: true }>(`/api/arenas/${encodeURIComponent(id)}/status`, { method: "POST", body: JSON.stringify({ status, reason, checklist }) }),
  addSlot: (arenaId: string, input: unknown) => request(`/api/arenas/${encodeURIComponent(arenaId)}/slots`, { method: "POST", body: JSON.stringify(input) }),
  updateSlot: (arenaId: string, slotId: string, input: unknown) => request(`/api/arenas/${encodeURIComponent(arenaId)}/slots/${encodeURIComponent(slotId)}`, { method: "PUT", body: JSON.stringify(input) }),
  removeSlot: (arenaId: string, slotId: string) => request<void>(`/api/arenas/${encodeURIComponent(arenaId)}/slots/${encodeURIComponent(slotId)}`, { method: "DELETE" }),
  ownerShopkeepers: () => request<ShopkeeperAssignment[]>("/api/owner/shopkeepers"),
  addOwnerShopkeeper: (email: string, arenaId: string) => request<{ id: string; status: string }>("/api/owner/shopkeepers", { method: "POST", body: JSON.stringify({ email, arenaId }) }),
  shopkeeperDashboard: () => request<{ assignments: Array<{ id: string; arena: { id: string; name: string; locality?: string; city?: string } | null; owner: { fullName: string; email: string } | null }>; payout: Pick<PayoutProfile, "configured" | "razorpayLinkedAccountId" | "updatedAt"> }>("/api/shopkeeper/dashboard"),
  payoutProfile: () => request<PayoutProfile>("/api/payments/payout-profile"),
  savePayoutProfile: (razorpayLinkedAccountId: string) => request<PayoutProfile>("/api/payments/payout-profile", { method: "PUT", body: JSON.stringify({ razorpayLinkedAccountId }) }),
  createPaymentOrder: (input: { arenaId: string; slotId: string; equipment: Array<{ id: string; quantity: number }> }) => request<{ paymentId: string; orderId: string; amount: number; currency: string; keyId?: string; name: string; description: string; expiresAt: string }>("/api/payments/orders", { method: "POST", body: JSON.stringify(input) }),
  verifyPayment: (input: { paymentId: string; razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => request<{ ok: true; paymentId: string; status: "PAID" }>("/api/payments/verify", { method: "POST", body: JSON.stringify(input) }),
  profileDashboard: () => request<any>("/api/profile/dashboard"),
};
