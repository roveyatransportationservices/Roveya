"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Activity,
  BadgePercent,
  BarChart3,
  Bell,
  Bike,
  Briefcase,
  CalendarClock,
  FileCheck2,
  Car,
  CarTaxiFront,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  ClipboardList,
  CreditCard,
  Gauge,
  Headset,
  History,
  IdCard,
  IndianRupee,
  KeyRound,
  LogOut,
  Megaphone,
  Menu,
  MessageSquare,
  Monitor,
  Moon,
  Network,
  PhoneCall,
  Radio,
  Search,
  Settings,
  ShieldAlert,
  Star,
  Sun,
  Ticket,
  TrendingUp,
  UserCog,
  UserPlus,
  UserRound,
  Users,
  X,
} from "lucide-react";
import { api, forgetLane, useData } from "@/lib/client";
import { ago } from "@/lib/format";
import { can as allowed, PERMISSIONS, type Permission } from "@/lib/roles";
import { bookingsTitle, ridersTitle, SERVICE_INFO, SERVICE_KEYS, vadoTitle, type ServiceKey } from "@/lib/services";
import { applyTheme, followSystem, storedTheme, type Theme } from "@/lib/theme";
import { Avatar, Field, FeedbackProvider, Modal, Spinner, useFeedback } from "./ui";

export type Admin = { id: string; email: string; name: string; phone: string | null; role: string; roleName: string; permissions: Permission[]; mustChangePassword: boolean; lastLoginAt: string | null; theme: Theme; workspace: "admin" | "support_desk" };

const THEME_CHOICES: { key: Theme; label: string; icon: typeof Moon }[] = [
  { key: "dark", label: "Dark", icon: Moon },
  { key: "light", label: "Light", icon: Sun },
  { key: "system", label: "Device", icon: Monitor },
];

