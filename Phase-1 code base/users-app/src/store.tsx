import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { bookingFeeForSeats, refreshBookingFee } from "./bookingFee";
import { cashLog, todayIso } from "./data";
import { departInstant, refundFor } from "./refundPolicy";
import { cancelRemote, holdSeats, live, logout, myBookings, payBooking, restoreRider, saveName, walletRemote, type BookingQuote } from "./remote";
import { api } from "./backend";
import { forgetPush, registerPush } from "./push";
import type { Booking, Seat, StopPoint, Traveller, Trip } from "./types";

type Search = { fromId: string; toId: string; date: string };

type Draft = {
  trip: Trip;
  seats: Seat[];
  boarding: StopPoint | null;
  drop: StopPoint | null;
  travellers: Traveller[];
  phone: string;
  email: string;
  secured: boolean;
  coupon: string;
  discount: number;
  useCash: boolean;
  // Set once the server holds the seats; the server's totals are what gets charged.
  bookingId?: string;
  holdUntil?: string;
  quote?: BookingQuote;
};

type Store = {
  live: boolean;
  ready: boolean;
  user: { name: string; phone: string } | null;
  signIn: (phone: string, name?: string) => void;
  setName: (name: string) => void;
  signOut: () => void;
  onboarded: boolean;
  finishOnboarding: () => void;
  search: Search;
  setSearch: (patch: Partial<Search>) => void;
  recent: Search[];
  rememberSearch: () => void;
  draft: Draft | null;
  startDraft: (trip: Trip, seats: Seat[]) => void;
  patchDraft: (patch: Partial<Draft>) => void;
  hold: () => Promise<void>;
  bookings: Booking[];
  reloadBookings: () => Promise<void>;
  checkout: (method: "online" | "wallet", paidWith: string) => Promise<Booking | null>;
  cancel: (pnr: string) => Promise<number>;
  cash: number;
  cashEntries: typeof cashLog;
  reloadWallet: () => Promise<void>;
  womenOnly: boolean;
  setWomenOnly: (on: boolean) => void;
  cityId: string;
  setCity: (cityId: string) => void;
  contacts: Contact[];
  saveContact: (contact: Contact) => void;
  removeContact: (phone: string) => void;
  student: "none" | "pending" | "verified";
  applyStudent: () => void;
  alerts: Record<AlertKey, boolean>;
  setAlert: (key: AlertKey, on: boolean) => void;
};

export type Contact = { name: string; phone: string };

export const MAX_CONTACTS = 5;
export type AlertKey = "trip" | "offers" | "whatsapp" | "email";

const Ctx = createContext<Store | null>(null);

export const SECURE_FEE = 19;

export function draftTotals(draft: Draft, cash: number) {
  void cash;
  if (draft.quote) return draft.quote;
  const fare = draft.seats.reduce((sum, seat) => sum + seat.price, 0);
  const bill = bookingFeeForSeats(draft.seats.map((seat) => seat.price));
  const secure = draft.secured ? SECURE_FEE * draft.seats.length : 0;
  const beforeCash = Math.max(0, fare + bill.fee + bill.gst + secure);
  return { fare, bookingFee: bill.fee, secure, gst: bill.gst, discount: 0, cashUsed: 0, total: beforeCash };
}

const shortDay = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });

