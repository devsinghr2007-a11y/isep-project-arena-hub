import React, { FormEvent, useEffect, useState } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, ArrowUpRight, BadgeCheck, CreditCard, LoaderCircle, Store, Users } from "lucide-react";
import { toast } from "sonner";
import { api, type PayoutProfile, type ShopkeeperAssignment } from "@/lib/api";
import { SecureGate, useSecureProfile } from "@/pages/VerificationWorkflow";

type OwnerArena = { id: string; name: string; locality?: string; city?: string };

function LoadingCard({ text }: { text: string }) {
  return <main className="page-shell listing-page"><div className="empty-stage"><LoaderCircle className="spin" size={29} /><h2>{text}</h2></div></main>;
}

function OwnerShopkeeperContent() {
  const [, navigate] = useLocation();
  const [arenas, setArenas] = useState<OwnerArena[]>([]);
  const [shopkeepers, setShopkeepers] = useState<ShopkeeperAssignment[]>([]);
  const [email, setEmail] = useState("");
  const [arenaId, setArenaId] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    try {
      const [savedArenas, savedShopkeepers] = await Promise.all([api.myArenas(), api.ownerShopkeepers()]);
      setArenas(savedArenas as OwnerArena[]);
      setShopkeepers(savedShopkeepers);
      setArenaId((current) => current || savedArenas[0]?.id || "");
    } catch (cause) { toast.error(cause instanceof Error ? cause.message : "Unable to load shopkeeper access."); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);

  async function addShopkeeper(event: FormEvent) {
    event.preventDefault();
    if (!arenaId) { toast.error("Create or select an arena first."); return; }
    setSaving(true);
    try {
      await api.addOwnerShopkeeper(email, arenaId);
      setEmail("");
      toast.success("Shopkeeper access added");
      await load();
    } catch (cause) { toast.error(cause instanceof Error ? cause.message : "Unable to add this shopkeeper."); }
    finally { setSaving(false); }
  }

  if (loading) return <LoadingCard text="Loading your private shopkeeper workspace…" />;
  return <main className="page-shell listing-page">
    <div className="page-intro"><span>OWNER-ONLY TEAM ACCESS</span><h1>Manage your <em>shopkeepers.</em></h1><p>Only arena owners can view or assign this list. Customers never receive this data or a route to it.</p></div>
    {!arenas.length ? <div className="empty-stage"><Store size={29} /><h2>Create your arena first.</h2><p>After your arena application is saved, you can connect verified shopkeepers to it.</p><button className="primary-button" onClick={() => navigate("/list-your-arena")}>Create arena <ArrowUpRight size={16} /></button></div> : <>
      <section className="detail-section"><div className="section-inline"><h2>Add a verified shopkeeper</h2><span className="available-dot"><i /> Owner access</span></div><p className="detail-help">The person must first register and verify a separate Shopkeeper account with this email.</p><form className="form-grid" onSubmit={addShopkeeper}><label>Email<input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="shop@arena.com" /></label><label>Arena<select required value={arenaId} onChange={(event) => setArenaId(event.target.value)}>{arenas.map((arena) => <option key={arena.id} value={arena.id}>{arena.name}{arena.locality ? ` · ${arena.locality}` : ""}</option>)}</select></label><div className="form-actions full"><button className="primary-button" disabled={saving}>{saving ? "Adding…" : "Give shopkeeper access"} <ArrowUpRight size={16} /></button><button type="button" className="secondary-button" onClick={() => navigate("/payments/setup")}>Payment setup <CreditCard size={16} /></button></div></form></section>
      <section className="detail-section"><div className="section-inline"><h2>Your shopkeepers</h2><span>{shopkeepers.length} linked</span></div>{shopkeepers.length ? <div className="profile-arena-list">{shopkeepers.map((assignment) => <div key={assignment.id}><div><b>{assignment.shopkeeper?.fullName ?? "Unavailable account"}</b><span>{assignment.shopkeeper?.email ?? "Account is unavailable"} · {assignment.arena?.name ?? "Arena unavailable"}</span></div><em className="profile-status approved">{assignment.payout.configured ? "RAZORPAY READY" : "PAYMENT SETUP NEEDED"}</em></div>)}</div> : <div className="empty-event"><Users size={22} /><div><b>No shopkeepers linked yet.</b><p>Connected shopkeepers appear here only for your owner account.</p></div></div>}</section>
    </>}
  </main>;
}

export function OwnerShopkeeperWorkspace() {
  return <SecureGate roles={["ARENA_OWNER", "ADMIN"]}><OwnerShopkeeperContent /></SecureGate>;
}