// The admin's own colour theme. It applies at once and is saved to their login.
export function ThemePicker({ theme, setTheme }: { theme: Theme; setTheme: (theme: Theme) => void }) {
  const { toast } = useFeedback();

  const pick = (next: Theme) => {
    if (next === theme) return;
    const before = theme;
    setTheme(next);
    applyTheme(next);
    api("/auth/theme", { body: { theme: next } }).catch((failure: Error & { status?: number }) => {
      if (failure.status === 409) return toast(failure.message, "bad");
      setTheme(before);
      applyTheme(before);
      toast("We could not save your theme. Try again.", "bad");
    });
  };

  return (
    <div className="px-3 py-2">
      <p className="mb-1.5 text-[11px] muted">Theme</p>
      <div className="grid grid-cols-3 gap-1 rounded-md border border-line bg-night p-1" role="radiogroup" aria-label="Colour theme">
        {THEME_CHOICES.map((choice) => {
          const on = theme === choice.key;
          return (
            <button
              key={choice.key}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => pick(choice.key)}
              className={`flex flex-col items-center gap-1 rounded py-1.5 text-[10px] font-medium transition ${on ? "bg-gold text-ink" : "text-cream/70 hover:bg-mist hover:text-cream"}`}
            >
              <choice.icon size={14} />
              {choice.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
type Alerts = { sos: number; sosEscalated?: number; tickets: number; captains: number; docs: number; payouts: number; tasks: number; requests: number; vado?: Record<ServiceKey, number>; payoutsBy?: Record<ServiceKey, number> };

type AdminCtxValue = { admin: Admin; can: (permission: Permission) => boolean; theme: Theme; setTheme: (theme: Theme) => void; changePassword: () => void };
const AdminCtx = createContext<AdminCtxValue | null>(null);
export const useAdmin = () => {
  const ctx = useContext(AdminCtx);
  if (!ctx) throw new Error("useAdmin needs the admin shell");
  return ctx;
};

type Badge = Exclude<keyof Alerts, "vado" | "payoutsBy"> | "new" | `vado.${ServiceKey}` | `payouts.${ServiceKey}`;
// `also`: other pages that belong to this menu item, so it stays highlighted there.
type NavItem = { href: string; label: string; icon: typeof Gauge; badge?: Badge; tone?: string; need?: Permission[]; also?: string[] };
// A menu group holds its pages directly (items) or in titled sub-groups (groups).
type NavGroup = { id: string; label: string; icon: typeof Gauge; items?: NavItem[]; groups?: { id: string; label: string; icon: typeof Gauge; items: NavItem[] }[] };

const SERVICE_ICONS: Record<ServiceKey, typeof Gauge> = { bike: Bike, auto: CarTaxiFront, taxi: Car, carpool: Users };

// Riders and Vado: passengers ("Riders") and captains ("Vado") of every service, one page each.
const RIDERS_AND_VADO: NavGroup = {
  id: "people",
  label: "Riders and Vado",
  icon: Users,
  groups: [
    { id: "riders", label: "ROVEYA Riders", icon: UserRound, items: SERVICE_KEYS.map((key) => ({ href: `/riders/${key}`, label: ridersTitle(key), icon: SERVICE_ICONS[key], need: ["view.travellers"] })) },
    { id: "vado", label: "ROVEYA Vado", icon: IdCard, items: SERVICE_KEYS.map((key) => ({ href: `/vado/${key}`, label: vadoTitle(key), icon: SERVICE_ICONS[key], badge: `vado.${key}` as const, tone: "bg-amber text-ink", need: ["view.captains"] })) },
  ],
};

// Bookings: one list per service. Bike, Auto and Taxi are city rides; Carpool is seat bookings.
const BOOKINGS: NavGroup = {
  id: "bookings",
  label: "Bookings",
  icon: Ticket,
  items: SERVICE_KEYS.map((key) => ({ href: `/bookings/${key}`, label: bookingsTitle(key), icon: SERVICE_ICONS[key], need: [key === "carpool" ? "view.bookings" : "view.rides"] })),
};

// Live Trips: city ride captains per service, and city-by-city usage. Carpool lives under Carpool Networks.
const LIVE_TRIPS: NavGroup = {
  id: "live",
  label: "Live Trips",
  icon: Radio,
  items: [
    { href: "/live/bike", label: "ROVEYA Bike Live", icon: Bike, need: ["view.rides", "view.captains"] },
    { href: "/live/auto", label: "ROVEYA Auto Live", icon: CarTaxiFront, need: ["view.rides", "view.captains"] },
    { href: "/live/car", label: "ROVEYA Car Live", icon: Car, need: ["view.rides", "view.captains"] },
    { href: "/live/cities", label: "Live Cities", icon: Activity, need: ["view.rides"] },
  ],
};

// Payments: every passenger's (Riders) and captain's (Vado) money per service, for fraud checks and payment support.
const CITY_SERVICES = ["bike", "auto", "taxi"] as const;
const PAY_NEED: Permission[] = ["view.finance", "view.support"];
const PAYMENTS: NavGroup = {
  id: "payments",
  label: "Payments",
  icon: CreditCard,
  groups: [
    { id: "pay-riders", label: "Riders Payments", icon: UserRound, items: CITY_SERVICES.map((key) => ({ href: `/payments/riders/${key}`, label: `ROVEYA ${SERVICE_INFO[key].short} Riders Payments`, icon: SERVICE_ICONS[key], need: PAY_NEED })) },
    { id: "pay-vado", label: "Vado Payments", icon: IdCard, items: CITY_SERVICES.map((key) => ({ href: `/payments/vado/${key}`, label: `ROVEYA ${SERVICE_INFO[key].short} Vado Payments`, icon: SERVICE_ICONS[key], badge: `payouts.${key}` as const, tone: "bg-sky text-ink", need: PAY_NEED })) },
    {
      id: "pay-carpool",
      label: "Carpool Network Payments",
      icon: Network,
      items: [
        { href: "/payments/riders/carpool", label: "Carpool Riders Payments", icon: UserRound, need: PAY_NEED },
        { href: "/payments/vado/carpool", label: "Carpool Vado Payments", icon: IdCard, badge: "payouts.carpool", tone: "bg-sky text-ink", need: PAY_NEED },
        { href: "/payments/seats", label: "Seat Payments", icon: Ticket, need: PAY_NEED },
      ],
    },
  ],
};

// Support desk: new Vado verification against the clock, tickets, and how the desk is doing.
const SUPPORT_DESK: NavGroup = {
  id: "desk",
  label: "Support desk",
  icon: Headset,
  items: [
    { href: "/desk/verify/bike", label: "ROVEYA Bike Vado", icon: Bike, badge: "vado.bike", tone: "bg-amber text-ink", need: ["captains.review", "view.captains"] },
    { href: "/desk/verify/auto", label: "ROVEYA Auto Vado", icon: CarTaxiFront, badge: "vado.auto", tone: "bg-amber text-ink", need: ["captains.review", "view.captains"] },
    { href: "/desk/verify/taxi", label: "ROVEYA Taxi Vado", icon: Car, badge: "vado.taxi", tone: "bg-amber text-ink", need: ["captains.review", "view.captains"] },
    { href: "/desk/verify/carpool", label: "Carpool Network Vado", icon: Network, badge: "vado.carpool", tone: "bg-amber text-ink", need: ["captains.review", "view.captains"] },
    { href: "/desk/expiry", label: "Documents expiring", icon: CalendarClock, need: ["captains.review", "view.captains"] },
    { href: "/support", label: "Support tickets", icon: MessageSquare, badge: "tickets", tone: "bg-sky text-ink", need: ["view.support"] },
    { href: "/desk/performance", label: "Support desk performance", icon: BarChart3, need: ["admins.manage", "view.audit"] },
  ],
};

// Hiring: job roles and who has access. Every new team email is approved by the CEO.
const HIRING: NavGroup = {
  id: "hiring",
  label: "Hiring",
  icon: Briefcase,
  items: [
    { href: "/hiring/employees", label: "Employees", icon: UserCog, need: ["admins.manage"] },
    { href: "/hiring/roles", label: "Job roles", icon: KeyRound, need: ["admins.manage"] },
    { href: "/hiring/requests", label: "Access requests", icon: UserPlus, badge: "requests", tone: "bg-gold text-ink", need: ["admins.manage"] },
  ],
};

// The Support Desk login's menu. Pages outside it send the executive back to their first page.
const DESK_VERIFY_LABEL: Record<ServiceKey, string> = {
  bike: "ROVEYA Bike Vado verification",
  auto: "ROVEYA Auto Vado verification",
  taxi: "ROVEYA Taxi Vado verification",
  carpool: "Carpool Network Vado verification",
};
const ratingName = (who: "Rider" | "Vado", key: ServiceKey) => `ROVEYA ${who} ${key === "taxi" ? "Car Taxi" : SERVICE_INFO[key].short} Rating and Review`;
// Reviews and Ratings: only on the Support Desk. The CEO opens it through the Support Desk view.
const RATINGS: NavGroup = {
  id: "ratings",
  label: "Reviews and Ratings",
  icon: Star,
  groups: [
    { id: "rate-riders", label: "Riders ratings and reviews", icon: UserRound, items: SERVICE_KEYS.map((key) => ({ href: `/desk/ratings/riders/${key}`, label: ratingName("Rider", key), icon: SERVICE_ICONS[key], need: ["view.support"] as Permission[], also: key === "carpool" ? ["/desk/ratings/website"] : undefined })) },
    { id: "rate-vado", label: "Vado ratings and reviews", icon: IdCard, items: SERVICE_KEYS.map((key) => ({ href: `/desk/ratings/vado/${key}`, label: ratingName("Vado", key), icon: SERVICE_ICONS[key], need: ["view.support"] as Permission[] })) },
    {
      id: "rate-support",
      label: "Support reviews and feedback",
      icon: Headset,
      items: [
        { href: "/desk/ratings/support/riders", label: "Support feedback from Riders", icon: UserRound, need: ["view.support"] },
        { href: "/desk/ratings/support/vado", label: "Support feedback from Vado", icon: IdCard, need: ["view.support"] },
      ],
    },
  ],
};
const DESK_NAV: (NavItem | NavGroup)[] = [
  {
    id: "verify",
    label: "Vado verification",
    icon: FileCheck2,
    items: [
      ...SERVICE_KEYS.map((key) => ({ href: `/desk/verify/${key}`, label: DESK_VERIFY_LABEL[key], icon: SERVICE_ICONS[key], badge: `vado.${key}` as const, tone: "bg-amber text-ink", need: ["captains.review", "view.captains"] as Permission[] })),
      { href: "/desk/expiry", label: "Documents expiring", icon: CalendarClock, need: ["captains.review", "view.captains"] as Permission[] },
    ],
  },
  { href: "/desk/lookup", label: "Look up", icon: Search, need: ["view.support", "safety.respond", "view.captains"] },
  { href: "/support", label: "Support tickets", icon: MessageSquare, badge: "tickets", tone: "bg-sky text-ink", need: ["view.support"] },
  { href: "/calls", label: "Calls", icon: PhoneCall, need: ["calls.make"] },
  { href: "/notify", label: "Notifications", icon: Megaphone, need: ["notify.send"] },
  { href: "/safety", label: "Safety & SOS", icon: ShieldAlert, badge: "sos", tone: "bg-danger text-ink", need: ["view.safety"] },
  RATINGS,
  { href: "/desk/performance", label: "My performance", icon: BarChart3 },
  { href: "/desk/settings", label: "Settings", icon: Settings },
];

const NAV: (NavItem | NavGroup)[] = [
  { href: "/", label: "Dashboard", icon: Gauge, badge: "new", need: ["view.dashboard"] },
  { href: "/work", label: "My work", icon: ClipboardList, badge: "tasks", tone: "bg-gold text-ink" },
  { href: "/finance", label: "Fares & profit", icon: TrendingUp, need: ["view.finance"] },
  BOOKINGS,
  { href: "/networks", label: "Carpool Networks", icon: Network, need: ["view.trips"], also: ["/trips"] },
  LIVE_TRIPS,
  { href: "/rides/fares", label: "Bike & auto fares", icon: IndianRupee, need: ["view.rides"] },
  RIDERS_AND_VADO,
  PAYMENTS,
  { href: "/offers", label: "Offers & promo codes", icon: BadgePercent, need: ["view.offers"] },
  SUPPORT_DESK,
  HIRING,
  { href: "/audit", label: "Audit log", icon: History, need: ["view.audit"] },
  { href: "/settings", label: "Settings", icon: Settings, need: ["settings.manage", "view.finance"] },
];

const isGroup = (item: NavItem | NavGroup): item is NavGroup => "groups" in item || "items" in item;
const groupLinks = (item: NavGroup) => [...(item.items ?? []), ...(item.groups ?? []).flatMap((group) => group.items)];
// Every page in the menu, groups opened up, for finding the current section.
export const NAV_LINKS: NavItem[] = NAV.flatMap((item) => (isGroup(item) ? groupLinks(item) : [item]));
const DESK_LINKS: NavItem[] = DESK_NAV.flatMap((item) => (isGroup(item) ? groupLinks(item) : [item]));
// Pages that belong only to the Support Desk login; the admin panel sends people there instead.
const DESK_ONLY = ["/safety", "/calls", "/notify", "/desk/ratings", "/desk/settings"];

export const visible = (item: { need?: Permission[] }, permissions: Permission[]) => !item.need || item.need.some((key) => allowed(permissions, key));

const TABS = [
  { href: "/", label: "Overview", need: ["view.dashboard"] as Permission[], match: (path: string) => path === "/" },
  { href: "/finance", label: "Finance", need: ["view.finance"] as Permission[], match: (path: string) => ["/finance", "/payments", "/payouts", "/offers"].some((base) => path.startsWith(base)) },
  { href: "/live", label: "Operations", need: ["view.trips", "view.safety", "view.rides"] as Permission[], match: (path: string) => ["/networks", "/trips", "/live", "/rides", "/bookings", "/captains", "/travellers", "/riders", "/vado", "/desk", "/support"].some((base) => path.startsWith(base)) },
  { href: "/work", label: "My work", match: (path: string) => path.startsWith("/work") },
];

function GlobalSearch() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<{ kind: string; label: string; sub: string; href: string }[] | null>(null);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (q.trim().length < 2) {
      setResults(null);
      return;
    }
    const timer = setTimeout(() => {
      api<{ results: typeof results }>(`/search?q=${encodeURIComponent(q.trim())}`)
        .then((data) => setResults(data.results))
        .catch(() => setResults([]));
    }, 250);
    return () => clearTimeout(timer);
  }, [q]);

  useEffect(() => {
    const close = (event: MouseEvent) => !box.current?.contains(event.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  return (
    <div ref={box} className="relative px-4">
      <label className="flex items-center gap-2 rounded border border-line bg-night px-3 py-2">
        <input value={q} onChange={(event) => setQ(event.target.value)} onFocus={() => setOpen(true)} placeholder="PNR, trip, phone, name…" className="min-w-0 flex-1 bg-transparent text-xs outline-none placeholder:text-cream/35" aria-label="Search" />
        <Search size={13} className="text-cream/40" />
      </label>
      {open && results ? (
        <div className="panel absolute left-4 right-4 top-full z-40 mt-1 max-h-80 overflow-y-auto p-1 shadow-2xl">
          {results.length ? (
            results.map((item) => (
              <button
                key={`${item.kind}-${item.href}`}
                type="button"
                onClick={() => {
                  setOpen(false);
                  setQ("");
                  router.push(item.href);
                }}
                className="flex w-full items-start gap-2 rounded px-2.5 py-2 text-left hover:bg-mist"
              >
                <span className="mt-0.5 rounded bg-gold/15 px-1.5 text-[9px] font-semibold uppercase text-gold">{item.kind}</span>
                <span className="min-w-0">
                  <span className="block truncate text-xs font-medium">{item.label}</span>
                  <span className="block truncate text-[10px] muted">{item.sub}</span>
                </span>
              </button>
            ))
          ) : (
            <p className="px-3 py-3 text-xs muted">No match.</p>
          )}
        </div>
      ) : null}
    </div>
  );
}

function PasswordModal({ forced, onClose }: { forced: boolean; onClose: () => void }) {
  const { toast } = useFeedback();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [again, setAgain] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const save = async () => {
    if (next !== again) {
      setError("The new passwords do not match.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await api("/auth/password", { body: { current, next } });
      toast("Password changed.");
      onClose();
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title={forced ? "Set your own password" : "Change password"} onClose={onClose} locked={forced}>
      {forced ? <p className="mb-4 text-sm text-cream/70">You signed in with a one-time password. Choose your own before you continue.</p> : null}
      <div className="space-y-3">
        <Field label="Current password">
          <input type="password" className="input" value={current} onChange={(event) => setCurrent(event.target.value)} autoComplete="current-password" />
        </Field>
        <Field label="New password" hint="At least 10 characters, letters and numbers.">
          <input type="password" className="input" value={next} onChange={(event) => setNext(event.target.value)} autoComplete="new-password" />
        </Field>
        <Field label="New password again">
          <input type="password" className="input" value={again} onChange={(event) => setAgain(event.target.value)} autoComplete="new-password" />
        </Field>
      </div>
      {error ? <p className="mt-3 text-sm text-danger">{error}</p> : null}
      <div className="mt-5 flex justify-end">
        <button type="button" className="btn btn-gold" disabled={busy || !current || !next} onClick={() => void save()}>
          {busy ? <Spinner /> : <KeyRound size={14} />} Save password
        </button>
      </div>
    </Modal>
  );
}

function Frame({ admin, children }: { admin: Admin; children: ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const desk = admin.workspace === "support_desk";
  const menuItems = desk ? DESK_NAV : NAV;
  const links = desk ? DESK_LINKS : NAV_LINKS;
  const [nav, setNav] = useState(false);
  const [menu, setMenu] = useState(false);
  const [password, setPassword] = useState(admin.mustChangePassword);
  const [help, setHelp] = useState(false);
  const [theme, setTheme] = useState<Theme>(admin.theme);

  // The theme saved on the login wins over this browser's copy, so it follows the admin across devices.
  useEffect(() => {
    if (storedTheme() !== admin.theme) applyTheme(admin.theme);
  }, [admin.theme]);
  useEffect(() => followSystem(theme), [theme]);
  const { data: alerts } = useData<Alerts>("/alerts", desk ? 30000 : 60000);

  useEffect(() => setNav(false), [path]);

  const active = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));
  const section = links.filter((item) => active(item.href) || item.also?.some((base) => path.startsWith(base))).sort((a, b) => b.href.length - a.href.length)[0];
  const countOf = (badge?: Badge) => {
    if (!badge || badge === "new") return 0;
    if (badge.startsWith("vado.")) return alerts?.vado?.[badge.slice(5) as ServiceKey] ?? 0;
    if (badge.startsWith("payouts.")) return alerts?.payoutsBy?.[badge.slice(8) as ServiceKey] ?? 0;
    return alerts?.[badge as Exclude<Badge, "new" | `vado.${ServiceKey}` | `payouts.${ServiceKey}`>] ?? 0;
  };
  // Menu groups the admin has opened. The group holding the current page always starts open.
  const [opened, setOpened] = useState<Set<string>>(() => new Set(["bookings", "live", "people", "desk", "verify"]));
  useEffect(() => {
    if (!section) return;
    for (const item of menuItems) {
      if (!isGroup(item)) continue;
      if (item.items?.includes(section)) setOpened((current) => new Set([...current, item.id]));
      for (const group of item.groups ?? []) if (group.items.includes(section)) setOpened((current) => new Set([...current, item.id, group.id]));
    }
  }, [section, menuItems]);
  const toggle = (id: string) => setOpened((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });
  const link = (item: NavItem, depth = 0) => {
    const on = section?.href === item.href;
    const count = countOf(item.badge);
    return (
      <Link key={item.href} href={item.href} className={`relative flex items-center gap-3 py-2.5 pr-5 text-[13px] transition ${depth === 2 ? "pl-12 text-[12.5px]" : depth === 1 ? "pl-9 text-[12.5px]" : "pl-5"} ${on ? "bg-mist font-semibold text-cream" : "text-cream/75 hover:bg-mist/50 hover:text-cream"}`}>
        {on ? <span className="absolute inset-y-0 left-0 w-[3px] bg-gold" /> : null}
        <item.icon size={depth ? 14 : 15} className={on ? "text-gold" : "text-cream/55"} />
        <span className="flex-1 leading-snug">{item.label}</span>
        {item.badge === "new" ? <span className="rounded bg-rose px-1.5 py-0.5 text-[9px] font-bold text-ink">Live</span> : null}
        {count ? <span className={`flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-bold ${item.tone}`}>{count > 99 ? "99+" : count}</span> : null}
      </Link>
    );
  };
  const group = (item: NavGroup) => {
    const direct = (item.items ?? []).filter((entry) => visible(entry, admin.permissions));
    const groups = (item.groups ?? []).map((sub) => ({ ...sub, items: sub.items.filter((entry) => visible(entry, admin.permissions)) })).filter((sub) => sub.items.length);
    if (!direct.length && !groups.length) return null;
    const open = opened.has(item.id);
    const waiting = [...direct, ...groups.flatMap((sub) => sub.items)].reduce((sum, entry) => sum + countOf(entry.badge), 0);
    return (
      <div key={item.id}>
        <button type="button" onClick={() => toggle(item.id)} aria-expanded={open} className="flex w-full items-center gap-3 px-5 py-2.5 text-left text-[13px] text-cream/75 transition hover:bg-mist/50 hover:text-cream">
          <item.icon size={15} className="text-cream/55" />
          <span className="flex-1">{item.label}</span>
          {!open && waiting ? <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-amber px-1.5 text-[10px] font-bold text-ink">{waiting > 99 ? "99+" : waiting}</span> : null}
          <ChevronDown size={14} className={`text-cream/45 transition ${open ? "" : "-rotate-90"}`} />
        </button>
        {open ? direct.map((entry) => link(entry, 1)) : null}
        {open
          ? groups.map((sub) => {
              const subOpen = opened.has(sub.id);
              const subWaiting = sub.items.reduce((sum, entry) => sum + countOf(entry.badge), 0);
              return (
                <div key={sub.id}>
                  <button type="button" onClick={() => toggle(sub.id)} aria-expanded={subOpen} className="flex w-full items-center gap-2.5 py-2 pl-8 pr-5 text-left text-[12px] font-semibold uppercase tracking-wide text-cream/60 transition hover:text-cream">
                    <sub.icon size={13} className="text-gold" />
                    <span className="flex-1">{sub.label}</span>
                    {!subOpen && subWaiting ? <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-amber px-1.5 text-[10px] font-bold normal-case text-ink">{subWaiting}</span> : null}
                    <ChevronRight size={13} className={`text-cream/45 transition ${subOpen ? "rotate-90" : ""}`} />
                  </button>
                  {subOpen ? sub.items.map((entry) => link(entry, 2)) : null}
                </div>
              );
            })
          : null}
      </div>
    );
  };
  const blocked = Boolean(section && !visible(section, admin.permissions));
  useEffect(() => {
    if (blocked && path === "/") router.replace("/work");
  }, [blocked, path, router]);
  // A desk login stays inside its own menu.
  const deskHome = DESK_LINKS.find((item) => visible(item, admin.permissions))?.href ?? "/desk/performance";
  const outside = desk && (!section || blocked);
  const deskOnly = !desk && DESK_ONLY.some((base) => path.startsWith(base));
  useEffect(() => {
    if (outside) router.replace(deskHome);
  }, [outside, deskHome, router]);
  const logout = async () => {
    await api("/auth/logout", { method: "POST" }).catch(() => undefined);
    forgetLane();
    router.replace("/login");
  };

  return (
    <AdminCtx.Provider value={{ admin, can: (permission) => allowed(admin.permissions, permission), theme, setTheme, changePassword: () => setPassword(true) }}>
      <div className="min-h-screen lg:pl-64">
        <aside className={`fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-line bg-panel transition-transform lg:translate-x-0 ${nav ? "translate-x-0" : "-translate-x-full"}`}>
          <div className="flex h-[60px] items-center justify-between border-b border-line px-5">
            <Link href={desk ? deskHome : "/"} className="flex items-center gap-2.5">
              <svg viewBox="0 0 40 40" width={30} height={30} className="shrink-0" aria-hidden="true">
                <rect x="1.5" y="1.5" width="37" height="37" rx="10" fill="#12060D" stroke="#E0B23A" strokeWidth="1.2" />
                <path fill="#F6F1DC" d="M13 9H16.6V26H13Z M13 9H20.5A5.5 5.5 0 0 1 20.5 20H13Z M16.6 12.6V16.4H20.5A1.9 1.9 0 0 0 20.5 12.6Z M19 18H23L27.4 26H23.2Z" />
                <path d="M13 31H27.4" stroke="#E0B23A" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
              <span className="text-[16px] font-semibold tracking-[0.28em] text-cream">ROVEYA</span>
              <span className="whitespace-nowrap rounded bg-gold/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-gold">{desk ? "Desk" : "Admin"}</span>
            </Link>
            <button type="button" className="text-cream/70 lg:hidden" onClick={() => setNav(false)} aria-label="Close menu">
              <X size={18} />
            </button>
          </div>
          <div className="flex items-center gap-3 px-5 py-5">
            <div className="relative">
              <Avatar name={admin.name} size={40} />
              <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-panel bg-success" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{admin.name}</p>
              <p className="truncate text-[11px] muted">{admin.roleName}</p>
            </div>
          </div>
          {desk ? null : <GlobalSearch />}
          <p className={`px-5 pb-2 text-[11px] muted ${desk ? "pt-2" : "pt-6"}`}>{desk ? "Desk menu" : "Dash menu"}</p>
          <nav className="flex-1 overflow-y-auto pb-4">
            {menuItems.map((item) => (isGroup(item) ? group(item) : visible(item, admin.permissions) ? link(item) : null))}
          </nav>
          {desk ? (
            <div className="border-t border-line px-5 py-4 text-[11px] muted">
              <p className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-success" /> Just started
              </p>
              <p className="mt-1.5 flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-amber" /> Good time left
              </p>
              <p className="mt-1.5 flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-danger" /> Almost out of time
              </p>
            </div>
          ) : (
          <div className="border-t border-line px-5 py-4">
            <p className="text-[11px] muted">Category</p>
            <div className="mt-2 space-y-1.5 text-[11px]">
              {[
                ["#Bookings", "bg-rose"],
                ["#Finance", "bg-gold"],
                ["#Safety", "bg-sky"],
              ].map(([name, tone]) => (
                <p key={name} className="flex items-center gap-2 text-cream/70">
                  <span className={`h-2 w-2 rounded-sm ${tone}`} />
                  {name}
                </p>
              ))}
            </div>
          </div>
          )}
        </aside>
        {nav ? <div className="fixed inset-0 z-30 bg-black/50 lg:hidden" onClick={() => setNav(false)} /> : null}

        <header className="sticky top-0 z-20 flex h-[60px] items-center gap-6 border-b border-line bg-panel/95 px-4 backdrop-blur sm:px-6">
          <button type="button" className="text-cream/80 lg:hidden" onClick={() => setNav(true)} aria-label="Open menu">
            <Menu size={20} />
          </button>
          {desk ? (
            <p className="hidden text-[13px] font-semibold sm:block">{section?.label ?? "Support Desk"}</p>
          ) : null}
          <nav className={desk ? "hidden" : "hidden items-center gap-8 sm:flex"}>
            {TABS.filter((tab) => visible(tab, admin.permissions)).map((tab) => (
              <Link key={tab.href} href={tab.href} className="tab" data-on={tab.match(path)}>
                {tab.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-5">
            <button type="button" onClick={() => setHelp(true)} className="hidden text-xs text-cream/70 hover:text-gold sm:block">
              Help
            </button>
            {allowed(admin.permissions, "view.support") ? (
              <Link href="/support" className="relative text-cream/70 hover:text-gold" aria-label="Support tickets">
                <MessageSquare size={18} />
                {alerts?.tickets ? <span className="absolute -right-2 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-success px-1 text-[9px] font-bold text-ink">{alerts.tickets}</span> : null}
              </Link>
            ) : null}
            {desk && allowed(admin.permissions, "view.safety") ? (
              <Link href="/safety" className={`relative hover:text-gold ${alerts?.sos ? "animate-pulse text-danger" : "text-cream/70"}`} aria-label="Safety alerts">
                <Bell size={18} />
                {alerts?.sos ? <span className="absolute -right-2 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[9px] font-bold text-ink">{alerts.sos}</span> : null}
              </Link>
            ) : null}
            <div className="relative">
              <button type="button" onClick={() => setMenu(!menu)} className="flex items-center gap-2 text-xs text-cream/80">
                <Avatar name={admin.name} size={26} />
                <span className="hidden sm:inline">{admin.name}</span>
                <ChevronDown size={13} />
              </button>
              {menu ? (
                <div className="panel absolute right-0 top-full z-40 mt-2 w-56 p-1.5 shadow-2xl" onMouseLeave={() => setMenu(false)}>
                  <p className="truncate px-3 py-2 text-[11px] muted">{admin.email}</p>
                  <ThemePicker theme={theme} setTheme={setTheme} />
                  <div className="my-1 border-t border-line" />
                  <button type="button" onClick={() => (setMenu(false), setPassword(true))} className="flex w-full items-center gap-2 rounded px-3 py-2 text-left text-xs hover:bg-mist">
                    <KeyRound size={14} className="text-gold" /> Change password
                  </button>
                  <button type="button" onClick={() => void logout()} className="flex w-full items-center gap-2 rounded px-3 py-2 text-left text-xs text-danger hover:bg-mist">
                    <LogOut size={14} /> Log out
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </header>

        <main className="px-4 py-6 sm:px-6">
          {!desk && alerts?.sos ? (
            <div className={`mb-5 flex flex-wrap items-center gap-3 rounded-md border px-4 py-3 text-[13px] ${alerts.sosEscalated ? "animate-pulse border-danger bg-danger/15" : "border-danger/50 bg-danger/10"}`}>
              <ShieldAlert size={18} className="text-danger" />
              <span className="font-semibold text-danger">
                {alerts.sos} open safety alert{alerts.sos === 1 ? "" : "s"}
              </span>
              <span className="text-cream/80">
                {alerts.sosEscalated ? `${alerts.sosEscalated} SOS not picked up in time · the on-call people are being called.` : "The Support Desk is handling them."}
              </span>
            </div>
          ) : null}
          {outside ? null : deskOnly ? (
            <div className="panel mx-auto mt-10 max-w-md p-8 text-center">
              <Headset className="mx-auto text-gold" />
              <p className="mt-3 font-semibold">This is on the Support Desk</p>
              <p className="mt-1 text-sm muted">Calls, Notifications, Safety & SOS and Reviews and Ratings are handled from a Support Desk login. Sign in with one in another window; both stay signed in.</p>
              <Link href="/" className="btn btn-gold mt-5">
                Back to the dashboard
              </Link>
            </div>
          ) : blocked ? (
            path === "/" ? null : (
              <div className="panel mx-auto mt-10 max-w-md p-8 text-center">
                <ShieldAlert className="mx-auto text-gold" />
                <p className="mt-3 font-semibold">This section is not part of your role</p>
                <p className="mt-1 text-sm muted">Ask the CEO to add it to your job role under Hiring.</p>
                <Link href="/work" className="btn btn-gold mt-5">
                  Go to my work
                </Link>
              </div>
            )
          ) : (
            children
          )}
        </main>
        <footer className="flex flex-wrap justify-between gap-2 border-t border-line px-6 py-5 text-[11px] muted">
          <span>
            Copyright © {new Date().getFullYear()} <span className="text-rose">Roveya Transportation Services Private Limited</span>. All rights reserved.
          </span>
          <span>
            {desk ? "Support Desk · every action is recorded with your name" : <>Admin Network · made with <span className="text-rose">♥</span> in Hyderabad</>}
          </span>
        </footer>
      </div>
      {password ? <PasswordModal forced={admin.mustChangePassword && password} onClose={() => setPassword(false)} /> : null}
      {help ? (
        <Modal title={`Your access · ${admin.roleName}`} onClose={() => setHelp(false)}>
          <div className="grid gap-x-6 gap-y-1.5 text-[13px] sm:grid-cols-2">
            {admin.permissions.map((key) => (
              <p key={key} className="flex items-start gap-2">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-success" />
                <span>
                  {PERMISSIONS[key].group === "See" ? "See " : ""}
                  {PERMISSIONS[key].label}
                </span>
              </p>
            ))}
          </div>
          <p className="mt-4 text-xs muted">Need something else? The CEO can change your job role under Hiring.</p>
          <p className="mt-4 flex items-center gap-2 text-xs muted">
            <ClipboardList size={14} /> Every change is recorded in the audit log with your name.
          </p>
        </Modal>
      ) : null}
    </AdminCtx.Provider>
  );
}

export function Shell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [admin, setAdmin] = useState<Admin | null>(null);
  const [problem, setProblem] = useState("");

  useEffect(() => {
    api<{ admin: Admin }>("/auth/me")
      .then((data) => setAdmin(data.admin))
      .catch((failure: Error & { status?: number }) => (failure.status === 401 ? router.replace("/login") : setProblem(failure.message)));
  }, [router]);

  if (problem) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="panel max-w-md p-8 text-center text-sm">
          <CircleHelp className="mx-auto text-gold" />
          <p className="mt-3">{problem}</p>
        </div>
      </div>
    );
  }
  if (!admin) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner size={22} />
      </div>
    );
  }
  return <FeedbackProvider><Frame admin={admin}>{children}</Frame></FeedbackProvider>;
}

export function PageHead({ title, sub, actions }: { title: string; sub?: ReactNode; actions?: ReactNode }) {
  const { admin } = useAdmin();
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-lg font-semibold">{title}</h1>
        <p className="text-xs muted">{sub ?? `Your last login: ${ago(admin.lastLoginAt)}.`}</p>
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}
