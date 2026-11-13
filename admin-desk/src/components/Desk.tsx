"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import QRCode from "qrcode";
import { Logo } from "@/components/Logo";
import { PlatformSectionView, platformNav, type PlatformSection } from "@/components/platform/PlatformDesk";
import { formatInr, formatMobile, one, slugify } from "@/lib/format";
import { createClient } from "@/lib/supabase/browser";

type DeskSection = "overview" | "routes" | "drivers" | "requests" | "rides" | "customers" | "messages" | "reviews" | "settings" | "qr";
type Section = DeskSection | PlatformSection;
type Staff = { id: string; name: string; email: string; role: "CEO" | "ADMIN" };

const nav: { id: DeskSection; label: string; hint: string }[] = [
  { id: "overview", label: "Overview", hint: "The desk at a glance." },
  { id: "routes", label: "Routes", hint: "Origin, destination, and the time each taxi leaves and arrives." },
  { id: "drivers", label: "Drivers", hint: "People you hire. They do not register themselves." },
  { id: "requests", label: "Seat requests", hint: "Passengers asking for a seat. Confirm or decline from here." },
  { id: "rides", label: "Ride payments", hint: "Fares paid inside the vehicle, including cash waiting on you." },
  { id: "customers", label: "Customers", hint: "Travellers who signed in with a phone number." },
  { id: "messages", label: "Messages", hint: "Notes sent from the public contact form." },
  { id: "reviews", label: "Reviews", hint: "Quotes that can appear on the website." },
  { id: "settings", label: "Desk details", hint: "Phone, hours and links shown to the public." },
  { id: "qr", label: "Vehicle QR", hint: "The code a passenger scans from their seat." },
];

function when(value: string) {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function toInput(value: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(value));
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}

function fromInput(value: string) {
  return new Date(`${value}:00+05:30`).toISOString();
}

