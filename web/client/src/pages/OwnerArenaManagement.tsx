import React, { useEffect, useMemo, useState } from "react";
import "@/styles/owner-management.css";
import { ArrowLeft, ArrowUpRight, CalendarClock, CircleOff, Clock3, LoaderCircle, MapPin, Pencil, Plus, RefreshCw, ShieldCheck, Store, Trash2 } from "lucide-react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { formatOwnerSlotTime, isOwnerMutableSlot, validateOwnerSlot, type OwnerSlotDraft } from "@/lib/ownerSlots";
import { api } from "@/lib/api";
import { SecureGate, useSecureProfile } from "@/pages/VerificationWorkflow";

type ManagedArena = { id: string; name: string; locality: string; city: string; verification_status: string; updated_at: string };
type ManagedCourt = { id: string; name: string; sport_id: string; active: boolean };
type ArenaSlot = { id: string; arena_id: string; court_id: string; sport_id: string; slot_date: string; start_time: string; end_time: string; price: number | string; currency: string; status: string };
type SlotEdit = Pick<OwnerSlotDraft, "slotDate" | "startTime" | "endTime" | "price" | "status">;

const editableStatuses = new Set(["DRAFT", "CHANGES_REQUESTED", "REJECTED"]);
const initialSlotDraft = (): OwnerSlotDraft => ({ courtId: "", slotDate: new Date().toISOString().slice(0, 10), startTime: "09:00", endTime: "10:00", price: "500", status: "AVAILABLE" });
const currency = (value: number | string, code = "INR") => new Intl.NumberFormat("en-IN", { style: "currency", currency: code, maximumFractionDigits: 0 }).format(Number(value));