function ShopkeeperWorkspaceContent() {
  const [, navigate] = useLocation();
  const [data, setData] = useState<Awaited<ReturnType<typeof api.shopkeeperDashboard>>>();
  useEffect(() => { void api.shopkeeperDashboard().then(setData).catch((cause: Error) => toast.error(cause.message)); }, []);
  if (!data) return <LoadingCard text="Opening your shopkeeper workspace…" />;
  return <main className="page-shell listing-page"><div className="page-intro"><span>SHOPKEEPER WORKSPACE</span><h1>Run your <em>arena store.</em></h1><p>This workspace is separate from customer and arena-owner accounts.</p></div><section className="detail-section"><div className="section-inline"><h2>Assigned arenas</h2><span>{data.assignments.length} active</span></div>{data.assignments.length ? <div className="profile-arena-list">{data.assignments.map((assignment) => <div key={assignment.id}><div><b>{assignment.arena?.name ?? "Arena unavailable"}</b><span>{assignment.arena ? [assignment.arena.locality, assignment.arena.city].filter(Boolean).join(", ") : "Ask the arena owner to restore the assignment"}</span></div><em className="profile-status approved">{assignment.owner?.fullName ?? "Owner"}</em></div>)}</div> : <div className="empty-event"><Store size={22} /><div><b>No arena has assigned this shop account yet.</b><p>Ask the arena owner to add the verified email for this Shopkeeper account.</p></div></div>}</section><section className="detail-section"><div className="section-inline"><h2>Razorpay payment setup</h2><span>{data.payout.configured ? "Ready" : "Not completed"}</span></div><p className="detail-help">Your KYC and bank details stay in Razorpay. ArenaHub stores only the Razorpay linked-account ID.</p><button className="primary-button" onClick={() => navigate("/payments/setup")}>{data.payout.configured ? "View payment setup" : "Set up Razorpay"} <ArrowUpRight size={16} /></button></section></main>;
}

export function ShopkeeperWorkspace() {
  return <SecureGate roles={["SHOPKEEPER"]}><ShopkeeperWorkspaceContent /></SecureGate>;
}

function PaymentSetupContent() {
  const [, navigate] = useLocation();
  const profile = useSecureProfile();
  const [payout, setPayout] = useState<PayoutProfile>();
  const [linkedAccountId, setLinkedAccountId] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => { void api.payoutProfile().then((result) => { setPayout(result); setLinkedAccountId(result.razorpayLinkedAccountId ?? ""); }).catch((cause: Error) => toast.error(cause.message)); }, []);
  async function save(event: FormEvent) {
    event.preventDefault(); setSaving(true);
    try { const result = await api.savePayoutProfile(linkedAccountId); setPayout(result); toast.success("Razorpay linked account saved"); }
    catch (cause) { toast.error(cause instanceof Error ? cause.message : "Unable to save payment setup."); }
    finally { setSaving(false); }
  }
  if (!payout) return <LoadingCard text="Loading your Razorpay setup…" />;
  const returnTo = profile.role === "SHOPKEEPER" ? "/shopkeeper/dashboard" : "/owner/dashboard";
  return <main className="page-shell listing-page"><div className="page-intro"><span>RAZORPAY PAYOUT SETUP</span><h1>Get paid <em>securely.</em></h1><p>Complete bank, UPI, and KYC details directly in Razorpay. ArenaHub does not collect or store those sensitive details.</p></div><section className="detail-section"><div className="section-inline"><h2>Connect Razorpay</h2><span>{payout.platformConfigured ? "Platform keys ready" : "Platform keys still needed"}</span></div><p className="detail-help">Create or complete your Razorpay Route linked account in Razorpay, then paste its ID here (it starts with <code>acc_</code>). Route transfers are {payout.routeEnabled ? "enabled" : "not yet enabled"} for this platform.</p><form className="form-grid" onSubmit={save}><label className="full">Razorpay linked account ID<input required pattern="acc_[A-Za-z0-9]+" value={linkedAccountId} onChange={(event) => setLinkedAccountId(event.target.value.trim())} placeholder="acc_xxxxxxxxx" /></label><div className="form-actions full"><button className="primary-button" disabled={saving}>{saving ? "Saving…" : "Save Razorpay setup"} <BadgeCheck size={16} /></button><button type="button" className="secondary-button" onClick={() => navigate(returnTo)}><ArrowLeft size={16} /> Back to workspace</button></div></form>{!payout.platformConfigured && <p className="detail-help">The platform administrator must add <code>RAZORPAY_KEY_ID</code> and <code>RAZORPAY_KEY_SECRET</code> to the server environment before customers can pay.</p>}</section></main>;
}

export function PaymentSetupPage() {
  return <SecureGate roles={["ARENA_OWNER", "SHOPKEEPER"]}><PaymentSetupContent /></SecureGate>;
}