export function Desk() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [section, setSection] = useState<Section>("overview");
  const [staff, setStaff] = useState<Staff | null>(null);
  const [notice, setNotice] = useState("");
  const [query, setQuery] = useState("");
  const [routes, setRoutes] = useState<Record<string, unknown>[]>([]);
  const [drivers, setDrivers] = useState<Record<string, unknown>[]>([]);
  const [requests, setRequests] = useState<Record<string, unknown>[]>([]);
  const [rides, setRides] = useState<Record<string, unknown>[]>([]);
  const [customers, setCustomers] = useState<Record<string, unknown>[]>([]);
  const [messages, setMessages] = useState<Record<string, unknown>[]>([]);
  const [reviews, setReviews] = useState<Record<string, unknown>[]>([]);
  const [fares, setFares] = useState<Record<string, unknown>[]>([]);
  const [settings, setSettings] = useState<Record<string, string> | null>(null);
  const [qr, setQr] = useState("");
  const [editing, setEditing] = useState<Record<string, string> | null>(null);

  async function load() {
    const auth = await supabase.auth.getUser();
    if (!auth.data.user) {
      router.replace("/login");
      return;
    }
    const profile = await supabase.from("admin_users").select("id,name,email,role").eq("auth_user_id", auth.data.user.id).maybeSingle();
    if (!profile.data) {
      await supabase.auth.signOut();
      router.replace("/login");
      return;
    }
    setStaff(profile.data as Staff);
    const [routeRes, driverRes, requestRes, rideRes, customerRes, messageRes, reviewRes, fareRes, settingRes] = await Promise.all([
      supabase.from("travel_routes").select("*, drivers(name)").order("depart_at", { ascending: true }),
      supabase.from("drivers").select("*").order("name"),
      supabase.from("pool_bookings").select("*, customer_profiles(name,mobile), travel_routes(origin,destination,depart_at)").order("created_at", { ascending: false }),
      supabase.from("rides").select("id,ride_id,number_of_seats,total_amount,status,created_at,customers(name,mobile),destinations(name),payments(id,method,status)").order("created_at", { ascending: false }).limit(200),
      supabase.from("customer_profiles").select("*").order("created_at", { ascending: false }),
      supabase.from("contact_messages").select("*").order("created_at", { ascending: false }),
      supabase.from("testimonials").select("*").order("created_at", { ascending: false }),
      supabase.from("destinations").select("*").order("sort_order"),
      supabase.from("site_settings").select("*").eq("id", "roveya").maybeSingle(),
    ]);
    setRoutes(routeRes.data ?? []);
    if (routeRes.error) setNotice(routeRes.error.message);
    setDrivers(driverRes.data ?? []);
    setRequests(requestRes.data ?? []);
    setRides(
      (rideRes.data ?? []).map((row) => {
        const customer = one(row.customers as { name: string; mobile: string } | { name: string; mobile: string }[] | null);
        const destination = one(row.destinations as { name: string } | { name: string }[] | null);
        const payments = (row.payments ?? []) as { id: string; method: string; status: string }[];
        const cash = payments.find((payment) => payment.method === "CASH" && payment.status !== "PAID");
        return { ...row, customerName: customer?.name ?? "", mobile: customer?.mobile ?? "", destinationName: destination?.name ?? "", cashPaymentId: cash?.id ?? "" };
      }),
    );
    setCustomers(customerRes.data ?? []);
    setMessages(messageRes.data ?? []);
    setReviews(reviewRes.data ?? []);
    setFares(fareRes.data ?? []);
    setSettings(settingRes.data as Record<string, string> | null);
    const site = process.env.NEXT_PUBLIC_WEBSITE_URL ?? "http://localhost:3002";
    setQr(await QRCode.toDataURL(`${site.replace(/\/$/, "")}/pay`, { margin: 1, width: 320, color: { dark: "#F6F1DC", light: "#14080F" } }));
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function openNew() {
    setNotice("");
    setEditing({});
  }

  async function remove(table: string, id: string) {
    if (!window.confirm("Delete this record?")) return;
    const result = await supabase.from(table).delete().eq("id", id);
    if (result.error) setNotice(result.error.message);
    else {
      setEditing(null);
      await load();
    }
  }

  async function save(table: string, payload: Record<string, unknown>, id?: string) {
    const result = id ? await supabase.from(table).update(payload).eq("id", id) : await supabase.from(table).insert(payload);
    if (result.error) {
      setNotice(result.error.message);
      return;
    }
    setEditing(null);
    setNotice("");
    await load();
  }

  const ceo = staff?.role === "CEO";
  const waiting = requests.filter((row) => row.status === "REQUESTED").length;
  const current = [...nav, ...platformNav].find((item) => item.id === section) ?? nav[0];
  const platform = platformNav.some((item) => item.id === section);
  const initials = (staff?.name ?? "R")
    .split(" ")
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();

  function openSection(id: Section) {
    setSection(id);
    setEditing(null);
    setQuery("");
  }

  return (
    <div className="flex min-h-screen bg-[#12060D]">
      <aside className="sticky top-0 hidden h-screen w-[17.5rem] shrink-0 flex-col border-r border-[#D6A000]/20 bg-[#0C0308] px-5 py-6 lg:flex">
        <Logo href="/" />
        <p className="mt-8 px-3 text-[10px] uppercase tracking-[0.22em] text-[#F6F1DC]/40">Operations</p>
        <nav className="mt-3 flex flex-1 flex-col gap-1 overflow-y-auto">
          {nav.map((item) => {
            const active = section === item.id;
            const badge = item.id === "requests" ? waiting : 0;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => openSection(item.id)}
                className={`flex items-center justify-between rounded-2xl px-3 py-2.5 text-left text-sm transition ${active ? "bg-[#4C102C] text-[#F6F1DC] shadow-[inset_3px_0_0_#D6A000]" : "text-[#F6F1DC]/70 hover:bg-[#241018] hover:text-[#F6F1DC]"}`}
              >
                <span>{item.label}</span>
                {badge > 0 ? <span className="rounded-full bg-[#D6A000] px-2 py-0.5 text-[10px] font-semibold text-[#2A1020]">{badge}</span> : null}
              </button>
            );
          })}
          <p className="mt-6 px-3 text-[10px] uppercase tracking-[0.22em] text-[#F6F1DC]/40">Ride platform</p>
          {platformNav.map((item) => {
            const active = section === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => openSection(item.id)}
                className={`flex items-center justify-between rounded-2xl px-3 py-2.5 text-left text-sm transition ${active ? "bg-[#4C102C] text-[#F6F1DC] shadow-[inset_3px_0_0_#D6A000]" : "text-[#F6F1DC]/70 hover:bg-[#241018] hover:text-[#F6F1DC]"}`}
              >
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
        <div className="mt-4 flex items-center gap-3 border-t border-[#D6A000]/20 pt-4">
          <span className="flex h-10 w-10 items-center justify-center rounded-full border border-[#D6A000] text-xs font-semibold text-[#E0B23A]">{initials}</span>
          <div className="min-w-0">
            <p className="truncate text-sm">{staff?.name ?? "Desk"}</p>
            <p className="text-[10px] uppercase tracking-[0.16em] text-[#D6A000]">{staff?.role}</p>
          </div>
          <button type="button" className="ml-auto text-[10px] uppercase tracking-[0.14em] text-[#F6F1DC]/50" onClick={() => void supabase.auth.signOut().then(() => router.replace("/login"))}>
            Out
          </button>
        </div>
      </aside>
      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-20 border-b border-[#D6A000]/20 bg-[#12060D]/95 px-4 py-4 backdrop-blur-md sm:px-6 lg:px-10">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="kicker">ROVEYA desk</p>
              <h1 className="display mt-2 text-4xl text-[#F6F1DC] sm:text-5xl">{current.label}</h1>
              <p className="mt-2 max-w-xl text-sm leading-6 text-[#F6F1DC]/65">{current.hint}</p>
            </div>
            <button type="button" className="shrink-0 text-xs uppercase tracking-[0.16em] text-[#D6A000] lg:hidden" onClick={() => void supabase.auth.signOut().then(() => router.replace("/login"))}>
              Sign out
            </button>
          </div>
        </header>
        <div className="flex gap-2 overflow-x-auto px-4 py-3 lg:hidden">
          {[...nav, ...platformNav].map((item) => (
            <button
              key={item.id}
              type="button"
              className={`shrink-0 rounded-full px-4 py-2 text-[11px] font-semibold tracking-[0.12em] uppercase ${section === item.id ? "bg-[#6B1838] text-[#F6F1DC] shadow-[0_0_0_1px_#D6A000]" : "border border-[#D6A000]/30 text-[#F6F1DC]/80"}`}
              onClick={() => openSection(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
        <main className="space-y-5 px-4 py-6 sm:px-6 lg:px-10">
          {notice ? <p className="rounded-2xl border border-[#D6A000]/40 bg-[#241018] px-4 py-3 text-sm text-[#E0B23A]">{notice}</p> : null}
          {platform ? <PlatformSectionView section={section as PlatformSection} ceo={ceo} onNotice={setNotice} onOpen={openSection} /> : null}
          {!platform && section !== "overview" && section !== "qr" && section !== "settings" ? (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name, city, phone or status" className="field sm:max-w-sm" />
              {["routes", "drivers", "reviews"].includes(section) ? (
                <button type="button" className="btn" onClick={openNew}>Add new</button>
              ) : null}
            </div>
          ) : null}

          {section === "overview" ? <Overview routes={routes} requests={requests} rides={rides} onOpen={openSection} /> : null}
          {section === "routes" ? (
            <RoutesGrid
              rows={filterRows(routes, query)}
              drivers={drivers}
              editing={editing}
              onEdit={setEditing}
              onDelete={(id) => void remove("travel_routes", id)}
              onSave={(payload, id) => void save("travel_routes", payload, id)}
            />
          ) : null}
          {section === "drivers" ? (
            <DriversGrid
              rows={filterRows(drivers, query)}
              editing={editing}
              onEdit={setEditing}
              onDelete={(id) => void remove("drivers", id)}
              onSave={(payload, id) => void save("drivers", payload, id)}
            />
          ) : null}
          {section === "requests" ? (
            <RequestsGrid
              rows={filterRows(requests, query)}
              editing={editing}
              onEdit={setEditing}
              onDelete={(id) => void remove("pool_bookings", id)}
              onSave={(payload, id) => void save("pool_bookings", payload, id)}
            />
          ) : null}
          {section === "rides" ? <RidesGrid rows={filterRows(rides, query)} onConfirm={(ride) => void confirmCash(supabase, ride, setNotice, load)} /> : null}
          {section === "customers" ? <CustomersGrid rows={filterRows(customers, query)} /> : null}
          {section === "messages" ? <MessagesGrid rows={filterRows(messages, query)} onDelete={(id) => void remove("contact_messages", id)} /> : null}
          {section === "reviews" ? (
            <ReviewsGrid
              rows={filterRows(reviews, query)}
              editing={editing}
              onEdit={setEditing}
              onDelete={(id) => void remove("testimonials", id)}
              onSave={(payload, id) => void save("testimonials", payload, id)}
            />
          ) : null}
          {section === "settings" ? <SettingsForm settings={settings} ceo={ceo} onSave={(payload) => void save("site_settings", payload, "roveya")} /> : null}
          {section === "qr" ? (
            <article className="panel mx-auto max-w-lg px-8 py-10 text-center">
              <p className="kicker">Inside the vehicle</p>
              <h2 className="display mt-3 text-4xl">Scan to pay</h2>
              <p className="mx-auto mt-3 max-w-sm text-sm leading-6 text-[#F6F1DC]/65">Print this once and keep it in the taxi. It opens the same payment page every time.</p>
              {qr ? <img src={qr} alt="Vehicle payment QR" className="mx-auto mt-8 w-64 rounded-3xl border border-[#D6A000]/30 bg-[#241018] p-4" /> : null}
            </article>
          ) : null}
        </main>
      </div>
    </div>
  );
}

function filterRows(rows: Record<string, unknown>[], query: string) {
  const needle = query.trim().toLowerCase();
  if (!needle) return rows;
  return rows.filter((row) => JSON.stringify(row).toLowerCase().includes(needle));
}

async function confirmCash(
  supabase: ReturnType<typeof createClient>,
  ride: Record<string, unknown>,
  setNotice: (value: string) => void,
  load: () => Promise<void>,
) {
  const payment = await supabase.from("payments").update({ status: "PAID", paid_at: new Date().toISOString() }).eq("id", String(ride.cashPaymentId));
  if (payment.error) {
    setNotice(payment.error.message);
    return;
  }
  const updated = await supabase.from("rides").update({ status: "PAID" }).eq("id", String(ride.id));
  if (updated.error) setNotice(updated.error.message);
  else await load();
}

function Overview({
  routes,
  requests,
  rides,
  onOpen,
}: {
  routes: Record<string, unknown>[];
  requests: Record<string, unknown>[];
  rides: Record<string, unknown>[];
  onOpen: (id: Section) => void;
}) {
  const cards = [
    ["Live routes", routes.filter((row) => row.is_active).length, "routes"],
    ["Waiting seats", requests.filter((row) => row.status === "REQUESTED").length, "requests"],
    ["Drivers assigned", new Set(routes.map((row) => row.driver_id).filter(Boolean)).size, "drivers"],
    ["Paid rides", rides.filter((row) => row.status === "PAID").length, "rides"],
  ] as const;
  const upcoming = [...routes].filter((row) => row.is_active).slice(0, 4);
  const waiting = requests.filter((row) => row.status === "REQUESTED").slice(0, 4);
  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map(([label, value, id]) => (
          <button key={label} type="button" onClick={() => onOpen(id)} className="panel p-6 text-left transition hover:-translate-y-0.5 hover:shadow-[0_0_0_1px_#D6A000]">
            <p className="kicker">{label}</p>
            <p className="display mt-4 text-5xl text-[#F6F1DC]">{value}</p>
          </button>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <article className="panel p-6">
          <p className="kicker">Next departures</p>
          <ul className="mt-5 space-y-4">
            {upcoming.length === 0 ? <li className="text-sm text-[#F6F1DC]/55">No live routes yet.</li> : null}
            {upcoming.map((row) => (
              <li key={String(row.id)} className="flex items-baseline justify-between gap-4 border-b border-[#D6A000]/15 pb-3 last:border-0">
                <span>{String(row.origin)} → {String(row.destination)}</span>
                <span className="shrink-0 text-sm text-[#D6A000]">{when(String(row.depart_at))}</span>
              </li>
            ))}
          </ul>
        </article>
        <article className="panel p-6">
          <p className="kicker">Needs a decision</p>
          <ul className="mt-5 space-y-4">
            {waiting.length === 0 ? <li className="text-sm text-[#F6F1DC]/55">No seat requests are waiting.</li> : null}
            {waiting.map((row) => {
              const person = one(row.customer_profiles as { name: string } | { name: string }[] | null);
              const route = one(row.travel_routes as { origin: string; destination: string } | { origin: string; destination: string }[] | null);
              return (
                <li key={String(row.id)} className="flex items-baseline justify-between gap-4 border-b border-[#D6A000]/15 pb-3 last:border-0">
                  <span>{person?.name ?? "Passenger"} · {String(row.seats)} seat{Number(row.seats) > 1 ? "s" : ""}</span>
                  <span className="shrink-0 text-sm text-[#F6F1DC]/60">{route ? `${route.origin} → ${route.destination}` : ""}</span>
                </li>
              );
            })}
          </ul>
        </article>
      </div>
    </div>
  );
}

function Table({ children }: { children: React.ReactNode }) {
  return (
    <div className="panel overflow-x-auto">
      <table className="w-full min-w-[860px] border-separate border-spacing-0 text-left text-sm">{children}</table>
    </div>
  );
}

function Status({ value }: { value: string }) {
  const good = ["PAID", "CONFIRMED", "ACTIVE", "YES"].includes(value.toUpperCase());
  const quiet = ["PAUSED", "DECLINED", "CANCELLED", "NO"].includes(value.toUpperCase());
  return <span className={`pill ${good ? "pill-good" : ""} ${quiet ? "pill-quiet" : ""}`}>{value.replaceAll("_", " ")}</span>;
}

function Empty({ title }: { title: string }) {
  return (
    <div className="panel px-6 py-16 text-center">
      <p className="display text-4xl">{title}</p>
      <p className="mt-3 text-sm text-[#F6F1DC]/55">Nothing is listed here yet.</p>
    </div>
  );
}
function Head({ labels }: { labels: string[] }) {
  return (
    <thead className="text-[11px] uppercase tracking-[0.14em]">
      <tr>
        {labels.map((label) => (
          <th key={label} className="border-b border-[#D6A000]/15 px-4 py-3 font-medium">{label}</th>
        ))}
      </tr>
    </thead>
  );
}

function RoutesGrid({
  rows,
  drivers,
  editing,
  onEdit,
  onDelete,
  onSave,
}: {
  rows: Record<string, unknown>[];
  drivers: Record<string, unknown>[];
  editing: Record<string, string> | null;
  onEdit: (row: Record<string, string> | null) => void;
  onDelete: (id: string) => void;
  onSave: (payload: Record<string, unknown>, id?: string) => void;
}) {
  return (
    <div className="space-y-4">
      {editing ? (
        <Editor
          title={editing.id ? "Edit route" : "New route"}
          onClose={() => onEdit(null)}
          onSubmit={(form) =>
            onSave(
              {
                origin: form.get("origin"),
                destination: form.get("destination"),
                depart_at: fromInput(String(form.get("depart"))),
                arrive_at: fromInput(String(form.get("arrive"))),
                fare_per_seat: Number(form.get("fare")),
                seats_total: Number(form.get("seats")),
                driver_id: String(form.get("driver") || "") || null,
                notes: form.get("notes") || null,
                is_active: form.get("active") === "on",
              },
              editing.id,
            )
          }
        >
          <input name="origin" required defaultValue={editing.origin ?? ""} placeholder="Starting point" className="field" />
          <input name="destination" required defaultValue={editing.destination ?? ""} placeholder="Destination" className="field" />
          <input name="depart" required type="datetime-local" defaultValue={editing.depart_at ? toInput(editing.depart_at) : ""} className="field" />
          <input name="arrive" required type="datetime-local" defaultValue={editing.arrive_at ? toInput(editing.arrive_at) : ""} className="field" />
          <input name="fare" required type="number" min={1} defaultValue={editing.fare_per_seat ?? ""} placeholder="Fare per seat" className="field" />
          <input name="seats" required type="number" min={1} max={8} defaultValue={editing.seats_total ?? 4} className="field" />
          <select name="driver" defaultValue={editing.driver_id ?? ""} className="field">
            <option value="">No driver yet</option>
            {drivers.map((driver) => (
              <option key={String(driver.id)} value={String(driver.id)}>{String(driver.name)}</option>
            ))}
          </select>
          <input name="notes" defaultValue={editing.notes ?? ""} placeholder="Notes" className="field" />
          <label className="text-sm"><input name="active" type="checkbox" defaultChecked={editing.is_active !== "false"} className="mr-2" />Live on the website</label>
        </Editor>
      ) : null}
      <Table>
        <Head labels={["Route", "Leaves", "Arrives", "Fare", "Seats", "Driver", ""]} />
        <tbody>
          {rows.map((row) => {
            const driver = one(row.drivers as { name: string } | { name: string }[] | null);
            return (
              <tr key={String(row.id)} className="border-t border-white/5">
                <td className="px-4 py-3">{String(row.origin)} → {String(row.destination)}</td>
                <td className="px-4 py-3">{when(String(row.depart_at))}</td>
                <td className="px-4 py-3">{when(String(row.arrive_at))}</td>
                <td className="px-4 py-3">{formatInr(Number(row.fare_per_seat))}</td>
                <td className="px-4 py-3">{String(row.seats_total)}</td>
                <td className="px-4 py-3">{driver?.name ?? "Unassigned"}</td>
                <td className="px-4 py-3 text-right">
                  <RowActions onEdit={() => onEdit(stringify(row))} onDelete={() => onDelete(String(row.id))} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </Table>
    </div>
  );
}

function DriversGrid({
  rows,
  editing,
  onEdit,
  onDelete,
  onSave,
}: {
  rows: Record<string, unknown>[];
  editing: Record<string, string> | null;
  onEdit: (row: Record<string, string> | null) => void;
  onDelete: (id: string) => void;
  onSave: (payload: Record<string, unknown>, id?: string) => void;
}) {
  return (
    <div className="space-y-4">
      {editing ? (
        <Editor
          title={editing.id ? "Edit driver" : "Add hired driver"}
          onClose={() => onEdit(null)}
          onSubmit={(form) =>
            onSave(
              {
                name: form.get("name"),
                mobile: String(form.get("mobile") ?? "").replace(/\D/g, "").slice(-10),
                vehicle_number: form.get("vehicle_number"),
                vehicle_name: form.get("vehicle_name") || null,
                photo_url: String(form.get("photo_url") ?? "").trim() || null,
                is_active: form.get("active") === "on",
              },
              editing.id,
            )
          }
        >
          <input name="name" required defaultValue={editing.name ?? ""} placeholder="Driver name" className="field" />
          <input name="mobile" required defaultValue={editing.mobile ?? ""} placeholder="Mobile" className="field" />
          <input name="vehicle_number" required defaultValue={editing.vehicle_number ?? ""} placeholder="Vehicle number" className="field" />
          <input name="vehicle_name" defaultValue={editing.vehicle_name ?? ""} placeholder="Vehicle name" className="field" />
          <input name="photo_url" defaultValue={editing.photo_url ?? ""} placeholder="Profile photo URL" className="field" />
          <label className="text-sm"><input name="active" type="checkbox" defaultChecked={editing.is_active !== "false"} className="mr-2" />Active</label>
        </Editor>
      ) : null}
      <Table>
        <Head labels={["Name", "Mobile", "Vehicle", "Number", "Status", ""]} />
        <tbody>
          {rows.map((row) => (
            <tr key={String(row.id)}>
              <td className="px-4 py-3">{String(row.name)}</td>
              <td className="px-4 py-3">{formatMobile(String(row.mobile))}</td>
              <td className="px-4 py-3">{String(row.vehicle_name ?? "—")}</td>
              <td className="px-4 py-3">{String(row.vehicle_number)}</td>
              <td className="px-4 py-3"><Status value={row.is_active ? "Active" : "Paused"} /></td>
              <td className="px-4 py-3 text-right"><RowActions onEdit={() => onEdit(stringify(row))} onDelete={() => onDelete(String(row.id))} /></td>
            </tr>
          ))}
        </tbody>
      </Table>
    </div>
  );
}

function RequestsGrid({
  rows,
  editing,
  onEdit,
  onDelete,
  onSave,
}: {
  rows: Record<string, unknown>[];
  editing: Record<string, string> | null;
  onEdit: (row: Record<string, string> | null) => void;
  onDelete: (id: string) => void;
  onSave: (payload: Record<string, unknown>, id?: string) => void;
}) {
  return (
    <div className="space-y-4">
      {editing?.id ? (
        <Editor
          title="Update seat request"
          onClose={() => onEdit(null)}
          onSubmit={(form) => onSave({ status: form.get("status"), seats: Number(form.get("seats")) }, editing.id)}
        >
          <input name="seats" type="number" min={1} max={6} defaultValue={editing.seats} className="field" />
          <select name="status" defaultValue={editing.status} className="field">
            {["REQUESTED", "CONFIRMED", "DECLINED", "CANCELLED"].map((status) => (
              <option key={status}>{status}</option>
            ))}
          </select>
        </Editor>
      ) : null}
      <Table>
        <Head labels={["Passenger", "Route", "Seats", "Status", ""]} />
        <tbody>
          {rows.map((row) => {
            const person = one(row.customer_profiles as { name: string; mobile: string } | { name: string; mobile: string }[] | null);
            const route = one(row.travel_routes as { origin: string; destination: string; depart_at: string } | { origin: string; destination: string; depart_at: string }[] | null);
            return (
              <tr key={String(row.id)}>
                <td className="px-4 py-3">{person?.name ?? "Passenger"}<div className="text-xs text-[#F6F1DC]/45">{person ? formatMobile(person.mobile) : ""}</div></td>
                <td className="px-4 py-3">{route ? `${route.origin} → ${route.destination}` : "—"}<div className="text-xs text-[#F6F1DC]/45">{route ? when(route.depart_at) : ""}</div></td>
                <td className="px-4 py-3">{String(row.seats)}</td>
                <td className="px-4 py-3"><Status value={String(row.status)} /></td>
                <td className="px-4 py-3 text-right"><RowActions onEdit={() => onEdit(stringify(row))} onDelete={() => onDelete(String(row.id))} /></td>
              </tr>
            );
          })}
        </tbody>
      </Table>
    </div>
  );
}

function RidesGrid({ rows, onConfirm }: { rows: Record<string, unknown>[]; onConfirm: (row: Record<string, unknown>) => void }) {
  if (rows.length === 0) return <Empty title="No ride payments yet" />;
  return (
    <Table>
      <Head labels={["Ride", "Passenger", "Route", "Total", "Status", ""]} />
      <tbody>
        {rows.map((row) => (
          <tr key={String(row.id)}>
            <td className="px-4 py-3">{String(row.ride_id)}</td>
            <td className="px-4 py-3">{String(row.customerName)}<div className="text-xs text-[#F6F1DC]/45">{formatMobile(String(row.mobile))}</div></td>
            <td className="px-4 py-3">{String(row.destinationName)} · {String(row.number_of_seats)} seats</td>
            <td className="px-4 py-3">{formatInr(Number(row.total_amount))}</td>
            <td className="px-4 py-3"><Status value={String(row.status)} /></td>
            <td className="px-4 py-3 text-right">
              {row.status === "CASH_PENDING" && row.cashPaymentId ? <button type="button" className="btn" onClick={() => onConfirm(row)}>Confirm cash</button> : null}
            </td>
          </tr>
        ))}
      </tbody>
    </Table>
  );
}

function CustomersGrid({ rows }: { rows: Record<string, unknown>[] }) {
  if (rows.length === 0) return <Empty title="No customers yet" />;
  return (
    <Table>
      <Head labels={["Name", "Mobile", "Email account", "Joined"]} />
      <tbody>
        {rows.map((row) => (
          <tr key={String(row.id)}>
            <td className="px-4 py-3">{String(row.name)}</td>
            <td className="px-4 py-3">{formatMobile(String(row.mobile))}</td>
            <td className="px-4 py-3">Registered</td>
            <td className="px-4 py-3">{when(String(row.created_at))}</td>
          </tr>
        ))}
      </tbody>
    </Table>
  );
}

function MessagesGrid({ rows, onDelete }: { rows: Record<string, unknown>[]; onDelete: (id: string) => void }) {
  if (rows.length === 0) return <Empty title="No messages yet" />;
  return (
    <div className="grid gap-3">
      {rows.map((row) => (
        <article key={String(row.id)} className="panel p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="font-medium">{String(row.name)}</p>
              <p className="text-xs text-[#F6F1DC]/50">{formatMobile(String(row.mobile))} {row.email ? `· ${String(row.email)}` : ""}</p>
              <p className="mt-3 text-sm leading-7">{String(row.message)}</p>
            </div>
            <button type="button" className="btn-quiet" onClick={() => onDelete(String(row.id))}>Delete</button>
          </div>
        </article>
      ))}
    </div>
  );
}

function ReviewsGrid({
  rows,
  editing,
  onEdit,
  onDelete,
  onSave,
}: {
  rows: Record<string, unknown>[];
  editing: Record<string, string> | null;
  onEdit: (row: Record<string, string> | null) => void;
  onDelete: (id: string) => void;
  onSave: (payload: Record<string, unknown>, id?: string) => void;
}) {
  return (
    <div className="space-y-4">
      {editing ? (
        <Editor
          title={editing.id ? "Edit review" : "New review"}
          onClose={() => onEdit(null)}
          onSubmit={(form) =>
            onSave(
              {
                name: form.get("name"),
                route: form.get("route") || null,
                rating: Number(form.get("rating")),
                quote: form.get("quote"),
                published: form.get("published") === "on",
              },
              editing.id,
            )
          }
        >
          <input name="name" required defaultValue={editing.name ?? ""} placeholder="Name" className="field" />
          <input name="route" defaultValue={editing.route ?? ""} placeholder="Route" className="field" />
          <input name="rating" type="number" min={1} max={5} defaultValue={editing.rating ?? 5} className="field" />
          <textarea name="quote" required defaultValue={editing.quote ?? ""} className="field md:col-span-2" rows={3} />
          <label className="text-sm"><input name="published" type="checkbox" defaultChecked={editing.published !== "false"} className="mr-2" />Show on the website</label>
        </Editor>
      ) : null}
      <Table>
        <Head labels={["Name", "Route", "Rating", "Quote", "Visible", ""]} />
        <tbody>
          {rows.map((row) => (
            <tr key={String(row.id)}>
              <td className="px-4 py-3">{String(row.name)}</td>
              <td className="px-4 py-3">{String(row.route ?? "—")}</td>
              <td className="px-4 py-3">{String(row.rating)}</td>
              <td className="max-w-xs px-4 py-3">{String(row.quote)}</td>
              <td className="px-4 py-3"><Status value={row.published ? "Yes" : "No"} /></td>
              <td className="px-4 py-3 text-right"><RowActions onEdit={() => onEdit(stringify(row))} onDelete={() => onDelete(String(row.id))} /></td>
            </tr>
          ))}
        </tbody>
      </Table>
    </div>
  );
}

function FaresGrid({
  rows,
  ceo,
  editing,
  onEdit,
  onDelete,
  onSave,
}: {
  rows: Record<string, unknown>[];
  ceo: boolean;
  editing: Record<string, string> | null;
  onEdit: (row: Record<string, string> | null) => void;
  onDelete: (id: string) => void;
  onSave: (payload: Record<string, unknown>, id?: string) => void;
}) {
  return (
    <div className="space-y-4">
      {!ceo ? <p className="text-sm text-[#F6F1DC]/60">Only the CEO can change in-car pay fares.</p> : null}
      {editing && ceo ? (
        <Editor
          title={editing.id ? "Edit fare" : "New pay destination"}
          onClose={() => onEdit(null)}
          onSubmit={(form) =>
            onSave(
              {
                name: form.get("name"),
                slug: slugify(String(form.get("name") ?? "")),
                fare_per_seat: Number(form.get("fare")),
                description: form.get("description") || null,
                is_active: form.get("active") === "on",
                sort_order: Number(form.get("sort") ?? 0),
              },
              editing.id,
            )
          }
        >
          <input name="name" required defaultValue={editing.name ?? ""} className="field" />
          <input name="fare" required type="number" defaultValue={editing.fare_per_seat ?? ""} className="field" />
          <input name="description" defaultValue={editing.description ?? ""} className="field" />
          <input name="sort" type="number" defaultValue={editing.sort_order ?? 0} className="field" />
          <label className="text-sm"><input name="active" type="checkbox" defaultChecked={editing.is_active !== "false"} className="mr-2" />Active</label>
        </Editor>
      ) : null}
      <Table>
        <Head labels={["Destination", "Fare", "Live", ""]} />
        <tbody>
          {rows.map((row) => (
            <tr key={String(row.id)}>
              <td className="px-4 py-3">{String(row.name)}</td>
              <td className="px-4 py-3">{formatInr(Number(row.fare_per_seat))}</td>
              <td className="px-4 py-3">{row.is_active ? "Yes" : "No"}</td>
              <td className="px-4 py-3 text-right">{ceo ? <RowActions onEdit={() => onEdit(stringify(row))} onDelete={() => onDelete(String(row.id))} /> : null}</td>
            </tr>
          ))}
        </tbody>
      </Table>
    </div>
  );
}

function SettingsForm({
  settings,
  ceo,
  onSave,
}: {
  settings: Record<string, string> | null;
  ceo: boolean;
  onSave: (payload: Record<string, unknown>) => void;
}) {
  if (!settings) return null;
  const fields = [
    ["phone", "Phone"],
    ["whatsapp", "WhatsApp"],
    ["email", "Email"],
    ["address", "Address"],
    ["hours", "Hours"],
    ["instagram_url", "Instagram"],
    ["facebook_url", "Facebook"],
    ["twitter_url", "X"],
  ] as const;
  return (
    <form
      className="panel grid max-w-3xl gap-4 p-6 md:grid-cols-2"
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        onSave({
          phone: form.get("phone"),
          whatsapp: form.get("whatsapp"),
          email: form.get("email"),
          address: form.get("address"),
          hours: form.get("hours"),
          instagram_url: form.get("instagram_url") || null,
          facebook_url: form.get("facebook_url") || null,
          twitter_url: form.get("twitter_url") || null,
        });
      }}
    >
      {!ceo ? <p className="text-sm text-[#F6F1DC]/60 md:col-span-2">Only the CEO can change the public desk details.</p> : null}
      {fields.map(([name, label]) => (
        <label key={name} className="text-xs uppercase tracking-[0.14em] text-[#F6F1DC]/55">
          {label}
          <input name={name} defaultValue={settings[name] ?? ""} disabled={!ceo} className="field mt-2 normal-case tracking-normal" />
        </label>
      ))}
      {ceo ? <button className="btn md:col-span-2">Save on the website</button> : null}
    </form>
  );
}

function Editor({
  title,
  children,
  onClose,
  onSubmit,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  onSubmit: (form: FormData) => void;
}) {
  return (
    <form
      className="panel grid gap-3 p-5 md:grid-cols-2"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit(new FormData(event.currentTarget));
      }}
    >
      <div className="flex items-center justify-between md:col-span-2">
        <h2 className="display text-3xl">{title}</h2>
        <button type="button" onClick={onClose} className="text-xs tracking-[0.14em] uppercase text-[#F6F1DC]/60">Close</button>
      </div>
      {children}
      <button className="btn md:col-span-2">Save</button>
    </form>
  );
}

function RowActions({ onEdit, onDelete }: { onEdit: () => void; onDelete: () => void }) {
  return (
    <span className="inline-flex gap-2">
      <button type="button" className="btn-quiet" onClick={onEdit}>Edit</button>
      <button type="button" className="btn-quiet" onClick={onDelete}>Delete</button>
    </span>
  );
}

function stringify(row: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(row).map(([key, value]) => [key, value == null ? "" : String(value)]));
}