function OwnerArenaManagementContent() {
  const [, navigate] = useLocation();
  const profile = useSecureProfile();
  const [arenas, setArenas] = useState<ManagedArena[]>([]);
  const [selectedArenaId, setSelectedArenaId] = useState("");
  const [courts, setCourts] = useState<ManagedCourt[]>([]);
  const [slots, setSlots] = useState<ArenaSlot[]>([]);
  const [slotEdits, setSlotEdits] = useState<Record<string, SlotEdit>>({});
  const [draft, setDraft] = useState<OwnerSlotDraft>(initialSlotDraft);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const selectedArena = arenas.find((arena) => arena.id === selectedArenaId);
  const selectedCourt = courts.find((court) => court.id === draft.courtId);

  const loadArenas = async () => {
    if (!profile.id) { setLoading(false); return; }
    setLoading(true);
    try { const next = await api.myArenas() as ManagedArena[]; setArenas(next); setSelectedArenaId((current) => next.some((arena) => arena.id === current) ? current : (next[0]?.id ?? "")); }
    catch (cause) { toast.error(cause instanceof Error ? cause.message : "Unable to load arenas."); }
    finally { setLoading(false); }
  };

  const loadOperations = async () => {
    if (!selectedArenaId) { setCourts([]); setSlots([]); return; }
    let managed: any;
    try { managed = await api.managedArena(selectedArenaId); } catch (cause) { toast.error(cause instanceof Error ? cause.message : "Unable to load arena operations."); return; }
    const nextCourts = (managed.arena_courts ?? []).filter((court: ManagedCourt) => court.active).sort((a: ManagedCourt, b: ManagedCourt) => a.name.localeCompare(b.name)) as ManagedCourt[];
    const nextSlots = (managed.arena_slots ?? []).sort((a: ArenaSlot, b: ArenaSlot) => `${a.slot_date}${a.start_time}`.localeCompare(`${b.slot_date}${b.start_time}`)) as ArenaSlot[];
    setCourts(nextCourts);
    setSlots(nextSlots);
    setDraft((current) => ({ ...current, courtId: nextCourts.some((court) => court.id === current.courtId) ? current.courtId : (nextCourts[0]?.id ?? "") }));
    setSlotEdits(Object.fromEntries(nextSlots.map((slot) => [slot.id, { slotDate: slot.slot_date, startTime: slot.start_time.slice(0, 5), endTime: slot.end_time.slice(0, 5), price: String(slot.price), status: slot.status === "BLOCKED" ? "BLOCKED" : "AVAILABLE" }])));
  };

  useEffect(() => { void loadArenas(); }, [profile.id]);
  useEffect(() => { void loadOperations(); }, [selectedArenaId]);

  const slotCount = useMemo(() => ({ available: slots.filter((slot) => slot.status === "AVAILABLE").length, blocked: slots.filter((slot) => slot.status === "BLOCKED").length, protected: slots.filter((slot) => !isOwnerMutableSlot(slot.status)).length }), [slots]);
  const changeDraft = <K extends keyof OwnerSlotDraft>(key: K, value: OwnerSlotDraft[K]) => setDraft((current) => ({ ...current, [key]: value }));
  const changeSlot = <K extends keyof SlotEdit>(id: string, key: K, value: SlotEdit[K]) => setSlotEdits((current) => ({ ...current, [id]: { ...current[id], [key]: value } }));

  const addSlot = async () => {
    const problem = validateOwnerSlot(draft);
    if (problem) { toast.error(problem); return; }
    if (!selectedArena || !selectedCourt) return;
    setSaving(true);
    try { await api.addSlot(selectedArena.id, { courtId: selectedCourt.id, slotDate: draft.slotDate, startTime: draft.startTime, endTime: draft.endTime, price: Number(draft.price), status: draft.status }); }
    catch (cause) { toast.error(cause instanceof Error ? cause.message : "Unable to add this time slot."); return; }
    finally { setSaving(false); }
    toast.success("Time slot added");
    await loadOperations();
  };

  const saveSlot = async (slot: ArenaSlot) => {
    const edit = slotEdits[slot.id];
    if (!edit || !isOwnerMutableSlot(slot.status)) return;
    const problem = validateOwnerSlot({ courtId: slot.court_id, ...edit });
    if (problem) { toast.error(problem); return; }
    setSaving(true);
    try { await api.updateSlot(selectedArenaId, slot.id, { slotDate: edit.slotDate, startTime: edit.startTime, endTime: edit.endTime, price: Number(edit.price), status: edit.status }); }
    catch (cause) { toast.error(cause instanceof Error ? cause.message : "Unable to update this time slot."); return; }
    finally { setSaving(false); }
    toast.success("Time slot updated");
    await loadOperations();
  };

  const removeSlot = async (slot: ArenaSlot) => {
    if (!isOwnerMutableSlot(slot.status)) return;
    setSaving(true);
    try { await api.removeSlot(selectedArenaId, slot.id); }
    catch (cause) { toast.error(cause instanceof Error ? cause.message : "Unable to remove this time slot."); return; }
    finally { setSaving(false); }
    toast.success("Time slot removed");
    await loadOperations();
  };

  if (loading) return <main className="owner-management-page"><div className="owner-management-loading"><LoaderCircle className="spin" /> Loading your secure arena workspace…</div></main>;
  if (!arenas.length) return <main className="owner-management-page"><section className="owner-management-shell owner-management-empty"><Store size={31} /><h1>Start your arena setup.</h1><p>Register an arena first, then return here to edit permitted application details and create bookable time slots.</p><button className="primary-button" onClick={() => navigate("/list-your-arena")}>Register your arena <ArrowUpRight size={16} /></button></section></main>;

  return <main className="owner-management-page"><section className="owner-management-shell"><header className="owner-management-header"><div><span>ARENA OWNER WORKSPACE</span><h1>Run your <em>venue.</em></h1><p>Edit your saved application without re-entering details. Manage time slots below whenever your operating schedule changes.</p></div><div className="owner-venue-actions"><button className="secondary-button" onClick={() => navigate("/owner/shopkeepers")}>Shopkeepers</button><button className="secondary-button" onClick={() => navigate("/payments/setup")}>Razorpay</button><button className="secondary-button" onClick={() => navigate("/profile")}><ArrowLeft size={16} /> Profile</button></div></header><section className="owner-arena-switcher" aria-label="Choose an arena to manage"><div><span>MY ARENAS</span><b>{arenas.length} venue{arenas.length === 1 ? "" : "s"}</b></div><select value={selectedArenaId} onChange={(event) => setSelectedArenaId(event.target.value)}>{arenas.map((arena) => <option key={arena.id} value={arena.id}>{arena.name} · {arena.locality}</option>)}</select><button className="icon-button" onClick={() => { void loadArenas(); void loadOperations(); }} aria-label="Refresh arena operations"><RefreshCw size={17} /></button></section>{selectedArena && <><section className="owner-venue-card"><div><span className={`owner-status owner-status-${selectedArena.verification_status.toLowerCase()}`}>{selectedArena.verification_status.replaceAll("_", " ")}</span><h2>{selectedArena.name}</h2><p><MapPin size={15} /> {selectedArena.locality}, {selectedArena.city}</p></div><div className="owner-venue-actions">{editableStatuses.has(selectedArena.verification_status) ? <button className="primary-button" onClick={() => navigate(`/list-your-arena?arena=${encodeURIComponent(selectedArena.id)}`)}><Pencil size={16} /> Edit saved details</button> : <div className="owner-edit-locked"><ShieldCheck size={17} /><span>Application fields are locked while this venue is live or under review. Slot operations remain available.</span></div>}</div></section><section className="slot-summary"><article><CalendarClock size={19} /><span>Available</span><b>{slotCount.available}</b><small>Players can see these slots</small></article><article><CircleOff size={19} /><span>Blocked</span><b>{slotCount.blocked}</b><small>Hidden from new bookings</small></article><article><ShieldCheck size={19} /><span>Protected</span><b>{slotCount.protected}</b><small>Held or booked slots</small></article></section><section className="slot-manager"><div className="slot-manager-head"><div><span>TIME SLOT MANAGEMENT</span><h2>Open, block, or adjust availability.</h2></div><p>Held and booked slots are protected from owner edits so confirmed player activity is not changed here.</p></div>{courts.length ? <><div className="slot-create-grid"><label>Court<select value={draft.courtId} onChange={(event) => changeDraft("courtId", event.target.value)}>{courts.map((court) => <option key={court.id} value={court.id}>{court.name}</option>)}</select></label><label>Date<input type="date" value={draft.slotDate} onChange={(event) => changeDraft("slotDate", event.target.value)} /></label><label>Start<input type="time" value={draft.startTime} onChange={(event) => changeDraft("startTime", event.target.value)} /></label><label>End<input type="time" value={draft.endTime} onChange={(event) => changeDraft("endTime", event.target.value)} /></label><label>Price (INR)<input type="number" min="0" value={draft.price} onChange={(event) => changeDraft("price", event.target.value)} /></label><label>Status<select value={draft.status} onChange={(event) => changeDraft("status", event.target.value as OwnerSlotDraft["status"])}><option value="AVAILABLE">Available</option><option value="BLOCKED">Blocked</option></select></label><button className="primary-button" disabled={saving} onClick={() => void addSlot()}><Plus size={16} /> Add time slot</button></div><div className="slot-list-owner">{slots.length ? slots.map((slot) => { const edit = slotEdits[slot.id]; const court = courts.find((item) => item.id === slot.court_id); const mutable = isOwnerMutableSlot(slot.status); return <article key={slot.id} className={mutable ? "" : "slot-protected"}><div className="slot-owner-meta"><b>{court?.name ?? "Court"}</b><span>{slot.status === "AVAILABLE" ? "Available" : slot.status === "BLOCKED" ? "Blocked" : slot.status}</span></div>{mutable && edit ? <><label>Date<input type="date" value={edit.slotDate} onChange={(event) => changeSlot(slot.id, "slotDate", event.target.value)} /></label><label>Start<input type="time" value={edit.startTime} onChange={(event) => changeSlot(slot.id, "startTime", event.target.value)} /></label><label>End<input type="time" value={edit.endTime} onChange={(event) => changeSlot(slot.id, "endTime", event.target.value)} /></label><label>Price<input type="number" min="0" value={edit.price} onChange={(event) => changeSlot(slot.id, "price", event.target.value)} /></label><label>Status<select value={edit.status} onChange={(event) => changeSlot(slot.id, "status", event.target.value as SlotEdit["status"])}><option value="AVAILABLE">Available</option><option value="BLOCKED">Blocked</option></select></label><button className="secondary-button" disabled={saving} onClick={() => void saveSlot(slot)}>Save</button><button className="slot-delete" disabled={saving} onClick={() => void removeSlot(slot)} aria-label={`Remove ${court?.name ?? "court"} slot`}><Trash2 size={17} /></button></> : <div className="slot-protected-copy"><Clock3 size={18} /><span>{slot.slot_date} · {formatOwnerSlotTime(slot.start_time)}–{formatOwnerSlotTime(slot.end_time)} · {currency(slot.price, slot.currency)}. This {slot.status.toLowerCase()} slot is protected.</span></div>}</article>; }) : <div className="slot-owner-empty"><CalendarClock size={24} /><div><b>No time slots yet.</b><p>Add your first court time above. You can later change its time, price, or availability while it is not held or booked.</p></div></div>}</div></> : <div className="slot-owner-empty"><Store size={24} /><div><b>Add a court before adding time slots.</b><p>Use the prefilled edit application flow to add or restore a court for this venue.</p></div></div>}</section></>}</section></main>;
}

export default function OwnerArenaManagement() {
  return <SecureGate roles={["ARENA_OWNER", "ADMIN"]}><OwnerArenaManagementContent /></SecureGate>;
}
