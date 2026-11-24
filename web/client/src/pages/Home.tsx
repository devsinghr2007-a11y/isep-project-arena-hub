/**
 * ArenaHub style contract: Stadium After Dark — a sideline-led, cinematic sports marketplace.
 * Use obsidian surfaces, sharply limited Arena Signal Lime, courtline geometry, and precise operational states.
 */
import React, { FormEvent, useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import {
  ArrowUpRight,
  BadgeCheck,
  BarChart3,
  Bell,
  CalendarDays,
  Check,
  ChevronRight,
  CircleDollarSign,
  ClipboardCheck,
  Clock,
  Dumbbell,
  Filter,
  Heart,
  Home as HomeIcon,
  Landmark,
  MapPin,
  Menu,
  Minus,
  Package,
  Play,
  Plus,
  Search,
  ShoppingBag,
  SlidersHorizontal,
  Sparkles,
  Trophy,
  UserRound,
  Users,
  X,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { registerWithEmail, requestPasswordReset } from "@/lib/accountAuth";
import { api, ApiError } from "@/lib/api";
import { clampEquipmentQuantity, getEquipmentRentalTotal, type BookableEquipment } from "@/lib/bookingEquipment";
import { buildArenaDirectionsUrl } from "@/lib/arenaLocation";
import { openRazorpayCheckout } from "@/lib/razorpayCheckout";
import "@/styles/location-actions.css";
import { toArenaDetailPath } from "@/lib/arenaNavigation";
import { AdminVerificationWorkspace, ArenaRegistrationWorkflow, OwnerVerificationWorkspace } from "@/pages/VerificationWorkflow";
import OwnerArenaManagement from "@/pages/OwnerArenaManagement";
import ProfilePage from "@/pages/ProfilePage";
import { OwnerShopkeeperWorkspace, PaymentSetupPage, ShopkeeperWorkspace } from "@/pages/PartnerOperations";

const ASSET = {
  hero: "/manus-storage/arenahub-hero-sports_752cf1c9.jpg",
  badminton: "/manus-storage/arenahub-badminton_58bfe605.jpg",
  football: "/manus-storage/arenahub-football_6363d8ab.jpg",
  cricket: "/manus-storage/arenahub-cricket_b3ae1a5f.jpg",
  logo: "/manus-storage/arenahub-logo_bdc219e6.png",
};

type Arena = {
  id?: string;
  name: string;
  locality: string;
  sport: string;
  price: string;
  image: string;
  slots: string;
  tone: string;
};

const ARENAS: Arena[] = [];

const SPORTS = ["Badminton", "Cricket", "Football", "Tennis", "Basketball", "Pickleball", "Volleyball", "Table Tennis"];
const LOCALITIES = ["HSR Layout", "Koramangala", "Indiranagar", "Whitefield", "Bellandur", "JP Nagar"];
const timeSlots = [
  { time: "6:00 PM – 7:00 PM", price: "₹500", state: "available" },
  { time: "7:00 PM – 8:00 PM", price: "₹600", state: "available" },
  { time: "8:00 PM – 9:00 PM", price: "₹650", state: "booked" },
  { time: "9:00 PM – 10:00 PM", price: "₹600", state: "available" },
];

const ownerNav = ["Overview", "My Arena", "Bookings", "Calendar", "Time Slots", "Equipment", "Rentals", "Events", "Products", "Orders", "Customers", "Analytics", "Settings"];
const adminNav = ["Overview", "Users", "Arenas", "Bookings", "Equipment", "Events", "Products", "Payments", "Reports", "Settings"];

function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <button className="brand" onClick={() => (window.location.href = "/")} aria-label="ArenaHub home">
      <img src={ASSET.logo} alt="ArenaHub mark" />
      {!compact && <span>ARENA<span>HUB</span></span>}
    </button>
  );
}

function Nav({ onOpenMenu }: { onOpenMenu: () => void }) {
  const [, navigate] = useLocation();
  const link = (to: string) => navigate(to);
  return (
    <header className="topbar">
      <div className="topbar-inner">
        <Logo />
        <nav className="desktop-nav" aria-label="Primary navigation">
          <button onClick={() => link("/arenas")}>Explore</button>
          <button onClick={() => link("/arenas?view=sports")}>Sports</button>
          <button onClick={() => link("/equipment")}>Equipment</button>
          <button onClick={() => link("/events")}>Events</button>
          <button onClick={() => link("/marketplace")}>Marketplace</button>
          <button className="nav-lime" onClick={() => link("/list-your-arena")}>List your arena <ArrowUpRight size={15} /></button>
        </nav>
        <div className="nav-actions">
          <button className="icon-button desktop-only" onClick={() => link("/arenas")} aria-label="Search arenas"><Search size={19} /></button>
          <button className="icon-button desktop-only" onClick={() => toast("No new notifications", { description: "We’ll signal every booking update here." })} aria-label="Notifications"><Bell size={19} /></button>
          <button className="icon-button desktop-only" onClick={() => link("/profile")} aria-label="Open my profile"><UserRound size={19} /></button>
          <button className="login-button desktop-only" onClick={() => link("/login")}>Login</button>
          <button className="icon-button mobile-only" onClick={onOpenMenu} aria-label="Open navigation"><Menu size={21} /></button>
        </div>
      </div>
    </header>
  );
}

function MobileNav() {
  const [location, navigate] = useLocation();
  const current = location.split("?")[0];
  const items = [
    { label: "Home", icon: HomeIcon, to: "/" },
    { label: "Explore", icon: Search, to: "/arenas" },
    { label: "Bookings", icon: CalendarDays, to: "/my-bookings" },
    { label: "Events", icon: Trophy, to: "/events" },
    { label: "Profile", icon: UserRound, to: "/profile" },
  ];
  return <nav className="mobile-nav" aria-label="Mobile navigation">{items.map(({ label, icon: Icon, to }) => <button className={current === to ? "active" : ""} onClick={() => navigate(to)} key={label}><Icon size={18} /><span>{label}</span></button>)}</nav>;
}

function Signal({ children }: { children: React.ReactNode }) {
  return <div className="signal"><i />{children}<b /></div>;
}