export function StoreProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(!live);
  const [user, setUser] = useState<Store["user"]>(null);
  const [onboarded, setOnboarded] = useState(false);
  const [search, setSearchState] = useState<Search>({ fromId: "hyd", toId: "vja", date: todayIso() });
  const [recent, setRecent] = useState<Search[]>([{ fromId: "hyd", toId: "kmm", date: todayIso() }]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [cashEntries, setCashEntries] = useState<typeof cashLog>([]);
  const [walletBalance, setWalletBalance] = useState<number | null>(null);
  const [womenOnly, setWomenOnly] = useState(false);
  const [cityId, setCityId] = useState("hyd");
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [student, setStudent] = useState<Store["student"]>("none");
  const [alerts, setAlerts] = useState<Record<AlertKey, boolean>>({ trip: true, offers: true, whatsapp: true, email: false });
  const cash = walletBalance ?? cashEntries.reduce((sum, entry) => sum + entry.amount, 0);
  const lastHold = useRef<string | null>(null);
  const [, setFeeTick] = useState(0);

  useEffect(() => {
    void refreshBookingFee().then(() => setFeeTick((value) => value + 1));
  }, []);

  const reloadBookings = useCallback(async () => {
    if (!live) return;
    setBookings(await myBookings());
  }, []);

  const reloadWallet = useCallback(async () => {
    if (!live) return;
    const wallet = await walletRemote();
    setWalletBalance(wallet.balance);
    setCashEntries(wallet.entries.map((entry) => ({ id: String(entry.id), label: entry.note ?? entry.kind, amount: entry.amount, at: shortDay(entry.at) })));
  }, []);

  useEffect(() => {
    if (!live) return;
    restoreRider()
      .then((rider) => {
        if (rider) {
          setUser(rider);
          setOnboarded(true);
        }
      })
      .catch(() => undefined)
      .finally(() => setReady(true));
  }, []);

  useEffect(() => {
    if (!live || !user) return;
    void registerPush();
    void api<{ contacts: Contact[] }>("/safety/contacts?app=rider")
      .then((result) => setContacts(result.contacts))
      .catch(() => undefined);
    void reloadBookings().catch(() => undefined);
    void reloadWallet().catch(() => undefined);
  }, [user?.phone, reloadBookings, reloadWallet]);

  const value = useMemo<Store>(
    () => ({
      live,
      ready,
      user,
      signIn: (phone, name) => {
        setUser((current) => ({ name: name ?? current?.name ?? "", phone }));
        setDraft((current) => (current && !current.phone ? { ...current, phone } : current));
      },
      setName: (name) => {
        setUser((current) => (current ? { ...current, name } : current));
        void saveName(name).catch(() => undefined);
      },
      signOut: () => {
        void forgetPush().finally(() => logout());
        setUser(null);
        setStudent("none");
        if (live) {
          setBookings([]);
          setCashEntries([]);
          setWalletBalance(null);
        }
      },
      onboarded,
      finishOnboarding: () => setOnboarded(true),
      search,
      setSearch: (patch) => setSearchState((current) => ({ ...current, ...patch })),
      recent,
      rememberSearch: () =>
        setRecent((list) => [search, ...list.filter((item) => item.fromId !== search.fromId || item.toId !== search.toId)].slice(0, 4)),
      draft,
      startDraft: (trip, seats) => {
        if (lastHold.current) {
          void cancelRemote(lastHold.current).catch(() => undefined);
          lastHold.current = null;
        }
        setDraft({
          trip,
          seats,
          boarding: trip.boarding.length === 1 ? trip.boarding[0] : null,
          drop: trip.drops.length === 1 ? trip.drops[0] : null,
          travellers: seats.map((seat) => ({ seatId: seat.id, name: "", age: "", gender: seat.state === "female" ? "Female" : null })),
          phone: user?.phone ?? "",
          email: "",
          secured: true,
          coupon: "",
          discount: 0,
          useCash: false,
        });
      },
      patchDraft: (patch) => setDraft((current) => (current ? { ...current, ...patch, ...(patch.bookingId === undefined && !("quote" in patch) ? { bookingId: undefined, holdUntil: undefined, quote: undefined } : null) } : current)),
      hold: async () => {
        if (!live || !draft || !draft.boarding || !draft.drop) return;
        if (draft.bookingId) return;
        // Details changed after an earlier hold; let those seats go before holding again.
        if (lastHold.current) await cancelRemote(lastHold.current).catch(() => undefined);
        const held = await holdSeats({
          tripId: draft.trip.id,
          travellers: draft.travellers.map((item) => ({ seatId: item.seatId, name: item.name.trim(), age: Number(item.age), gender: item.gender ?? "Male" })),
          boardingId: draft.boarding.id,
          dropId: draft.drop.id,
          phone: draft.phone,
          email: draft.email.trim(),
          secured: draft.secured,
          coupon: "",
          useCash: false,
        });
        lastHold.current = held.bookingId;
        setDraft((current) => (current ? { ...current, ...held } : current));
      },
      bookings,
      reloadBookings,
      checkout: async (method, paidWith) => {
        if (!draft || !draft.boarding || !draft.drop) return null;
        if (live) {
          if (!draft.bookingId) throw new Error("Your seats are no longer held. Go back and pick them again.");
          const booking = await payBooking(draft.bookingId, method);
          lastHold.current = null;
          setBookings((list) => [booking, ...list.filter((item) => item.pnr !== booking.pnr)]);
          setDraft(null);
          void reloadWallet().catch(() => undefined);
          return booking;
        }
        const totals = draftTotals(draft, cash);
        const booking: Booking = {
          pnr: `RVY${Math.floor(1000 + Math.random() * 8999)}${String.fromCharCode(65 + Math.floor(Math.random() * 26))}${String.fromCharCode(65 + Math.floor(Math.random() * 26))}`,
          trip: draft.trip,
          seats: draft.seats,
          travellers: draft.travellers,
          boarding: draft.boarding,
          drop: draft.drop,
          total: totals.total,
          discount: totals.discount + totals.cashUsed,
          secured: draft.secured,
          paidWith,
          phone: draft.phone,
          status: "Upcoming",
          bookedAt: todayIso(),
        };
        setBookings((list) => [booking, ...list]);
        if (totals.cashUsed) setCashEntries((list) => [{ id: `c-${Date.now()}`, label: `Used on ${booking.pnr}`, amount: -totals.cashUsed, at: "Today" }, ...list]);
        setDraft(null);
        return booking;
      },
      cancel: async (pnr) => {
        const booking = bookings.find((item) => item.pnr === pnr);
        if (!booking || booking.status !== "Upcoming") return 0;
        if (live && booking.id) {
          const result = await cancelRemote(booking.id);
          setBookings((list) => list.map((item) => (item.pnr === pnr ? result.booking : item)));
          void reloadWallet().catch(() => undefined);
          return result.refund;
        }
        const at = departInstant(booking.trip.departAt, booking.trip.date);
        if (!at || (booking.secured && booking.secure == null)) throw new Error("A refund estimate is not available for this booking.");
        const refund = refundFor(Math.round(booking.total * 100), Math.round((booking.secure ?? 0) * 100), booking.secured, at).refundPaise / 100;
        setBookings((list) => list.map((item) => (item.pnr === pnr ? { ...item, status: "Cancelled", refund } : item)));
        if (refund) setCashEntries((list) => [{ id: `r-${Date.now()}`, label: `Refund · ${pnr}`, amount: refund, at: "Today" }, ...list]);
        return refund;
      },
      cash,
      cashEntries,
      reloadWallet,
      womenOnly,
      setWomenOnly,
      cityId,
      setCity: (id) => {
        setCityId(id);
        setSearchState((current) => ({ ...current, fromId: id, toId: current.toId === id ? current.fromId : current.toId }));
      },
      contacts,
      // Kept on the server when live, so an SOS can reach them even from a new phone.
      saveContact: (contact) => {
        setContacts((list) => [...list.filter((item) => item.phone !== contact.phone), contact].slice(0, MAX_CONTACTS));
        if (live) void api<{ contacts: Contact[] }>("/safety/contacts?app=rider", { body: contact }).then((result) => setContacts(result.contacts)).catch(() => undefined);
      },
      removeContact: (phone) => {
        setContacts((list) => list.filter((item) => item.phone !== phone));
        if (live) void api<{ contacts: Contact[] }>("/safety/contacts?app=rider", { method: "DELETE", body: { phone } }).then((result) => setContacts(result.contacts)).catch(() => undefined);
      },
      student,
      applyStudent: () => setStudent("pending"),
      alerts,
      setAlert: (key, on) => setAlerts((all) => ({ ...all, [key]: on })),
    }),
    [ready, user, onboarded, search, recent, draft, bookings, cashEntries, cash, womenOnly, cityId, contacts, student, alerts, reloadBookings, reloadWallet],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore() {
  const value = useContext(Ctx);
  if (!value) throw new Error("StoreProvider is missing");
  return value;
}
