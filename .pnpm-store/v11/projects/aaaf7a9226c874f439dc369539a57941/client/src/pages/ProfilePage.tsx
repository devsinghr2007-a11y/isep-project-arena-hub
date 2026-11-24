import React, { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { ArrowUpRight, BadgeCheck, Bell, CalendarDays, CheckCircle2, CircleUserRound, ClipboardCheck, Dumbbell, Heart, LogOut, ShieldCheck, ShoppingBag, Store, Trophy, UserRound, Users } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { formatProfileDate, getRoleProfileConfig, type ArenaHubRole } from "@/lib/profilePresentation";
import { useSecureProfile } from "@/pages/VerificationWorkflow";

type AccountProfile = {
  full_name?: string | null;
  email?: string | null;
  phone?: string | null;
  avatar_path?: string | null;
  role?: ArenaHubRole;
  created_at?: string | null;
};

type OwnerArena = { id: string; name: string; locality?: string | null; city?: string | null; verification_status: string; updated_at?: string | null };
type Stats = { bookings: number; rentals: number; registrations: number; favorites: number; notifications: number; arenas: number; reviewQueue: number; members: number; decisions: number };

const emptyStats: Stats = { bookings: 0, rentals: 0, registrations: 0, favorites: 0, notifications: 0, arenas: 0, reviewQueue: 0, members: 0, decisions: 0 };

function StatCard({ icon: Icon, label, value, detail }: { icon: typeof CalendarDays; label: string; value: string | number; detail: string }) {
  return <article className="profile-stat"><Icon size={19} /><span>{label}</span><b>{value}</b><small>{detail}</small></article>;
}

export default function ProfilePage({ previewRole }: { previewRole?: ArenaHubRole }) {
  const [, navigate] = useLocation();
  const secure = useSecureProfile();
  const [profile, setProfile] = useState<AccountProfile>();
  const [stats, setStats] = useState<Stats>(emptyStats);
  const [arenas, setArenas] = useState<OwnerArena[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (previewRole) {
      const previewName = previewRole === "ADMIN" ? "Administrator preview" : previewRole === "ARENA_OWNER" ? "Arena owner preview" : previewRole === "SHOPKEEPER" ? "Shopkeeper preview" : "Customer preview";
      setProfile({ full_name: previewName, email: `${previewRole.toLowerCase()}@preview.local`, role: previewRole, created_at: "2026-08-01T00:00:00.000Z" });
      setStats(emptyStats);
      setArenas(previewRole === "ARENA_OWNER" ? [{ id: "preview-arena", name: "Application status preview", locality: "Bengaluru", city: "", verification_status: "DRAFT" }] : []);
      setLoading(false);
      return;
    }
    if (!secure.id || !secure.role) { if (!secure.loading) setLoading(false); return; }
    let active = true;
    const load = async () => {
      try {
        const result = await api.profileDashboard();
        if (!active) return;
        setProfile(result.profile as AccountProfile);
        setStats({ ...emptyStats, ...result.stats, arenas: result.arenas?.length ?? 0 });
        setArenas((result.arenas ?? []) as OwnerArena[]);
      } catch (cause) { if (active) toast.error(cause instanceof Error ? cause.message : "Unable to load your profile."); }
      finally { if (active) setLoading(false); }
    };
    void load();
    return () => { active = false; };
  }, [previewRole, secure.id, secure.role, secure.email, secure.loading]);

  const role = (previewRole ?? profile?.role ?? secure.role) as ArenaHubRole | undefined;
  const config = useMemo(() => role ? getRoleProfileConfig(role) : undefined, [role]);
  const initials = (profile?.full_name || secure.email || "A").split(/\s|@/).filter(Boolean).slice(0, 2).map((value) => value[0]).join("").toUpperCase();

  async function signOut() {
    await api.logout();
    toast.success("Signed out of ArenaHub");
    navigate("/");
  }

  if ((!previewRole && secure.loading) || loading) return <main className="profile-page"><div className="profile-loader"><CircleUserRound className="spin" size={28} /> Loading your secure profile…</div></main>;
  if ((!previewRole && !secure.id) || !role || !config) return <main className="profile-page"><section className="profile-guard"><ShieldCheck size={31} /><h1>Sign in to view your profile.</h1><p>Your player, owner, or administrator profile is attached to your authenticated ArenaHub account.</p><button className="primary-button" onClick={() => navigate("/login")}>Sign in <ArrowUpRight size={16} /></button></section></main>;

  const playerStats = [
    [CalendarDays, "Bookings", stats.bookings, "All confirmed and upcoming sessions"],
    [Dumbbell, "Equipment rentals", stats.rentals, "Gear rented through ArenaHub"],
    [Trophy, "Event registrations", stats.registrations, "Competition and activity entries"],
    [Heart, "Saved arenas", stats.favorites, "Verified venues you saved"],
  ] as const;
  const ownerStats = [
    [Store, "My arenas", stats.arenas, "Submitted or verified venues"],
    [ClipboardCheck, "Review status", arenas.filter((arena) => ["PENDING_REVIEW", "UNDER_REVIEW", "CHANGES_REQUESTED"].includes(arena.verification_status)).length, "Applications awaiting action"],
    [Bell, "Unread updates", stats.notifications, "Verification and booking notices"],
    [ShoppingBag, "Orders", "—", "Live commerce appears after approval"],
  ] as const;
  const adminStats = [
    [ClipboardCheck, "Review queue", stats.reviewQueue, "Pending and in-progress checks"],
    [Users, "Registered accounts", stats.members, "MongoDB accounts"],
    [CheckCircle2, "My decisions", stats.decisions, "Recorded verification actions"],
    [Bell, "Unread updates", stats.notifications, "Platform notifications"],
  ] as const;
  const cards = role === "ADMIN" ? adminStats : role === "ARENA_OWNER" ? ownerStats : playerStats;

  return <main className="profile-page"><section className="profile-hero"><div className="profile-courtline"><span /><span /><span /></div><div className="profile-hero-copy"><div className="profile-signal"><i />{previewRole ? `${config.eyebrow} / DEV PREVIEW` : config.eyebrow}<b /></div><h1>{config.title.split("\n").map((line, index) => <React.Fragment key={line}>{index === 1 ? <em>{line}</em> : line}{index === 0 && <br />}</React.Fragment>)}</h1><p>Your account is authenticated through ArenaHub’s server API and protected by MongoDB-backed role rules.</p><div className="profile-hero-actions"><button className="primary-button" onClick={() => navigate(config.primaryAction.route)}>{config.primaryAction.label} <ArrowUpRight size={16} /></button><button className="secondary-button" onClick={() => navigate(config.secondaryAction.route)}>{config.secondaryAction.label}</button></div></div><aside className="profile-identity"><div className="profile-avatar">{profile?.avatar_path ? <img src={profile.avatar_path} alt="Profile" /> : initials}</div><div><span>{config.accent}</span><h2>{profile?.full_name || "ArenaHub member"}</h2><p>{profile?.email || secure.email}</p></div><div className="role-chip"><BadgeCheck size={15} />{config.label}</div></aside></section><section className="profile-content page-shell"><div className="profile-details"><article className="profile-panel personal-panel"><div className="profile-panel-head"><div><span>ACCOUNT DETAILS</span><h2>Your secure profile</h2></div><CircleUserRound size={21} /></div><dl><div><dt>Full name</dt><dd>{profile?.full_name || "Not supplied yet"}</dd></div><div><dt>Email address</dt><dd>{profile?.email || secure.email}</dd></div><div><dt>Phone</dt><dd>{profile?.phone || "Not supplied yet"}</dd></div><div><dt>Membership</dt><dd>{formatProfileDate(profile?.created_at)}</dd></div></dl><div className="profile-security-note"><ShieldCheck size={17} /><p>Role: <b>{config.label}</b>. Role changes and sensitive workflow actions are protected in MongoDB.</p></div>{!previewRole && <button className="profile-signout" onClick={signOut}><LogOut size={16} />Sign out</button>}</article><article className="profile-panel role-panel"><div className="profile-panel-head"><div><span>{role === "ADMIN" ? "ADMINISTRATOR SCOPE" : role === "ARENA_OWNER" ? "OWNER SCOPE" : role === "SHOPKEEPER" ? "SHOPKEEPER SCOPE" : "CUSTOMER SCOPE"}</span><h2>{role === "ADMIN" ? "Verification authority" : role === "ARENA_OWNER" ? "Venue lifecycle" : role === "SHOPKEEPER" ? "Store operations" : "Your ArenaHub activity"}</h2></div><BadgeCheck size={21} /></div>{role === "ADMIN" && <p>The designated administrator can review submissions, request changes, approve, reject, or suspend arenas. Every decision is recorded in verification history.</p>}{role === "ARENA_OWNER" && <p>Use your owner workspace to keep venue information complete, manage private shopkeeper access, and operate an approved arena.</p>}{role === "SHOPKEEPER" && <p>Use the shopkeeper workspace only for your assigned arena stores and Razorpay payout setup.</p>}{role === "CUSTOMER" && <p>Keep track of verified venue bookings, equipment rentals, event registrations, saved arenas, and account notifications.</p>}<button className="text-link" onClick={() => navigate(config.primaryAction.route)}>Open role workspace <ArrowUpRight size={15} /></button></article></div><div className="profile-stats">{cards.map(([Icon, label, value, detail]) => <StatCard key={label} icon={Icon} label={label} value={value} detail={detail} />)}</div>{role === "ARENA_OWNER" && <section className="profile-panel arena-status-panel"><div className="profile-panel-head"><div><span>MY ARENA APPLICATIONS</span><h2>Verification status</h2></div><button className="text-link" onClick={() => navigate("/list-your-arena")}>Manage <ArrowUpRight size={15} /></button></div>{arenas.length ? <div className="profile-arena-list">{arenas.map((arena) => <div key={arena.id}><div><b>{arena.name}</b><span>{[arena.locality, arena.city].filter(Boolean).join(", ") || "Location being completed"}</span></div><em className={`profile-status ${arena.verification_status.toLowerCase()}`}>{arena.verification_status.replaceAll("_", " ")}</em></div>)}</div> : <div className="profile-empty"><Store size={23} /><p>You have not started an arena application yet.</p><button className="secondary-button" onClick={() => navigate("/list-your-arena")}>List your arena</button></div>}</section>}{role === "ADMIN" && <section className="profile-panel admin-notice"><div><ShieldCheck size={24} /><div><span>ADMIN SAFEGUARD</span><h2>Authority follows your confirmed account.</h2><p>The platform role is designated by a confirmed account and enforced by the server; it is not selectable from the interface.</p></div></div><button className="primary-button" onClick={() => navigate("/admin/dashboard")}>Open verification queue <ArrowUpRight size={16} /></button></section>}</section></main>;
}