export function ArenaCard({ arena, showFavorite = true }: { arena: Arena; showFavorite?: boolean }) {
  const [, navigate] = useLocation();
  const [saved, setSaved] = useState(false);
  const openArena = () => navigate(toArenaDetailPath(arena.id));
  return (
    <article className="arena-card" role="link" tabIndex={0} aria-label={`Open ${arena.name}`} onClick={openArena} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); openArena(); } }}>
      <div className="arena-image-wrap">
        <img src={arena.image} alt={`${arena.sport} venue on ArenaHub`} loading="lazy" />
        {showFavorite && <button className={saved ? "favorite saved" : "favorite"} onClick={(event) => { event.stopPropagation(); setSaved(!saved); toast(saved ? "Removed from saved arenas" : "Saved for later"); }} aria-label="Save arena"><Heart size={17} fill={saved ? "currentColor" : "none"} /></button>}
        <div className="image-scrim" />
        <div className="image-meta"><span>{arena.tone}</span><span>{arena.slots}</span></div>
      </div>
      <div className="arena-card-body">
        <div className="arena-card-top"><div><h3>{arena.name}</h3><p><MapPin size={14} /> {arena.locality}, Bengaluru</p></div><BadgeCheck className="verified" size={20} aria-label="Verified venue" /></div>
        <div className="tag-row"><span>{arena.sport}</span><span>Indoor</span><span>Verified</span></div>
        <div className="arena-card-bottom"><div><small>Starting at</small><strong>{arena.price}</strong></div><button type="button" onClick={(event) => { event.stopPropagation(); openArena(); }}>View arena <ChevronRight size={16} /></button></div>
      </div>
    </article>
  );
}

function useApprovedArenas() {
  const [arenas, setArenas] = useState<Arena[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    void api.approvedArenas().then((data) => {
      if (!active) return;
      const mapped = data.map((item: any) => ({ id: item.id, name: item.name, locality: item.locality, sport: item.arena_sports?.[0]?.sports?.name ?? "Sport venue", price: "See venue pricing", image: item.cover_image_path ?? item.arena_images?.[0]?.storage_path ?? ASSET.badminton, slots: "Approved venue", tone: "Verified" } satisfies Arena));
      if (active) { setArenas(mapped); setLoading(false); }
    }).catch((cause: Error) => { if (active) { toast.error(cause.message); setLoading(false); } });
    return () => { active = false; };
  }, []);
  return { arenas, loading };
}

function HeroSearch() {
  const [, navigate] = useLocation();
  const [query, setQuery] = useState("");
  function submit(event: FormEvent) {
    event.preventDefault();
    navigate(`/arenas?search=${encodeURIComponent(query || "Badminton in HSR Layout")}`);
  }
  return <form className="hero-search" onSubmit={submit}><Search size={20} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search arenas, sports or locations" aria-label="Search arenas, sports or locations" /><button type="submit">Find a game <ArrowUpRight size={17} /></button></form>;
}

function HomePage() {
  const [, navigate] = useLocation();
  const { arenas: approvedArenas } = useApprovedArenas();
  return (
    <>
      <section className="hero">
        <img className="hero-photo" src={ASSET.hero} alt="Players competing in a premium indoor sports venue" />
        <div className="hero-vignette" />
        <div className="court-orbit orbit-hero" />
        <div className="hero-content page-shell">
          <Signal>BUILT FOR BENGALURU</Signal>
          <p className="hero-kicker">Play more. Plan less.</p>
          <h1>YOUR GAME.<br /><em>YOUR ARENA.</em></h1>
          <p className="hero-copy">Discover, book, rent and compete at Bengaluru’s sports venues.</p>
          <HeroSearch />
          <div className="hero-actions"><button className="primary-button" onClick={() => navigate("/arenas")}>Explore arenas <ArrowUpRight size={17} /></button><button className="ghost-button" onClick={() => navigate("/list-your-arena")}>List your arena</button></div>
        </div>
        <aside className="hero-float hero-float-one"><span className="float-label"><i /> LIVE AVAILABILITY</span><strong>18:00</strong><p>Prime time, one tap away.</p></aside>
        <aside className="hero-float hero-float-two"><Zap size={19} /><div><b>Fast checkout</b><p>Booking + gear in one flow</p></div></aside>
        <div className="hero-rail"><span>01</span><i /><span>05</span></div>
      </section>

      <section className="sports-strip page-shell">
        <div className="section-head"><div><Signal>CHOOSE YOUR FIELD</Signal><h2>Find the format<br />that moves you.</h2></div><button className="text-link" onClick={() => navigate("/arenas?view=sports")}>View all sports <ArrowUpRight size={17} /></button></div>
        <div className="sport-runner">{SPORTS.map((sport, index) => <button key={sport} onClick={() => navigate(`/arenas?search=${sport}`)}><span>{String(index + 1).padStart(2, "0")}</span>{sport}<ArrowUpRight size={15} /></button>)}</div>
      </section>

      <section className="featured-section">
        <div className="page-shell">
          <div className="section-head"><div><Signal>EXPLORE VENUES</Signal><h2>Made for the<br />next match.</h2></div><p className="section-note">Only approved ArenaHub venues appear here, with live availability and verified venue details.</p></div>
          {approvedArenas.length ? <div className="arena-grid">{approvedArenas.map((arena) => <ArenaCard arena={arena} key={arena.id} />)}</div> : <div className="empty-stage"><MapPin size={29} /><h2>New venues are joining ArenaHub.</h2><p>Approved arenas will appear here as they complete verification in your area.</p><button className="primary-button" onClick={() => navigate("/list-your-arena")}>List your arena <ArrowUpRight size={16} /></button></div>}
          <button className="wide-cta" onClick={() => navigate("/arenas")}><span>Explore arenas</span><ArrowUpRight size={19} /></button>
        </div>
      </section>

      <section className="split-operator page-shell">
        <div className="operator-copy"><Signal>OWN THE HOME ADVANTAGE</Signal><h2>Turn open time<br />into <em>game time.</em></h2><p>Bring your arena, courts, equipment, events and store into one composed operating system.</p><button className="primary-button" onClick={() => navigate("/list-your-arena")}>List your arena <ArrowUpRight size={17} /></button></div>
        <div className="operator-panel"><div className="operator-top"><span>ARENA OPERATIONS</span><BarChart3 size={20} /></div><div className="metric-row"><div><small>Bookings</small><strong>—</strong><span>Live data</span></div><div><small>Equipment</small><strong>—</strong><span>Live data</span></div></div><div className="chart-line"><i /><i /><i /><i /><i /><i /><i /></div><div className="operator-foot"><span><i /> Data appears after your arena is approved</span><button onClick={() => navigate("/owner/dashboard")}>Open owner workspace <ArrowUpRight size={15} /></button></div></div>
      </section>

      <section className="bottom-banner"><div className="court-orbit orbit-banner" /><div className="page-shell"><Signal>BOOK. GEAR UP. PLAY.</Signal><h2>Your court is<br /><em>waiting.</em></h2><button className="primary-button" onClick={() => navigate("/arenas")}>Start exploring <ArrowUpRight size={17} /></button></div></section>
    </>
  );
}

