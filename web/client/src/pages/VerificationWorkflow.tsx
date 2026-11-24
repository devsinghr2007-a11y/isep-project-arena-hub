import React, { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { AlertCircle, ArrowLeft, ArrowUpRight, BadgeCheck, Check, ChevronRight, ClipboardCheck, Crosshair, FileText, FileWarning, LoaderCircle, MapPin, ShieldCheck, Store, UploadCloud, X } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { buildCoordinateMapUrl, requestCurrentCoordinates } from "@/lib/arenaLocation";
import "@/styles/location-actions.css";

export type Role = "CUSTOMER" | "ARENA_OWNER" | "SHOPKEEPER" | "ADMIN";
type Status = "DRAFT" | "PENDING_REVIEW" | "UNDER_REVIEW" | "CHANGES_REQUESTED" | "APPROVED" | "REJECTED" | "SUSPENDED";
type Sport = { id: string; name: string };
type Court = { name: string; sportId: string; hourlyPrice: string; capacity: string; indoor: boolean };
type Equipment = { name: string; stock: string; rentalPrice: string };
type Day = { enabled: boolean; open: string; close: string };
type Arena = Record<string, any>;

const STATUS_COPY: Record<Status, { title: string; detail: string; tone: string }> = {
  DRAFT: { title: "Complete your application", detail: "Finish the required owner, venue, business, court, operating, media, and document fields before submission.", tone: "muted" },
  PENDING_REVIEW: { title: "Waiting for admin verification", detail: "Your arena has been submitted and is waiting for the secure ArenaHub review queue.", tone: "pending" },
  UNDER_REVIEW: { title: "Verification is in progress", detail: "The designated ArenaHub administrator is reviewing the complete submission.", tone: "review" },
  CHANGES_REQUESTED: { title: "Changes are required", detail: "Review the administrator’s note, correct the requested sections, then resubmit securely.", tone: "warning" },
  APPROVED: { title: "Your arena is verified and live", detail: "Only now can new public discovery and commerce activity take place for the arena.", tone: "approved" },
  REJECTED: { title: "Your submission was rejected", detail: "Read the verification reason, correct the application if appropriate, and submit again.", tone: "danger" },
  SUSPENDED: { title: "Your arena is suspended", detail: "New bookings, rentals, event registrations, and orders are blocked until the restriction is resolved.", tone: "danger" },
};
const CHECKLIST = [
  ["owner_information", "Owner information reviewed"], ["contact_information", "Contact information reviewed"], ["arena_name", "Arena name reviewed"], ["sports", "Sports verified"], ["courts", "Court or ground information reviewed"], ["location", "Location reviewed"], ["google_maps_location", "Google Maps location checked"], ["operating_hours", "Operating hours reviewed"], ["pricing", "Pricing reviewed"], ["amenities", "Amenities reviewed"], ["images", "Images reviewed"], ["equipment", "Equipment reviewed"], ["required_information", "Required information completed"], ["duplicate_check", "No obvious duplicate submission"], ["arena_valid", "Arena information appears valid"],
] as const;
const dayNames = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const defaultSchedule = (): Record<string, Day> => Object.fromEntries(dayNames.map((day) => [day, { enabled: true, open: "06:00", close: "22:00" }]));
const initialForm = (email = "") => ({ ownerName: "", ownerEmail: email, ownerPhone: "", businessName: "", businessRegistrationNumber: "", name: "", description: "", address: "", locality: "", city: "Bengaluru", state: "Karnataka", pinCode: "", mapUrl: "", latitude: "", longitude: "", amenities: "Parking, Changing rooms" });
const slug = (value: string) => value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
const badge = (status: Status) => <span className={`verification-status ${STATUS_COPY[status].tone}`}>{status.replaceAll("_", " ")}</span>;

export function useSecureProfile() {
  const [state, setState] = useState<{ loading: boolean; id?: string; email?: string; role?: Role }>({ loading: true });
  useEffect(() => {
    let live = true;
    const load = async () => {
      try { const { user } = await api.me(); if (live) setState(user ? { loading: false, id: user.id, email: user.email, role: user.role } : { loading: false }); }
      catch { if (live) setState({ loading: false }); }
    };
    void load();
    return () => { live = false; };
  }, []);
  return state;
}

export function SecureGate({ roles, children }: { roles: Role[]; children: React.ReactNode }) {
  const [, navigate] = useLocation();
  const profile = useSecureProfile();
  if (profile.loading) return <main className="verification-page"><div className="verification-loading"><LoaderCircle className="spin" /> Loading secure workspace…</div></main>;
  if (!profile.id) return <main className="verification-page"><div className="access-card"><ShieldCheck size={30} /><h1>Sign in to continue</h1><p>This protected workspace is associated with your authenticated ArenaHub account.</p><button className="primary-button" onClick={() => navigate("/login")}>Sign in <ArrowUpRight size={16} /></button></div></main>;
  if (!profile.role || !roles.includes(profile.role)) return <main className="verification-page"><div className="access-card"><FileWarning size={30} /><h1>Access restricted</h1><p>Your account does not permit this workspace. The same role rule is enforced by the MongoDB API.</p><button className="secondary-button" onClick={() => navigate("/dashboard")}>Return to my dashboard <ArrowLeft size={16} /></button></div></main>;
  return <>{children}</>;
}

function Field({ label, error, children, required = false }: { label: string; error?: string; children: React.ReactNode; required?: boolean }) {
  return <label className="field-label"><span>{label}{required && <b> *</b>}</span>{children}{error && <small className="field-error"><AlertCircle size={13} />{error}</small>}</label>;
}

function validate(form: ReturnType<typeof initialForm>, selectedSports: string[], courts: Court[], equipment: Equipment[], schedule: Record<string, Day>, imageCount: number, hasDocument: boolean) {
  const errors: Record<string, string> = {};
  if (!form.ownerName.trim()) errors.ownerName = "Owner name is required.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.ownerEmail.trim())) errors.ownerEmail = "Enter a valid email address.";
  if (!/^\+?[1-9][0-9]{9,14}$/.test(form.ownerPhone.trim())) errors.ownerPhone = "Enter a valid phone number.";
  if (!form.businessName.trim()) errors.businessName = "Business name is required.";
  if (!form.businessRegistrationNumber.trim()) errors.businessRegistrationNumber = "Business registration number is required.";
  if (!form.name.trim()) errors.name = "Arena name is required.";
  if (!form.description.trim()) errors.description = "Arena description is required.";
  if (!form.address.trim() || !form.locality.trim() || !form.city.trim()) errors.address = "Complete the address, locality, and city.";
  if (!/^[1-9][0-9]{5}$/.test(form.pinCode)) errors.pinCode = "Enter a six-digit Indian PIN code.";
  if (form.mapUrl && !/^https?:\/\//.test(form.mapUrl)) errors.mapUrl = "Google Maps URL must start with http:// or https://.";
  if (form.latitude && (Number(form.latitude) < -90 || Number(form.latitude) > 90)) errors.latitude = "Latitude must be between -90 and 90.";
  if (form.longitude && (Number(form.longitude) < -180 || Number(form.longitude) > 180)) errors.longitude = "Longitude must be between -180 and 180.";
  if (!selectedSports.length) errors.sports = "Select at least one sport.";
  if (!courts.length || courts.some((court) => !court.name.trim() || !court.sportId || Number(court.hourlyPrice) < 0 || Number(court.capacity) < 1)) errors.courts = "Add at least one valid court with sport, hourly price, and capacity.";
  if (!Object.values(schedule).some((day) => day.enabled) || Object.values(schedule).some((day) => day.enabled && (!day.open || !day.close || day.open >= day.close))) errors.schedule = "Each open day needs a valid opening and closing time.";
  if (equipment.some((item) => !item.name.trim() || Number(item.stock) < 0 || Number(item.rentalPrice) < 0)) errors.equipment = "Each equipment item requires a name and non-negative stock and price.";
  if (!imageCount) errors.images = "Upload at least one venue image.";
  if (!hasDocument) errors.document = "Upload the required business or verification document.";
  return errors;
}

export function ArenaRegistrationWorkflow() {
  const [location, navigate] = useLocation();
  const profile = useSecureProfile();
  const requestedArenaId = useMemo(() => new URLSearchParams(location.split("?")[1] ?? "").get("arena") ?? "", [location]);
  const [step, setStep] = useState(0);
  const [form, setForm] = useState(() => initialForm());
  const [sports, setSports] = useState<Sport[]>([]);
  const [selectedSports, setSelectedSports] = useState<string[]>([]);
  const [courts, setCourts] = useState<Court[]>([]);
  const [equipment, setEquipment] = useState<Equipment[]>([{ name: "", stock: "0", rentalPrice: "0" }]);
  const [schedule, setSchedule] = useState(defaultSchedule);
  const [images, setImages] = useState<File[]>([]);
  const [imageCount, setImageCount] = useState(0);
  const [document, setDocument] = useState<File>();
  const [documentPath, setDocumentPath] = useState("");
  const [arenaId, setArenaId] = useState<string>();
  const [confirm, setConfirm] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const steps = ["Owner & business", "Arena & location", "Sports & courts", "Operations & assets", "Review"];
  useEffect(() => { setForm((value) => ({ ...value, ownerEmail: value.ownerEmail || profile.email || "" })); }, [profile.email]);
  useEffect(() => { void api.sports().then(setSports).catch((cause: Error) => toast.error(cause.message)); }, []);
  useEffect(() => {
    if (!profile.id) return;
    void api.myArenas().then((arenas) => {
      const data = requestedArenaId ? arenas.find((item: any) => item.id === requestedArenaId) : arenas.find((item: any) => ["DRAFT", "CHANGES_REQUESTED", "REJECTED"].includes(item.verification_status));
      if (!data) return;
      const arena = data as Arena;
      setArenaId(arena.id); setDocumentPath(arena.verification_document_path ?? "");
      setForm({ ownerName: arena.owner_name ?? "", ownerEmail: arena.owner_email ?? profile.email ?? "", ownerPhone: arena.owner_phone ?? "", businessName: arena.business_name ?? "", businessRegistrationNumber: arena.business_registration_number ?? "", name: arena.name ?? "", description: arena.description ?? "", address: arena.address ?? "", locality: arena.locality ?? "", city: arena.city ?? "Bengaluru", state: arena.state ?? "Karnataka", pinCode: arena.pin_code ?? "", mapUrl: arena.google_maps_url ?? "", latitude: arena.latitude?.toString?.() ?? "", longitude: arena.longitude?.toString?.() ?? "", amenities: (arena.amenities ?? []).join(", ") });
      if (arena.weekly_schedule && Object.keys(arena.weekly_schedule).length) setSchedule(arena.weekly_schedule);
      setSelectedSports((arena.arena_sports ?? []).map((item: any) => item.sport_id));
      setCourts((arena.arena_courts ?? []).map((item: any) => ({ name: item.name, sportId: item.sport_id, hourlyPrice: String(item.hourly_price), capacity: String(item.capacity), indoor: item.indoor })));
      if (arena.equipment?.length) setEquipment(arena.equipment.map((item: any) => ({ name: item.name, stock: String(item.stock), rentalPrice: String(item.rental_price) })));
      setImageCount(arena.arena_images?.length ?? 0);
    }).catch((cause: Error) => toast.error(cause.message));
  }, [profile.id, profile.email, requestedArenaId]);
  useEffect(() => {
    if (step !== 1) return;
    const workspace = globalThis.document.querySelector(".verification-form");
    const grid = workspace?.querySelector(".form-grid");
    if (!workspace || !grid || workspace.querySelector("[data-location-capture]")) return;
    const capture = globalThis.document.createElement("div");
    const copy = globalThis.document.createElement("p");
    const strong = globalThis.document.createElement("strong");
    const button = globalThis.document.createElement("button");
    capture.className = "location-capture";
    capture.dataset.locationCapture = "true";
    strong.textContent = "Use your current location";
    copy.append(strong, globalThis.document.createTextNode("We add precise coordinates and a map link only. Review the address, locality, and PIN before saving."));
    button.type = "button";
    button.className = "secondary-button";
    button.textContent = "Use current location";
    const captureLocation = async () => {
      button.disabled = true;
      button.textContent = "Locating…";
      try {
        const coordinates = await requestCurrentCoordinates();
        setForm((current) => ({ ...current, latitude: coordinates.latitude.toFixed(6), longitude: coordinates.longitude.toFixed(6), mapUrl: buildCoordinateMapUrl(coordinates) }));
        setErrors((current) => ({ ...current, latitude: "", longitude: "", mapUrl: "" }));
        toast.success("Current location added", { description: "Review the address, locality, and PIN before saving your arena." });
      } catch (locationError) {
        toast.error(locationError instanceof Error ? locationError.message : "Unable to use your current location.");
      } finally {
        button.disabled = false;
        button.textContent = "Use current location";
      }
    };
    button.addEventListener("click", captureLocation);
    capture.append(copy, button);
    workspace.insertBefore(capture, grid);
    return () => { button.removeEventListener("click", captureLocation); capture.remove(); };
  }, [step]);
  const problems = useMemo(() => validate(form, selectedSports, courts, equipment, schedule, images.length + imageCount, Boolean(document || documentPath)), [form, selectedSports, courts, equipment, schedule, images.length, imageCount, document, documentPath]);
  const change = (key: keyof ReturnType<typeof initialForm>, value: string) => setForm((current) => ({ ...current, [key]: value }));
  const updateCourt = (index: number, patch: Partial<Court>) => setCourts((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item));
  const updateEquipment = (index: number, patch: Partial<Equipment>) => setEquipment((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item));
  const stageValid = [!["ownerName", "ownerEmail", "ownerPhone", "businessName", "businessRegistrationNumber"].some((key) => problems[key]), !["name", "description", "address", "pinCode", "mapUrl", "latitude", "longitude"].some((key) => problems[key]), !problems.sports && !problems.courts, !problems.schedule && !problems.equipment && !problems.images && !problems.document, Object.keys(problems).length === 0 && confirm][step];
  async function save(submit: boolean) {
    if (!profile.id) { toast.error("Sign in before saving an arena."); return; }
    if (submit && Object.keys(problems).length) { setErrors(problems); setStep(4); toast.error("Resolve the required fields before submission."); return; }
    if (submit && !confirm) { toast.error("Confirm that the information is accurate before submission."); return; }
    setSaving(true);
    try {
      const saved = await api.saveArena({ id: arenaId, arena: { ownerName: form.ownerName.trim(), ownerEmail: form.ownerEmail.trim(), ownerPhone: form.ownerPhone.trim(), businessName: form.businessName.trim(), businessRegistrationNumber: form.businessRegistrationNumber.trim(), name: form.name.trim(), slug: slug(form.name), description: form.description.trim(), address: form.address.trim(), locality: form.locality.trim(), city: form.city.trim(), state: form.state.trim(), pinCode: form.pinCode.trim(), googleMapsUrl: form.mapUrl.trim() || null, latitude: form.latitude ? Number(form.latitude) : null, longitude: form.longitude ? Number(form.longitude) : null, openingTime: schedule.Monday.open, closingTime: schedule.Monday.close, weeklySchedule: schedule, amenities: form.amenities.split(",").map((value) => value.trim()).filter(Boolean) }, sports: selectedSports, courts, equipment, images, document });
      setArenaId(saved.id); setDocumentPath(saved.verification_document_path ?? documentPath); setImageCount(saved.arena_images?.length ?? imageCount);
      if (submit) { await api.submitArena(saved.id); toast.success("Arena submitted for verification"); navigate("/owner/dashboard"); } else toast.success("Application draft saved");
    } catch (cause) { toast.error(cause instanceof Error ? cause.message : "Unable to save the arena application."); }
    finally { setSaving(false); }
  }
  if (profile.loading) return <main className="verification-page"><div className="verification-loading"><LoaderCircle className="spin" /> Preparing application…</div></main>;
  if (!profile.id) return <main className="verification-page"><div className="access-card"><ShieldCheck size={30} /><h1>Sign in to register an arena</h1><p>A secure arena application must be associated with an authenticated account.</p><button className="primary-button" onClick={() => navigate("/login")}>Sign in <ArrowUpRight size={16} /></button></div></main>;
  return <main className="verification-page"><section className="verification-rail"><button className="brand-return" onClick={() => navigate("/")}>ARENA<span>HUB</span></button><p>OWNER APPLICATION</p><h1>Build your<br /><em>home ground.</em></h1><div className="workflow-steps">{steps.map((label, index) => <button key={label} className={index === step ? "active" : index < step ? "done" : ""} onClick={() => index <= step && setStep(index)}><span>{index < step ? <Check size={14} /> : String(index + 1).padStart(2, "0")}</span>{label}</button>)}</div></section><section className="verification-workspace"><header className="verification-header"><div><span>STEP {String(step + 1).padStart(2, "0")} / 05</span><h2>{steps[step]}</h2></div><button className="text-button" disabled={saving} onClick={() => void save(false)}>Save draft</button></header><div className="verification-form">{step === 0 && <><p className="form-intro">The owner and business details below are included in the administrator’s protected verification packet.</p><div className="form-grid"><Field label="Owner name" required error={errors.ownerName}><input value={form.ownerName} onChange={(event) => change("ownerName", event.target.value)} /></Field><Field label="Owner email" required error={errors.ownerEmail}><input type="email" value={form.ownerEmail} onChange={(event) => change("ownerEmail", event.target.value)} /></Field><Field label="Owner phone" required error={errors.ownerPhone}><input value={form.ownerPhone} onChange={(event) => change("ownerPhone", event.target.value)} placeholder="+91 9876543210" /></Field><Field label="Business name" required error={errors.businessName}><input value={form.businessName} onChange={(event) => change("businessName", event.target.value)} /></Field><Field label="Business registration number" required error={errors.businessRegistrationNumber}><input value={form.businessRegistrationNumber} onChange={(event) => change("businessRegistrationNumber", event.target.value)} /></Field></div></>}{step === 1 && <><p className="form-intro">Location and Google Maps details are reviewed before an arena can become publicly discoverable.</p><div className="form-grid"><Field label="Arena name" required error={errors.name}><input value={form.name} onChange={(event) => change("name", event.target.value)} /></Field><Field label="Arena description" required error={errors.description}><textarea rows={4} value={form.description} onChange={(event) => change("description", event.target.value)} /></Field><Field label="Address" required error={errors.address}><textarea rows={3} value={form.address} onChange={(event) => change("address", event.target.value)} /></Field><Field label="Locality" required><input value={form.locality} onChange={(event) => change("locality", event.target.value)} /></Field><Field label="City" required><input value={form.city} onChange={(event) => change("city", event.target.value)} /></Field><Field label="State" required><input value={form.state} onChange={(event) => change("state", event.target.value)} /></Field><Field label="PIN code" required error={errors.pinCode}><input value={form.pinCode} onChange={(event) => change("pinCode", event.target.value)} /></Field><Field label="Google Maps URL" error={errors.mapUrl}><input value={form.mapUrl} onChange={(event) => change("mapUrl", event.target.value)} placeholder="https://maps.google.com/..." /></Field><Field label="Latitude" error={errors.latitude}><input value={form.latitude} onChange={(event) => change("latitude", event.target.value)} /></Field><Field label="Longitude" error={errors.longitude}><input value={form.longitude} onChange={(event) => change("longitude", event.target.value)} /></Field></div></>}{step === 2 && <><p className="form-intro">Configure every sport and court. Each court has its own required hourly price.</p><div className="sport-picker">{sports.map((sport) => <button key={sport.id} className={selectedSports.includes(sport.id) ? "selected" : ""} onClick={() => setSelectedSports((current) => current.includes(sport.id) ? current.filter((id) => id !== sport.id) : [...current, sport.id])}>{selectedSports.includes(sport.id) && <Check size={15} />}{sport.name}</button>)}</div>{errors.sports && <small className="field-error"><AlertCircle size={13} />{errors.sports}</small>}<div className="section-divider"><span>COURTS & GROUNDS</span></div>{courts.map((court, index) => <div className="court-editor" key={index}><Field label="Court name" required><input value={court.name} onChange={(event) => updateCourt(index, { name: event.target.value })} /></Field><Field label="Sport" required><select value={court.sportId} onChange={(event) => updateCourt(index, { sportId: event.target.value })}><option value="">Select sport</option>{sports.filter((sport) => selectedSports.includes(sport.id)).map((sport) => <option key={sport.id} value={sport.id}>{sport.name}</option>)}</select></Field><Field label="Hourly price" required><input type="number" min="0" value={court.hourlyPrice} onChange={(event) => updateCourt(index, { hourlyPrice: event.target.value })} /></Field><Field label="Capacity" required><input type="number" min="1" value={court.capacity} onChange={(event) => updateCourt(index, { capacity: event.target.value })} /></Field><label className="toggle-field"><input type="checkbox" checked={court.indoor} onChange={(event) => updateCourt(index, { indoor: event.target.checked })} /> Indoor court</label><button className="icon-remove" onClick={() => setCourts((current) => current.filter((_, itemIndex) => itemIndex !== index))}><X size={16} /></button></div>)}<button className="secondary-button" onClick={() => setCourts((current) => [...current, { name: "", sportId: selectedSports[0] ?? "", hourlyPrice: "0", capacity: "1", indoor: false }])}>Add court <ChevronRight size={15} /></button>{errors.courts && <small className="field-error"><AlertCircle size={13} />{errors.courts}</small>}</>}{step === 3 && <><p className="form-intro">Set weekly operating times, equipment inventory, images, and the required business or verification document.</p><div className="schedule-grid">{dayNames.map((day) => <div key={day}><label><input type="checkbox" checked={schedule[day].enabled} onChange={(event) => setSchedule((current) => ({ ...current, [day]: { ...current[day], enabled: event.target.checked } }))} /> {day}</label><input type="time" disabled={!schedule[day].enabled} value={schedule[day].open} onChange={(event) => setSchedule((current) => ({ ...current, [day]: { ...current[day], open: event.target.value } }))} /><input type="time" disabled={!schedule[day].enabled} value={schedule[day].close} onChange={(event) => setSchedule((current) => ({ ...current, [day]: { ...current[day], close: event.target.value } }))} /></div>)}</div>{errors.schedule && <small className="field-error"><AlertCircle size={13} />{errors.schedule}</small>}<Field label="Amenities"><input value={form.amenities} onChange={(event) => change("amenities", event.target.value)} /></Field><div className="section-divider"><span>EQUIPMENT INVENTORY</span></div>{equipment.map((item, index) => <div className="equipment-editor" key={index}><Field label="Equipment name"><input value={item.name} onChange={(event) => updateEquipment(index, { name: event.target.value })} /></Field><Field label="Stock"><input type="number" min="0" value={item.stock} onChange={(event) => updateEquipment(index, { stock: event.target.value })} /></Field><Field label="Rental price"><input type="number" min="0" value={item.rentalPrice} onChange={(event) => updateEquipment(index, { rentalPrice: event.target.value })} /></Field><button className="icon-remove" onClick={() => setEquipment((current) => current.filter((_, itemIndex) => itemIndex !== index))}><X size={16} /></button></div>)}<button className="secondary-button" onClick={() => setEquipment((current) => [...current, { name: "", stock: "0", rentalPrice: "0" }])}>Add equipment <ChevronRight size={15} /></button>{errors.equipment && <small className="field-error"><AlertCircle size={13} />{errors.equipment}</small>}<div className="upload-pair"><label className="upload-zone"><UploadCloud size={23} /><span>Upload arena images</span><small>At least one JPEG, PNG, or WEBP venue image is required.</small><input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={(event) => setImages(Array.from(event.target.files ?? []))} /></label><label className="upload-zone"><FileText size={23} /><span>Upload verification document</span><small>Business registration or a required verification document.</small><input type="file" accept="application/pdf,image/jpeg,image/png" onChange={(event) => setDocument(event.target.files?.[0])} /></label></div><p className="file-summary">{images.length + imageCount} image(s) available · {document || documentPath ? "Verification document attached" : "Verification document required"}</p>{(errors.images || errors.document) && <small className="field-error"><AlertCircle size={13} />{errors.images || errors.document}</small>}</>}{step === 4 && <><p className="form-intro">Review every submitted detail before it enters the protected verification queue.</p><div className="review-grid"><section><span>OWNER & BUSINESS</span><b>{form.ownerName || "Missing owner"}</b><p>{form.ownerEmail}<br />{form.ownerPhone}<br />{form.businessName} · {form.businessRegistrationNumber}</p></section><section><span>ARENA</span><b>{form.name || "Missing arena name"}</b><p>{form.description || "Missing description"}</p></section><section><span>LOCATION</span><b>{form.locality}, {form.city}</b><p>{form.address}<br />PIN {form.pinCode}<br />{form.mapUrl || "No Google Maps URL"}</p></section><section><span>SPORTS & COURTS</span><b>{selectedSports.length} sport(s) · {courts.length} court(s)</b><p>{courts.map((court) => `${court.name || "Unnamed court"} · ₹${court.hourlyPrice || "0"}/hour`).join(" · ")}</p></section><section><span>OPERATIONS</span><b>{dayNames.filter((day) => schedule[day].enabled).length} open day(s)</b><p>{form.amenities || "No amenities listed"}</p></section><section><span>ASSETS & EQUIPMENT</span><b>{images.length + imageCount} venue image(s)</b><p>{equipment.filter((item) => item.name).map((item) => item.name).join(", ") || "No equipment item"}<br />{document || documentPath ? "Verification document attached" : "Document missing"}</p></section></div>{Object.keys(problems).length > 0 && <div className="review-alert"><AlertCircle size={18} /><span>Some required information remains incomplete. Return to the highlighted step before submitting.</span></div>}<label className="confirmation-check"><input type="checkbox" checked={confirm} onChange={(event) => setConfirm(event.target.checked)} />I confirm that the information provided is accurate.</label></>}</div><footer className="workflow-actions"><button className="secondary-button" disabled={step === 0 || saving} onClick={() => setStep((current) => Math.max(0, current - 1))}>Back</button>{step < 4 ? <button className="primary-button" disabled={!stageValid || saving} onClick={() => { setErrors(problems); if (stageValid) setStep((current) => current + 1); }}>Continue <ArrowUpRight size={16} /></button> : <button className="primary-button" disabled={!stageValid || saving} onClick={() => void save(true)}>{saving ? "Submitting…" : "Submit for verification"}<ShieldCheck size={16} /></button>}</footer></section></main>;
}

function AdminReview({ arena, close, reload }: { arena: Arena; close: () => void; reload: () => void }) {
  const [checklist, setChecklist] = useState<Record<string, boolean>>({});
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [details, setDetails] = useState<{ sports: any[]; courts: any[]; images: any[]; equipment: any[]; events: any[]; products: any[]; history: any[] }>({ sports: [], courts: [], images: [], equipment: [], events: [], products: [], history: [] });
  useEffect(() => { void api.managedArena(arena.id).then((value) => setDetails({ sports: value.arena_sports ?? [], courts: value.arena_courts ?? [], images: value.arena_images ?? [], equipment: value.equipment ?? [], events: value.events ?? [], products: value.products ?? [], history: value.arena_verification_history ?? [] })).catch((cause: Error) => toast.error(cause.message)); }, [arena.id]);
  const act = async (status: Status) => { setBusy(true); try { await api.transitionArena(arena.id, status, reason, checklist); toast.success(`Arena ${status.toLowerCase().replaceAll("_", " ")}`); reload(); close(); } catch (cause) { toast.error(cause instanceof Error ? cause.message : "Unable to update verification status."); } finally { setBusy(false); } };
  const complete = CHECKLIST.every(([key]) => checklist[key]);
  return <aside className="arena-review-drawer"><header><div><span>COMPLETE VERIFICATION REVIEW</span><h2>{arena.name}</h2>{badge(arena.verification_status as Status)}</div><button className="icon-remove" onClick={close}><X size={18} /></button></header><div className="review-scroll"><section className="admin-detail-grid"><article><span>OWNER & BUSINESS</span><b>{arena.owner_name}</b><p>{arena.owner_email}<br />{arena.owner_phone}<br />{arena.business_name}<br />{arena.business_registration_number}<br />{arena.verification_document_path ? "Document attached" : "No document"}</p></article><article><span>ARENA & LOCATION</span><b>{arena.name}</b><p>{arena.description}<br />{arena.address}, {arena.locality}, {arena.city}<br />PIN {arena.pin_code}<br />{arena.google_maps_url || "No Maps URL"}</p></article><article><span>SPORTS & COURTS</span><b>{details.sports.map((item: any) => item.sports?.name).join(", ") || "No sports"}</b><p>{details.courts.map((item) => `${item.name} · ₹${item.hourly_price}/hour · ${item.capacity} capacity`).join("\n") || "No courts"}</p></article><article><span>OPERATIONS & AMENITIES</span><b>{arena.opening_time?.slice?.(0, 5)}–{arena.closing_time?.slice?.(0, 5)}</b><p>{(arena.amenities ?? []).join(", ") || "No amenities"}</p></article><article><span>IMAGES & EQUIPMENT</span><b>{details.images.length} image(s)</b><p>{details.equipment.map((item) => `${item.name} · ${item.stock} stock · ₹${item.rental_price}`).join("\n") || "No equipment"}</p></article><article><span>EVENTS & PRODUCTS</span><b>{details.events.length} event(s) · {details.products.length} product(s)</b><p>{details.events.map((item) => `${item.title} · ${item.status}`).join("\n") || "No events"}<br />{details.products.map((item) => `${item.name} · ₹${item.price} · ${item.stock} stock`).join("\n") || "No products"}</p></article></section><section className="review-checklist"><div><ClipboardCheck size={20} /><h3>Required approval checklist</h3></div>{CHECKLIST.map(([key, label]) => <label key={key}><input type="checkbox" checked={!!checklist[key]} onChange={(event) => setChecklist((current) => ({ ...current, [key]: event.target.checked }))} />{label}</label>)}</section><label className="review-reason">Administrator reason or request<textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={4} placeholder="Required for requested changes, rejection, or suspension." /></label><section className="history-list"><h3>Verification history</h3>{details.history.length ? details.history.map((item) => <article key={item.id}><b>{item.action.replaceAll("_", " ")}</b><span>{new Date(item.created_at).toLocaleString()}</span><p>{item.reason || "No additional reason recorded."}</p></article>) : <p>No history available yet.</p>}</section></div><footer>{arena.verification_status === "PENDING_REVIEW" && <button className="secondary-button" disabled={busy} onClick={() => void act("UNDER_REVIEW")}>Start review</button>}{arena.verification_status === "UNDER_REVIEW" && <><button className="secondary-button" disabled={busy || !reason.trim()} onClick={() => void act("CHANGES_REQUESTED")}>Request changes</button><button className="danger-button" disabled={busy || !reason.trim()} onClick={() => void act("REJECTED")}>Reject</button><button className="primary-button" disabled={busy || !complete} onClick={() => void act("APPROVED")}>Approve arena <BadgeCheck size={16} /></button></>}{arena.verification_status === "APPROVED" && <button className="danger-button" disabled={busy || !reason.trim()} onClick={() => void act("SUSPENDED")}>Suspend arena</button>}</footer></aside>;
}

export function AdminVerificationWorkspace() {
  const [arenas, setArenas] = useState<Arena[]>([]); const [selected, setSelected] = useState<Arena>();
  const load = async () => { try { setArenas(await api.adminArenas()); } catch (cause) { toast.error(cause instanceof Error ? cause.message : "Unable to load review queue."); } };
  useEffect(() => { void load(); }, []);
  return <SecureGate roles={["ADMIN"]}><main className="admin-verification-page"><header className="admin-verification-header"><div><span>ARENAHUB CONTROL ROOM</span><h1>Arena <em>verification.</em></h1><p>Inspect complete owner, business, venue, court, pricing, media, equipment, event, product, and history data before an irreversible administrative action.</p></div><ShieldCheck size={32} /></header><div className="admin-queue-head"><span>{arenas.length} verification record{arenas.length === 1 ? "" : "s"}</span><button className="secondary-button" onClick={() => void load()}>Refresh queue</button></div><section className="admin-queue">{arenas.length ? arenas.map((arena) => <article key={arena.id}><div>{badge(arena.verification_status as Status)}<h2>{arena.name}</h2><p><MapPin size={14} />{arena.locality}, {arena.city}</p></div><div className="queue-data"><span>OWNER</span><b>{arena.owner_name}</b><p>{arena.owner_email}<br />{arena.owner_phone}</p></div><div className="queue-data"><span>SUBMITTED</span><b>{new Date(arena.updated_at).toLocaleDateString()}</b><p>{arena.business_name || "Business details pending"}</p></div><button className="primary-button" onClick={() => setSelected(arena)}>Review details <ChevronRight size={16} /></button></article>) : <div className="empty-stage"><ClipboardCheck size={29} /><h2>No submissions need review.</h2><p>Pending, under-review, requested-change, and approved arena records will appear here.</p></div>}</section>{selected && <AdminReview arena={selected} close={() => setSelected(undefined)} reload={() => void load()} />}</main></SecureGate>;
}

export function OwnerVerificationWorkspace() {
  const [, navigate] = useLocation(); const profile = useSecureProfile(); const [arena, setArena] = useState<Arena>(); const [history, setHistory] = useState<any[]>([]);
  useEffect(() => { if (!profile.id) return; void api.myArenas().then((arenas) => { const data = arenas[0]; if (!data) return; setArena(data); setHistory(data.arena_verification_history ?? []); }).catch((cause: Error) => toast.error(cause.message)); }, [profile.id]);
  return <SecureGate roles={["ARENA_OWNER", "ADMIN"]}><main className="owner-verification-page"><header><div><span>ARENA OWNER WORKSPACE</span><h1>Verification <em>status.</em></h1></div><button className="primary-button" onClick={() => navigate("/list-your-arena")}>{arena ? "Edit application" : "Register your arena"}<ArrowUpRight size={16} /></button></header>{arena ? <><section className={`owner-status-card ${STATUS_COPY[arena.verification_status as Status].tone}`}><Store size={28} /><div>{badge(arena.verification_status as Status)}<h2>{STATUS_COPY[arena.verification_status as Status].title}</h2><p>{arena.verification_notes || STATUS_COPY[arena.verification_status as Status].detail}</p></div></section><section className="owner-history"><h2>Verification history</h2>{history.length ? history.map((item) => <article key={item.id}><b>{item.action.replaceAll("_", " ")}</b><span>{new Date(item.created_at).toLocaleString()}</span><p>{item.reason || "No additional notes."}</p></article>) : <p>Your protected verification events will appear here.</p>}</section></> : <div className="empty-stage"><Store size={30} /><h2>Start your arena application.</h2><p>Submit a complete venue package, then track its secure verification lifecycle here.</p></div>}</main></SecureGate>;
}