function DirectoryPage() {
  const [, navigate] = useLocation();
  const [sport, setSport] = useState("All sports");
  const [locality, setLocality] = useState("All localities");
  const [filterOpen, setFilterOpen] = useState(false);
  const filtered = useMemo(() => ARENAS.filter((arena) => (sport === "All sports" || arena.sport === sport) && (locality === "All localities" || arena.locality === locality)), [sport, locality]);
  return <main className="page-shell directory-page"><div className="page-intro"><Signal>ARENA DISCOVERY</Signal><h1>Find your next <em>game.</em></h1><p>Browse approved ArenaHub venues by sport, locality, availability and venue features.</p></div><div className="directory-toolbar"><div className="toolbar-search"><Search size={18} /><input placeholder="Badminton near HSR Layout" /></div><button className="filter-trigger" onClick={() => setFilterOpen(!filterOpen)}><SlidersHorizontal size={17} /> Filters <span>02</span></button><select value={sport} onChange={(event) => setSport(event.target.value)} aria-label="Filter by sport"><option>All sports</option>{SPORTS.map((item) => <option key={item}>{item}</option>)}</select><select value={locality} onChange={(event) => setLocality(event.target.value)} aria-label="Filter by locality"><option>All localities</option>{LOCALITIES.map((item) => <option key={item}>{item}</option>)}</select></div>{filterOpen && <div className="filter-drawer"><button onClick={() => setFilterOpen(false)}><X size={16} /> Close</button><div><label>Availability</label><span className="choice selected"><Check size={14} /> Available today</span></div><div><label>Venue type</label><span className="choice">Indoor</span><span className="choice">Outdoor</span></div><div><label>Price</label><span className="choice">Under ₹800</span><span className="choice">₹800–₹1,500</span></div></div>}<div className="directory-meta"><span>{filtered.length} approved arenas</span><button onClick={() => toast("Sorting set to Recommended")}>Recommended <ChevronRight size={15} /></button></div>{filtered.length ? <div className="arena-grid directory-grid">{filtered.map((arena) => <ArenaCard arena={arena} key={arena.name} />)}</div> : <div className="empty-stage"><Trophy size={29} /><h2>Your next game starts here.</h2><p>No approved arenas are available for these filters yet.</p><button className="primary-button" onClick={() => navigate("/list-your-arena")}>List your arena <ArrowUpRight size={16} /></button></div>}</main>;
}

function ApprovedDirectoryPage() {
  const [, navigate] = useLocation();
  const { arenas, loading } = useApprovedArenas();
  const [query, setQuery] = useState("");
  const [sport, setSport] = useState("All sports");
  const filtered = useMemo(() => arenas.filter((arena) => (sport === "All sports" || arena.sport === sport) && `${arena.name} ${arena.locality} ${arena.sport}`.toLowerCase().includes(query.trim().toLowerCase())), [arenas, query, sport]);
  return <main className="page-shell directory-page"><div className="page-intro"><Signal>ARENA DISCOVERY</Signal><h1>Find your next <em>game.</em></h1><p>Every venue below comes from an approved-only MongoDB API query. Draft, pending, rejected, and suspended arenas are excluded before results reach the browser.</p></div><div className="directory-toolbar"><div className="toolbar-search"><Search size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search approved arenas" /></div><select value={sport} onChange={(event) => setSport(event.target.value)} aria-label="Filter approved arenas by sport"><option>All sports</option>{SPORTS.map((item) => <option key={item}>{item}</option>)}</select></div><div className="directory-meta"><span>{loading ? "Loading approved arenas…" : `${filtered.length} approved arenas`}</span></div>{filtered.length ? <div className="arena-grid directory-grid">{filtered.map((arena) => <ArenaCard arena={arena} key={arena.id} />)}</div> : <div className="empty-stage"><Trophy size={29} /><h2>Your next game starts here.</h2><p>No approved arenas match these filters yet.</p><button className="primary-button" onClick={() => navigate("/list-your-arena")}>List your arena <ArrowUpRight size={16} /></button></div>}</main>;
}

type ArenaDetail = {
  id: string;
  name: string;
  description: string | null;
  address: string;
  locality: string;
  city: string;
  amenities: string[];
  opening_time: string | null;
  closing_time: string | null;
  rating: number | string;
  review_count: number;
  cover_image_path: string | null;
  arena_sports: Array<{ sports: { name: string } | null }>;
  arena_images: Array<{ storage_path: string; alt_text: string | null; sort_order: number }>;
  arena_courts: Array<{ id: string; name: string; description: string | null; indoor: boolean; capacity: number; active: boolean; sports: { name: string } | null }>;
  arena_slots: Array<{ id: string; court_id: string; slot_date: string; start_time: string; end_time: string; price: number | string; currency: string; status: string }>;
  equipment: Array<{ id: string; name: string; category: string; description: string | null; rental_price: number | string; available_stock: number; active: boolean }>;
};

function formatTime(time: string | null) {
  if (!time) return "Hours not published";
  const [hourText, minuteText] = time.split(":");
  const hour = Number(hourText);
  const minute = Number(minuteText);
  if (Number.isNaN(hour) || Number.isNaN(minute)) return time;
  return `${hour % 12 || 12}:${String(minute).padStart(2, "0")} ${hour >= 12 ? "PM" : "AM"}`;
}

function formatPrice(price: number | string, currency = "INR") {
  const amount = Number(price);
  return Number.isFinite(amount) ? new Intl.NumberFormat("en-IN", { style: "currency", currency, maximumFractionDigits: 0 }).format(amount) : "Price unavailable";
}

export function ArenaDetailPage() {
  const [location, navigate] = useLocation();
  const arenaId = location.split("?")[0].replace(/^\/arenas\//, "");
  const [arena, setArena] = useState<ArenaDetail | null>(null);
  const [imageUrl, setImageUrl] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [selectedCourtId, setSelectedCourtId] = useState<string>();
  const [selectedSlotId, setSelectedSlotId] = useState<string>();
  const [equipmentQuantities, setEquipmentQuantities] = useState<Record<string, number>>({});
  const [checkoutLoading, setCheckoutLoading] = useState(false);

  useEffect(() => {
    if (!arenaId) { setError("Arena details are unavailable because the venue identifier is missing."); setLoading(false); return; }
    let active = true;
    void api.arena(arenaId).then((data) => {
      if (!active) return;
      const detail = data as unknown as ArenaDetail;
      detail.arena_images = [...(detail.arena_images ?? [])].sort((a, b) => a.sort_order - b.sort_order);
      detail.arena_courts = (detail.arena_courts ?? []).filter((court) => court.active);
      detail.arena_slots = detail.arena_slots ?? [];
      detail.equipment = (detail.equipment ?? []).filter((item) => item.active && item.available_stock > 0);
      setArena(detail);
      setSelectedCourtId(detail.arena_courts[0]?.id);
      const coverPath = detail.cover_image_path ?? detail.arena_images[0]?.storage_path;
      if (coverPath) setImageUrl(coverPath);
      if (active) setLoading(false);
    }).catch((cause: Error) => { if (active) { setError(cause.message); setLoading(false); } });
    return () => { active = false; };
  }, [arenaId]);
  useEffect(() => {
    if (!arena) return;
    const destination = globalThis.document.querySelector(".gallery-content > div");
    if (!destination || destination.querySelector("[data-arena-directions]")) return;
    const button = globalThis.document.createElement("button");
    button.type = "button";
    button.className = "detail-directions";
    button.dataset.arenaDirections = "true";
    button.textContent = "Get directions ↗";
    const openDirections = () => window.open(buildArenaDirectionsUrl({ address: arena.address, locality: arena.locality, city: arena.city }), "_blank", "noopener,noreferrer");
    button.addEventListener("click", openDirections);
    destination.append(button);
    return () => { button.removeEventListener("click", openDirections); button.remove(); };
  }, [arena, loading]);

  if (loading) return <main className="page-shell listing-page"><div className="empty-stage"><Clock size={29} /><h2>Opening arena details…</h2><p>Loading this approved venue and its published availability.</p></div></main>;
  if (error || !arena) return <main className="page-shell listing-page"><div className="page-intro"><Signal>VENUE DETAILS</Signal><h1>Arena <em>unavailable.</em></h1><p>{error ?? "This arena could not be opened."}</p></div><div className="empty-stage"><MapPin size={29} /><h2>Return to approved arenas.</h2><p>Only approved venues are visible from this route.</p><button className="primary-button" onClick={() => navigate("/arenas")}>Explore arenas <ArrowUpRight size={16} /></button></div></main>;

  const selectedCourt = arena.arena_courts.find((court) => court.id === selectedCourtId) ?? arena.arena_courts[0];
  const slots = arena.arena_slots.filter((slot) => !selectedCourt || slot.court_id === selectedCourt.id);
  const selectedSlot = slots.find((slot) => slot.id === selectedSlotId);
  const sports = arena.arena_sports.map((item) => item.sports?.name).filter((sport): sport is string => Boolean(sport));
  const operationalHours = arena.opening_time && arena.closing_time ? `${formatTime(arena.opening_time)} – ${formatTime(arena.closing_time)}` : "Hours to be confirmed";
  const bookableEquipment: BookableEquipment[] = arena.equipment.map((item) => ({ id: item.id, name: item.name, rentalPrice: item.rental_price, availableStock: item.available_stock }));
  const equipmentTotal = getEquipmentRentalTotal(bookableEquipment, equipmentQuantities);
  const venueTotal = Number(selectedSlot?.price) || 0;
  const bookingTotal = venueTotal + equipmentTotal;
  const selectedEquipment = bookableEquipment.filter((item) => (equipmentQuantities[item.id] ?? 0) > 0);
  const changeEquipmentQuantity = (item: BookableEquipment, nextQuantity: number) => setEquipmentQuantities((current) => ({ ...current, [item.id]: clampEquipmentQuantity(nextQuantity, item.availableStock) }));
  async function beginCheckout() {
    if (!arena || !selectedSlot) return;
    setCheckoutLoading(true);
    try {
      const { user } = await api.me();
      if (!user) { toast("Sign in as a customer to pay", { description: "Customer payments use the separate customer session." }); navigate("/login?role=customer"); return; }
      if (user.role !== "CUSTOMER") { toast.error("Customer session required", { description: "Use a Customer account to book and pay. Owner and shopkeeper sessions cannot make customer bookings." }); return; }
      const order = await api.createPaymentOrder({ arenaId: arena.id, slotId: selectedSlot.id, equipment: selectedEquipment.map((item) => ({ id: item.id, quantity: equipmentQuantities[item.id] })) });
      await openRazorpayCheckout(order, () => { toast.success("Payment verified", { description: "Your Razorpay payment has been recorded securely." }); setCheckoutLoading(false); }, () => setCheckoutLoading(false));
    } catch (cause) { toast.error(cause instanceof Error ? cause.message : "Unable to start Razorpay checkout."); setCheckoutLoading(false); }
  }

  return <main><section className="detail-gallery"><img src={imageUrl ?? ASSET.hero} alt={arena.arena_images[0]?.alt_text ?? `${arena.name} venue`} /><div className="detail-gallery-scrim" /><div className="gallery-content page-shell"><div><Signal>APPROVED ARENA</Signal><h1>{arena.name}</h1><p><MapPin size={15} /> {arena.locality}, {arena.city}</p></div><div className="gallery-availability"><i /><span><b>{slots.filter((slot) => slot.status === "AVAILABLE").length}</b> published slots</span></div></div></section><section className="detail-layout page-shell"><div className="detail-main"><Signal>VENUE OVERVIEW</Signal><p className="lead">{arena.description?.trim() || "This approved ArenaHub venue is ready to publish its courts, slots, amenities, and player experience."}</p><div className="detail-stats"><div><BadgeCheck size={18} /><span>Verification</span><b>Approved venue</b></div><div><Clock size={18} /><span>Hours</span><b>{operationalHours}</b></div><div><Trophy size={18} /><span>Sports</span><b>{sports.length ? sports.join(", ") : "To be published"}</b></div></div><section className="detail-section"><div className="section-inline"><h2>Courts</h2><span className="available-dot"><i /> {arena.arena_courts.length} active</span></div>{arena.arena_courts.length ? arena.arena_courts.map((court) => <button type="button" key={court.id} className={selectedCourt?.id === court.id ? "court-option active" : "court-option"} onClick={() => { setSelectedCourtId(court.id); setSelectedSlotId(undefined); setEquipmentQuantities({}); }}><div><b>{court.name}</b><span>{court.sports?.name ?? "Sport court"} · {court.indoor ? "Indoor" : "Outdoor"}{court.description ? ` · ${court.description}` : ""}</span></div><span>{court.capacity} player{court.capacity === 1 ? "" : "s"}</span></button>) : <div className="empty-event"><CalendarDays size={22} /><div><b>Courts are being prepared.</b><p>This arena has not published a bookable court yet.</p></div></div>}</section><section className="detail-section"><div className="section-inline"><h2>Published availability</h2><span className="available-dot"><i /> {slots.filter((slot) => slot.status === "AVAILABLE").length} available</span></div>{slots.length ? <div className="slot-list">{slots.map((slot) => <button type="button" disabled={slot.status !== "AVAILABLE"} className={`slot ${slot.status !== "AVAILABLE" ? "booked" : ""} ${selectedSlotId === slot.id ? "selected" : ""}`} key={slot.id} onClick={() => setSelectedSlotId(slot.id)}><b>{formatTime(slot.start_time)} – {formatTime(slot.end_time)}</b><small>{slot.slot_date} · {formatPrice(slot.price, slot.currency)}</small><ChevronRight size={17} /></button>)}</div> : <div className="empty-event"><Clock size={22} /><div><b>No slots published yet.</b><p>Availability will appear here when the arena opens its schedule.</p></div></div>}</section><section className="detail-section"><div className="section-inline"><h2>Equipment rental</h2><span className="available-dot"><i /> {bookableEquipment.length} item{bookableEquipment.length === 1 ? "" : "s"} available</span></div>{bookableEquipment.length ? <><p className="detail-help">Select rental gear for this court booking. Quantities cannot exceed the arena’s current available stock.</p>{bookableEquipment.map((item) => { const quantity = equipmentQuantities[item.id] ?? 0; return <div className="gear-row" key={item.id}><div className="gear-icon"><Dumbbell size={20} /></div><div className="gear-copy"><b>{item.name}</b><span>{formatPrice(item.rentalPrice)} rental · {item.availableStock} available</span></div><div className="quantity"><button type="button" aria-label={`Remove one ${item.name}`} disabled={!selectedSlot || quantity === 0} onClick={() => changeEquipmentQuantity(item, quantity - 1)}><Minus size={14} /></button><b aria-label={`${item.name} quantity`}>{quantity}</b><button type="button" aria-label={`Add one ${item.name}`} disabled={!selectedSlot || quantity >= item.availableStock} onClick={() => changeEquipmentQuantity(item, quantity + 1)}><Plus size={14} /></button></div></div>; })}</> : <div className="empty-event"><Dumbbell size={22} /><div><b>No equipment is currently available to rent.</b><p>Available gear appears here once the arena owner publishes active stock.</p></div></div>}</section><section className="detail-section"><h2>Amenities</h2>{arena.amenities.length ? <div className="tag-row">{arena.amenities.map((amenity) => <span key={amenity}>{amenity}</span>)}</div> : <div className="empty-event"><Package size={22} /><div><b>Amenities have not been listed.</b><p>This venue can add its facilities as the owner completes setup.</p></div></div>}</section></div><aside className="booking-panel"><div className="booking-panel-head"><span>BOOK A COURT</span><b>RAZORPAY SECURE FLOW</b></div><div className="booking-selection"><p><span>Arena</span><b>{arena.name}</b></p><p><span>Court</span><b>{selectedCourt?.name ?? "Choose a court"}</b></p><p><span>Time</span><b>{selectedSlot ? `${formatTime(selectedSlot.start_time)} – ${formatTime(selectedSlot.end_time)}` : "Choose an available slot"}</b></p>{selectedEquipment.length ? <p><span>Equipment</span><b>{selectedEquipment.map((item) => `${equipmentQuantities[item.id]} × ${item.name}`).join(", ")}</b></p> : null}</div><div className="booking-total"><p><span>Venue price</span><b>{selectedSlot ? formatPrice(selectedSlot.price, selectedSlot.currency) : "—"}</b></p><p><span>Equipment rental</span><b>{equipmentTotal ? formatPrice(equipmentTotal) : "—"}</b></p><p className="tax"><span>Fees</span><b>Calculated securely at checkout</b></p><div><span>Total</span><strong>{selectedSlot ? formatPrice(bookingTotal) : "—"}</strong></div></div><button className="primary-button booking-button" disabled={!selectedSlot || checkoutLoading} onClick={() => void beginCheckout()}>{checkoutLoading ? "Opening Razorpay…" : selectedSlot ? "Pay securely with Razorpay" : "Select an available time"} <ArrowUpRight size={16} /></button><p className="booking-note"><BadgeCheck size={14} />Only Customer sessions can pay; final amount and Razorpay signature are verified by the server.</p></aside></section></main>;
}

function EquipmentPage() {
  return <main className="page-shell listing-page"><div className="page-intro"><Signal>RENT THE RIGHT KIT</Signal><h1>Gear up without<br /><em>the hassle.</em></h1><p>Rent equipment independently, or add it to your court time from participating ArenaHub venues.</p></div><div className="chip-filter">{["All gear", "Rackets", "Bats", "Balls", "Pads", "Gloves", "Sports shoes"].map((item, index) => <button className={index === 0 ? "active" : ""} key={item}>{item}</button>)}</div><div className="empty-stage"><Dumbbell size={29} /><h2>Equipment rental is coming to your area.</h2><p>Available gear will appear here once participating arenas publish their inventory.</p></div></main>;
}

function ShieldIcon({ size = 24 }: { size?: number }) { return <BadgeCheck size={size} />; }

function EventsPage() {
  const [, navigate] = useLocation();
  return <main className="page-shell listing-page"><div className="page-intro"><Signal>COMPETE TOGETHER</Signal><h1>More than a<br /><em>booking.</em></h1><p>Discover tournaments, coaching sessions, leagues, workshops and friendly matches from approved ArenaHub venues.</p></div><div className="empty-stage"><Trophy size={29} /><h2>No events nearby yet.</h2><p>Published events will appear here when an approved arena opens registrations.</p><button className="primary-button" onClick={() => navigate("/list-your-arena")}>Host an event <ArrowUpRight size={16} /></button></div></main>;
}

function MarketplacePage() {
  return <main className="page-shell listing-page"><div className="page-intro"><Signal>ARENA STORE</Signal><h1>Wear the<br /><em>home colours.</em></h1><p>Every approved arena can run a focused shop for club gear, match essentials, merchandise and post-game favourites.</p></div><div className="empty-stage"><ShoppingBag size={29} /><h2>Stores will open here soon.</h2><p>Products appear when participating arenas publish their collections and stock.</p></div></main>;
}

function ListArenaPage() {
  const [step, setStep] = useState(1);
  const [complete, setComplete] = useState(false);
  const steps = ["Owner", "Arena", "Sports", "Courts", "Location", "Amenities", "Pricing", "Photos", "Equipment", "Offerings", "Review", "Submit"];
  const stepCopy = [
    ["Owner details", "Tell us who will manage this arena."], ["Arena details", "Set a clear identity for your future listing."], ["Sports and courts", "Select what players can book at your venue."], ["Location", "Pin the venue so players can find it."], ["Pricing and availability", "Choose your bookable hours and starting price."], ["Final review", "Confirm your submission before it enters verification."],
  ];
  const [title, description] = stepCopy[Math.min(Math.floor((step - 1) / 2), stepCopy.length - 1)];
  if (complete) return <main className="submission-success page-shell"><div className="success-orbit"><Check size={38} /></div><Signal>SUBMISSION RECEIVED</Signal><h1>Your arena has been submitted for <em>verification.</em></h1><p>It will stay private until an administrator completes the review. You can return to your owner workspace to prepare everything else.</p><button className="primary-button" onClick={() => (window.location.href = "/owner/dashboard")}>Open owner dashboard <ArrowUpRight size={17} /></button></main>;
  return <main className="onboarding-page"><aside className="onboard-rail"><Logo /><div className="rail-copy"><span>ARENA PARTNER</span><h2>Build your<br /><em>home ground.</em></h2><p>One guided submission, one clean handoff to verification.</p></div><div className="progress-list">{steps.map((label, index) => <button key={label} onClick={() => setStep(index + 1)} className={index + 1 === step ? "active" : index + 1 < step ? "done" : ""}><span>{index + 1 < step ? <Check size={13} /> : String(index + 1).padStart(2, "0")}</span>{label}</button>)}</div></aside><section className="onboard-content"><div className="onboard-top"><span>STEP {String(step).padStart(2, "0")} / 12</span><button onClick={() => (window.location.href = "/")}><X size={17} /> Exit</button></div><div className="form-stage"><Signal>ARENA ONBOARDING</Signal><h1>{title}</h1><p>{description}</p><div className="form-grid"><label>Full name<input placeholder="Your name" /></label><label>Work email<input type="email" placeholder="you@arena.com" /></label><label className="full">Arena name<input placeholder="Your arena name" /></label><label>Phone number<input placeholder="+91 00000 00000" /></label><label>Primary locality<select><option>Choose a locality</option>{LOCALITIES.map((item) => <option key={item}>{item}</option>)}</select></label></div>{step === 3 && <div className="selection-grid">{SPORTS.map((sport) => <button className={sport === "Badminton" ? "selected" : ""} key={sport}>{sport}{sport === "Badminton" && <Check size={15} />}</button>)}</div>}{step === 11 && <div className="review-box"><span>VERIFICATION PREVIEW</span><b>Your arena</b><p>Add venue details, sports, courts, location and pricing before you submit.</p><small>This becomes a pending submission and is never public until approved.</small></div>}<div className="form-actions"><button className="back-button" disabled={step === 1} onClick={() => setStep(Math.max(1, step - 1))}>Back</button><button className="primary-button" onClick={() => step === 12 ? setComplete(true) : setStep(Math.min(12, step + 1))}>{step === 12 ? "Submit for verification" : "Save and continue"}<ArrowUpRight size={16} /></button></div></div></section></main>;
}

function MyBookingsPage() {
  const [tab, setTab] = useState("Upcoming");
  return <main className="page-shell dashboard-page"><div className="page-intro compact"><Signal>MY PLAY</Signal><h1>Game time, <em>organised.</em></h1><p>Keep bookings, gear rentals and event registrations in one focused view.</p></div><div className="dashboard-tabs">{["Upcoming", "Completed", "Cancelled"].map((item) => <button key={item} className={tab === item ? "active" : ""} onClick={() => setTab(item)}>{item}</button>)}</div><div className="empty-stage"><CalendarDays size={29} /><h2>No {tab.toLowerCase()} games yet.</h2><p>Your bookings and receipts will appear here after your first confirmed reservation.</p></div></main>;
}

function DashboardPage() {
  const [, navigate] = useLocation();
  return <main className="page-shell dashboard-page"><div className="dashboard-welcome"><div><Signal>PLAYER DASHBOARD</Signal><h1>Ready when<br />the whistle <em>blows.</em></h1></div><button className="primary-button" onClick={() => navigate("/arenas")}>Explore arenas <ArrowUpRight size={17} /></button></div><div className="dashboard-summary"><div><CalendarDays size={20} /><span>Upcoming bookings</span><b>—</b></div><div><Dumbbell size={20} /><span>Equipment rentals</span><b>—</b></div><div><Trophy size={20} /><span>Event registrations</span><b>—</b></div><div><Heart size={20} /><span>Saved arenas</span><b>—</b></div></div><div className="empty-stage"><CalendarDays size={29} /><h2>Plan your next game.</h2><p>Confirmed bookings, rentals, registrations, saved arenas and notifications will appear here.</p></div></main>;
}

function OpsSidebar({ kind }: { kind: "owner" | "admin" }) {
  const [, navigate] = useLocation();
  const nav = kind === "owner" ? ownerNav : adminNav;
  return <aside className="ops-sidebar"><Logo compact /><div className="ops-mode">{kind === "owner" ? "ARENA OWNER" : "PLATFORM ADMIN"}<span>WORKSPACE</span></div><nav>{nav.map((item, index) => <button className={index === 0 ? "active" : ""} key={item}><span>{String(index + 1).padStart(2, "0")}</span>{item}</button>)}</nav><button className="return-link" onClick={() => navigate("/")}>Return to ArenaHub <ArrowUpRight size={15} /></button></aside>;
}

function OperationsPage({ kind }: { kind: "owner" | "admin" }) {
  const isOwner = kind === "owner";
  const cards = isOwner ? ["Today’s bookings", "Today’s revenue", "Equipment rentals", "Upcoming events"] : ["Total users", "Arena owners", "Pending arenas", "Bookings"];
  const message = isOwner ? "Your venue workspace will populate after your arena is approved and begins receiving activity." : "Platform activity and review queues will populate once registered accounts and arena submissions arrive.";
  return <main className="ops-layout"><OpsSidebar kind={kind} /><section className="ops-main"><header className="ops-top"><div><span>{isOwner ? "ARENA OWNER WORKSPACE" : "ARENAHUB CONTROL ROOM"}</span><h1>Manage your <em>{isOwner ? "arena." : "platform."}</em></h1></div><div><button className="icon-button"><Bell size={18} /></button><button className="avatar-button"><UserRound size={16} /></button></div></header><div className="ops-metrics">{cards.map((label) => <article key={label}><span>{label}</span><b>—</b><small><i /> Live data</small></article>)}</div><section className="ops-panel"><div className="panel-head"><div><span>WORKSPACE READY</span><h2>{isOwner ? "Set up your venue operations" : "Prepare platform operations"}</h2></div><button><ArrowUpRight size={16} /></button></div><div className="empty-stage"><BarChart3 size={29} /><h2>{isOwner ? "Your arena is ready for setup." : "Your control room is ready."}</h2><p>{message}</p></div></section></section></main>;
}

const accountChoices = [
  { value: "CUSTOMER", label: "Customer", description: "Book courts, rentals and events" },
  { value: "ARENA_OWNER", label: "Arena owner", description: "Manage arenas, shopkeepers and payouts" },
  { value: "SHOPKEEPER", label: "Shopkeeper", description: "Manage the store workspace and payouts" },
] as const;

function accountHome(role: string) {
  if (role === "ARENA_OWNER") return "/owner/dashboard";
  if (role === "SHOPKEEPER") return "/shopkeeper/dashboard";
  if (role === "ADMIN") return "/admin/dashboard";
  return "/dashboard";
}

export function LoginPage() {
  const [location, navigate] = useLocation();
  const requestedRole = new URLSearchParams(location.split("?")[1] ?? "").get("role");
  const initialAccountType = requestedRole === "owner" ? "ARENA_OWNER" : requestedRole === "shopkeeper" ? "SHOPKEEPER" : "CUSTOMER";
  const [mode, setMode] = useState<"login" | "signup" | "verify">("login");
  const [accountType, setAccountType] = useState<"CUSTOMER" | "ARENA_OWNER" | "SHOPKEEPER">(initialAccountType);
  const [fullName, setFullName] = useState(""); const [email, setEmail] = useState(""); const [password, setPassword] = useState(""); const [otp, setOtp] = useState(""); const [developmentOtp, setDevelopmentOtp] = useState<string>(); const [loading, setLoading] = useState(false);
  const selectedAccount = accountChoices.find((choice) => choice.value === accountType)!;
  async function login(event: FormEvent) { event.preventDefault(); setLoading(true); try { const result = await api.login(email, password, accountType); toast.success(`Signed in to your ${selectedAccount.label.toLowerCase()} session`); navigate(accountHome(result.user.role)); } catch (cause) { if (cause instanceof ApiError && cause.status === 403 && !String(cause.message).includes("registered as")) { setMode("verify"); toast("Verify your email", { description: "Enter the six-digit code sent to your email." }); } else toast.error(cause instanceof Error ? cause.message : "Unable to sign in."); } finally { setLoading(false); } }
  async function signUp(event: FormEvent) { event.preventDefault(); setLoading(true); try { const result = await registerWithEmail({ fullName, email, password, accountType, redirectTo: `${window.location.origin}/login` }); setDevelopmentOtp(result.developmentOtp); setMode("verify"); toast.success("Verification code sent"); } catch (cause) { toast.error(cause instanceof Error ? cause.message : "Unable to create the account."); } finally { setLoading(false); } }
  async function verifyEmail(event: FormEvent) { event.preventDefault(); setLoading(true); try { const result = await api.verifyEmail(email, otp); toast.success("Email verified. Welcome to ArenaHub!"); navigate(accountHome(result.user.role)); } catch (cause) { toast.error(cause instanceof Error ? cause.message : "Unable to verify your email."); } finally { setLoading(false); } }
  async function resendVerification() { if (!email.trim()) { toast.error("Enter your email address first"); return; } setLoading(true); try { const result = await api.resendEmailVerification(email); setDevelopmentOtp(result.developmentOtp); toast.success(result.message); } catch (cause) { toast.error(cause instanceof Error ? cause.message : "Unable to resend the code."); } finally { setLoading(false); } }
  async function resetPassword() { if (!email.trim()) { toast.error("Enter your email address first"); return; } setLoading(true); try { const result = await requestPasswordReset(email, `${window.location.origin}/login`); toast.success(result.message); } catch (cause) { toast.error(cause instanceof Error ? cause.message : "Unable to request password reset."); } finally { setLoading(false); } }
  const isSignup = mode === "signup"; const isVerify = mode === "verify";
  return <main className="login-page"><div className="login-art"><img src={ASSET.hero} alt="Sports arena under floodlights" /><div /><Logo /></div><form className="login-box" onSubmit={isVerify ? verifyEmail : isSignup ? signUp : login}><Signal>{isVerify ? "VERIFY EMAIL" : isSignup ? "CREATE SEPARATE ACCOUNT" : "SELECT YOUR SESSION"}</Signal><h1>{isVerify ? <>Confirm your <em>email.</em></> : isSignup ? <>Create your <em>{selectedAccount.label.toLowerCase()} account.</em></> : <>Enter your <em>{selectedAccount.label.toLowerCase()} session.</em></>}</h1><p>{isVerify ? `Enter the six-digit code to activate this ${selectedAccount.label.toLowerCase()} account.` : `${selectedAccount.description}. Each account type has a separate protected workspace.`}</p>{!isVerify && <div className="account-type-choice" aria-label="Choose account type">{accountChoices.map((choice) => <button type="button" key={choice.value} className={accountType === choice.value ? "active" : ""} onClick={() => setAccountType(choice.value)}><b>{choice.label}</b><small>{choice.description}</small></button>)}</div>}{isSignup && <label>Full name<input type="text" autoComplete="name" required value={fullName} onChange={(event) => setFullName(event.target.value)} placeholder="Your name" /></label>}<label>Email<input type="email" autoComplete="email" required value={email} readOnly={isVerify} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" /></label>{isVerify ? <label>Verification code<input inputMode="numeric" autoComplete="one-time-code" required pattern="[0-9]{6}" maxLength={6} value={otp} onChange={(event) => setOtp(event.target.value.replace(/\D/g, ""))} placeholder="6-digit code" /></label> : <label>Password<input type="password" autoComplete={isSignup ? "new-password" : "current-password"} minLength={6} required value={password} onChange={(event) => setPassword(event.target.value)} placeholder="At least 6 characters" /></label>}{developmentOtp && isVerify && <p className="login-dev-code">Local test code: <b>{developmentOtp}</b></p>}<button className="primary-button" disabled={loading}>{loading ? (isVerify ? "Verifying…" : isSignup ? "Creating account…" : "Signing in…") : (isVerify ? "Verify email" : isSignup ? `Create ${selectedAccount.label} account` : `Login as ${selectedAccount.label}`)}<ArrowUpRight size={17} /></button><div className="login-foot">{isVerify ? <><button type="button" disabled={loading} onClick={resendVerification}>Resend code</button><span><button type="button" disabled={loading} onClick={() => { setMode("login"); setOtp(""); }}>Back to login</button></span></> : <>{!isSignup && <button type="button" disabled={loading} onClick={resetPassword}>Forgot password?</button>}<span>{isSignup ? "Already have this account? " : "Need a separate account? "}<button type="button" disabled={loading} onClick={() => { setMode(isSignup ? "login" : "signup"); setPassword(""); setDevelopmentOtp(undefined); }}>{isSignup ? "Login" : "Create one"}</button></span></>}</div></form></main>;
}

function AppFooter() { return <footer className="app-footer"><div className="page-shell"><Logo /><p>Play. Book. Rent. Compete.</p><span>Discover verified sports venues and make every game count.</span></div></footer>; }

export default function Home() {
  const [location] = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const path = location.split("?")[0];
  let content: React.ReactNode;
  let immersive = false;
  if (path === "/") content = <HomePage />;
  else if (path === "/arenas") content = <ApprovedDirectoryPage />;
  else if (path.startsWith("/arenas/")) content = <ArenaDetailPage />;
  else if (path === "/equipment") content = <EquipmentPage />;
  else if (path === "/events") content = <EventsPage />;
  else if (path === "/marketplace") content = <MarketplacePage />;
  else if (path === "/list-your-arena") { content = <ArenaRegistrationWorkflow />; immersive = true; }
  else if (path === "/dashboard") content = <DashboardPage />;
  else if (path === "/profile") content = <ProfilePage />;
  else if (import.meta.env.DEV && path === "/__preview/profile/player") content = <ProfilePage previewRole="CUSTOMER" />;
  else if (import.meta.env.DEV && path === "/__preview/profile/owner") content = <ProfilePage previewRole="ARENA_OWNER" />;
  else if (import.meta.env.DEV && path === "/__preview/profile/shopkeeper") content = <ProfilePage previewRole="SHOPKEEPER" />;
  else if (import.meta.env.DEV && path === "/__preview/profile/admin") content = <ProfilePage previewRole="ADMIN" />;
  else if (path === "/my-bookings") content = <MyBookingsPage />;
  else if (path === "/owner/dashboard" || path === "/owner/manage") { content = <OwnerArenaManagement />; immersive = true; }
  else if (path === "/owner/shopkeepers") { content = <OwnerShopkeeperWorkspace />; }
  else if (path === "/shopkeeper/dashboard") { content = <ShopkeeperWorkspace />; }
  else if (path === "/payments/setup") { content = <PaymentSetupPage />; }
  else if (path === "/admin/dashboard" || path === "/admin/arena-verification") { content = <AdminVerificationWorkspace />; immersive = true; }
  else if (path === "/login") { content = <LoginPage />; immersive = true; }
  else content = <ApprovedDirectoryPage />;
  return <div className="app-root">{!immersive && <Nav onOpenMenu={() => setMenuOpen(true)} />}{menuOpen && <aside className="mobile-menu"><button className="close-menu" onClick={() => setMenuOpen(false)}><X size={18} /></button><Logo /><nav>{[["Explore", "/arenas"], ["Equipment", "/equipment"], ["Events", "/events"], ["Marketplace", "/marketplace"], ["List your arena", "/list-your-arena"]].map(([label, to]) => <a href={to} key={label}>{label}<ArrowUpRight size={16} /></a>)}</nav></aside>}{content}{!immersive && <><AppFooter /><MobileNav /></>}</div>;
}
