import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { api as request, live, loadSession, signOutRemote } from "./backend";
import { DEFAULT_FARE_CARD, refreshFareCard, type FareCard } from "./fareCard";
import { forgetPush, registerPush } from "./push";
import { stopDutyTracking } from "./tracking";
import { earned } from "./orders";
import { DEFAULT_RIDE_PLAN, refreshRidePlan, rideBill, type RidePlan } from "./ridePlan";
import { EMPTY_DAY_BOOK, dutyGate, noteCaptainCancel, offersBlocked, payDay, payMonth, pickupTooFar, settleDayBook, useDayOnCompletedTrip, type DayBook } from "./dayPlan";
import type { Captain, DocKey, DocStatus, Feedback, Job, Order, Trip, Txn, VehicleKind } from "./types";

const key = "roveya-captain";
const jobKey = "roveya-captain-job";

type ServerWallet = { balance: number; entries: { id: number; kind: string; amount: number; note: string | null; at: string }[] };
type ServerEarnings = { commissionPct: number; trips: { code: string; status: string; vehicle: VehicleKind; fare: number; bonus: number; commission: number; payment: string; pickup: string; drop: string; distanceKm: number; minutes: number; at: string; reason: string | null }[] };

const ledgerLabel: Record<string, string> = {
  ride_earning: "Ride earning",
  ride_bonus: "Ride bonus",
  commission: "ROVEYA commission",
  payout: "Redeemed to bank",
  payout_reversal: "Payout returned",
  adjustment: "Adjustment by ROVEYA",
  refund: "Refund",
};

// The server's wallet and last 30 days of rides, shaped for the screens.
function fromServer(wallet: ServerWallet | null, earnings: ServerEarnings | null) {
  return {
    balance: wallet?.balance ?? null,
    txns: wallet ? wallet.entries.map((entry): Txn => ({ id: `t-${entry.id}`, label: entry.note || ledgerLabel[entry.kind] || "Wallet", amount: entry.amount, at: Date.parse(entry.at) })) : null,
    trips: earnings
      ? earnings.trips
          .filter((trip) => trip.status === "completed" || trip.status === "cancelled")
          .map(
            (trip): Trip => ({
              id: trip.code,
              at: Date.parse(trip.at),
              vehicle: trip.vehicle,
              pickup: trip.pickup,
              drop: trip.drop,
              km: trip.distanceKm,
              minutes: trip.minutes,
              fare: trip.status === "completed" ? trip.fare : 0,
              bonus: trip.status === "completed" ? trip.bonus : 0,
              tip: 0,
              commission: trip.status === "completed" ? trip.commission : 0,
              payment: trip.payment === "upi" || trip.payment === "online" ? trip.payment : "cash",
              status: trip.status === "completed" ? "Completed" : "Cancelled",
              customer: "Passenger",
              reason: trip.reason ?? undefined,
            }),
          )
      : null,
  };
}

export type Prefs = { sound: boolean; vibrate: boolean; awake: boolean; nav: "google" | "inapp"; language: string };

type Store = {
  ready: boolean;
  captain: Captain | null;
  signedIn: boolean;
  online: boolean;
  onlineSince: number | null;
  loginMinutes: number;
  autoAccept: boolean;
  offer: Order | null;
  job: Job | null;
  trips: Trip[];
  txns: Txn[];
  wallet: number;
  feedback: Feedback[];
  prefs: Prefs;
  commissionPct: number;
  ridePlan: RidePlan;
  fareCard: FareCard;
  dayBook: DayBook;
  dutyLine: () => string;
  canDuty: () => boolean;
  payForToday: () => void;
  payForMonth: () => void;
  signIn: (phone: string) => "existing" | "new";
  register: (captain: Captain) => void;
  approve: () => void;
  updateCaptain: (patch: Partial<Captain>) => void;
  setDoc: (doc: DocKey, status: DocStatus) => void;
  setOnline: (on: boolean) => void;
  setAutoAccept: (on: boolean) => void;
  pushOffer: (order: Order) => void;
  adoptJob: (job: Job) => void;
  accept: () => void;
  reject: (reason: string) => void;
  patchJob: (patch: Partial<Job>) => void;
  cancelJob: (reason: string) => void;
  finishJob: (ratingGiven: number) => Trip | null;
  redeem: (amount: number) => boolean;
  setPref: <K extends keyof Prefs>(name: K, value: Prefs[K]) => void;
  signOut: () => void;
  refresh: () => Promise<void>;
};

const Ctx = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [captain, setCaptain] = useState<Captain | null>(null);
  const [signedIn, setSignedIn] = useState(false);
  const [online, setOnlineState] = useState(false);
  const [onlineSince, setOnlineSince] = useState<number | null>(null);
  const [loginMinutes, setLoginMinutes] = useState(0);
  const [autoAccept, setAutoAccept] = useState(false);
  const [offer, setOffer] = useState<Order | null>(null);
  const [job, setJob] = useState<Job | null>(null);
  const [jobReady, setJobReady] = useState(false);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [txns, setTxns] = useState<Txn[]>([]);
  const [feedback, setFeedback] = useState<Feedback[]>([]);
  const [balance, setBalance] = useState(0);
  const [commissionPct, setCommissionPct] = useState(0);
  const [ridePlan, setRidePlan] = useState<RidePlan>(DEFAULT_RIDE_PLAN);
  const [fareCard, setFareCard] = useState<FareCard>(DEFAULT_FARE_CARD);
  const [dayBook, setDayBook] = useState<DayBook>(EMPTY_DAY_BOOK);

  useEffect(() => {
    void refreshRidePlan().then(setRidePlan);
    void refreshFareCard().then(setFareCard);
  }, []);

  const refresh = async () => {
    if (!live) return;
    const [walletData, earningsData] = await Promise.all([request<ServerWallet>("/wallet").catch(() => null), request<ServerEarnings>("/captain/earnings?range=month").catch(() => null)]);
    if (earningsData) setCommissionPct(earningsData.commissionPct ?? 0);
    const next = fromServer(walletData, earningsData);
    if (next.balance !== null) setBalance(next.balance);
    if (next.txns) setTxns(next.txns);
    if (next.trips) setTrips(next.trips);
  };
  const refreshSoon = () => setTimeout(() => void refresh(), 1500);
  const [prefs, setPrefs] = useState<Prefs>({ sound: true, vibrate: true, awake: true, nav: "google", language: "English" });

  useEffect(() => {
    void AsyncStorage.getItem(jobKey)
      .then((raw) => {
        if (!raw) return;
        const saved = JSON.parse(raw) as Job;
        setJob((current) => current ?? saved);
      })
      .finally(() => setJobReady(true));
  }, []);

  useEffect(() => {
    if (!jobReady) return;
    if (job) void AsyncStorage.setItem(jobKey, JSON.stringify(job));
    else void AsyncStorage.removeItem(jobKey);
  }, [job, jobReady]);

  const sessionLife = useRef(0);
  useEffect(() => {
    const stamp = sessionLife.current;
    void loadSession();
    AsyncStorage.getItem(key)
      .then((raw) => {
        if (sessionLife.current !== stamp || !raw) return;
        const saved = JSON.parse(raw) as { captain: Captain; signedIn: boolean; dayBook?: DayBook };
        setCaptain(saved.captain);
        setSignedIn(saved.signedIn);
        if (saved.dayBook) setDayBook(settleDayBook(saved.dayBook));
      })
      .finally(() => {
        if (sessionLife.current === stamp) setReady(true);
      });
  }, []);

  useEffect(() => {
    if (ready && signedIn && captain)
      void loadSession().then((hasTokens) => {
        if (!hasTokens) return;
        void registerPush();
        void refresh();
      });
  }, [ready, signedIn, captain?.phone]);

  const bookRef = useRef(dayBook);
  bookRef.current = dayBook;
  const persist = (next: Captain | null, inside: boolean) => {
    const stamp = sessionLife.current;
    const signed = inside && sessionLife.current === stamp;
    const writing = next ? AsyncStorage.setItem(key, JSON.stringify({ captain: next, signedIn: signed, dayBook: bookRef.current })) : AsyncStorage.removeItem(key);
    void Promise.resolve(writing).then(() => {
      if (sessionLife.current === stamp) return;
      void AsyncStorage.getItem(key).then((raw) => {
        if (!raw) return;
        try {
          const saved = JSON.parse(raw) as { signedIn?: boolean };
          if (saved.signedIn) void AsyncStorage.setItem(key, JSON.stringify({ ...saved, signedIn: false }));
        } catch {
          /* The saved profile is unreadable, so it is left untouched. */
        }
      });
    });
  };
  const planVehicle = captain?.vehicle === "auto" || captain?.vehicle === "bike" ? captain.vehicle : null;
  useEffect(() => {
    if (captain) persist(captain, signedIn);
  }, [dayBook]);

  const daySynced = useRef(false);
  useEffect(() => {
    if (!ready || !signedIn || !live) return;
    let stop = false;
    void request<{ dayBook: DayBook | null }>("/captain/day-plan")
      .then((result) => {
        if (!stop && result?.dayBook) setDayBook(settleDayBook(result.dayBook));
      })
      .catch(() => undefined)
      .finally(() => {
        daySynced.current = true;
      });
    return () => {
      stop = true;
    };
  }, [ready, signedIn]);

  useEffect(() => {
    if (!live || !signedIn || !daySynced.current) return;
    const timer = setTimeout(() => {
      void request("/captain/day-plan", { method: "PATCH", body: { dayBook } }).catch(() => undefined);
    }, 600);
    return () => clearTimeout(timer);
  }, [dayBook, signedIn]);

  const log = (label: string, amount: number) => setTxns((list) => [{ id: `t-${Date.now()}-${list.length}`, label, amount, at: Date.now() }, ...list]);
  const wallet = live ? balance : txns.reduce((sum, txn) => sum + txn.amount, 0);

  const api = useMemo<Store>(
    () => ({
      ready,
      captain,
      signedIn,
      online,
      onlineSince,
      loginMinutes: loginMinutes + (onlineSince ? Math.floor((Date.now() - onlineSince) / 60000) : 0),
      autoAccept,
      offer,
      job,
      trips,
      txns,
      wallet,
      feedback,
      prefs,
      commissionPct,
      ridePlan,
      fareCard,
      dayBook,
      dutyLine: () => {
        if (!planVehicle) return "This vehicle does not use the day plan.";
        const fee = planVehicle === "bike" ? ridePlan.bikeDay : ridePlan.autoDay;
        return dutyGate(dayBook, planVehicle, fee).line;
      },
      canDuty: () => {
        if (!planVehicle) return false;
        const fee = planVehicle === "bike" ? ridePlan.bikeDay : ridePlan.autoDay;
        return dutyGate(dayBook, planVehicle, fee).ok;
      },
      payForToday: () => {
        if (!planVehicle) return;
        const fee = planVehicle === "bike" ? ridePlan.bikeDay : ridePlan.autoDay;
        setDayBook((book) => payDay(book, planVehicle, fee));
      },
      payForMonth: () => {
        if (!planVehicle) return;
        setDayBook((book) => payMonth(book, planVehicle));
      },
      signIn: (phone) => {
        if (captain?.phone !== phone) return "new";
        setSignedIn(true);
        persist(captain, true);
        return "existing";
      },
      register: (next) => {
        setCaptain(next);
        setSignedIn(true);
        persist(next, true);
      },
      approve: () => {
        if (!captain) return;
        const docs = Object.fromEntries(Object.entries(captain.docs).map(([doc, status]) => [doc, status === "missing" || status === "rejected" ? status : "verified"])) as Captain["docs"];
        const next: Captain = { ...captain, status: "active", docs };
        setCaptain(next);
        persist(next, true);
      },
      updateCaptain: (patch) => {
        if (!captain) return;
        const next = { ...captain, ...patch };
        setCaptain(next);
        persist(next, signedIn);
      },
      setDoc: (doc, status) => {
        if (!captain) return;
        const next = { ...captain, docs: { ...captain.docs, [doc]: status } };
        setCaptain(next);
        persist(next, signedIn);
      },
      setOnline: (on) => {
        setOnlineState(on);
        if (on) setOnlineSince(Date.now());
        else {
          if (onlineSince) setLoginMinutes((value) => value + Math.floor((Date.now() - onlineSince) / 60000));
          setOnlineSince(null);
          setOffer(null);
        }
      },
      setAutoAccept,
      adoptJob: (next) => {
        setOffer(null);
        setJob(next);
      },
      pushOffer: (order) => {
        if (job) return;
        if (offersBlocked(settleDayBook(dayBook))) return;
        if (order.vehicle !== "cab" && pickupTooFar(order.pickupKm, order.tripKm)) return;
        if (autoAccept && !live) {
          setJob({ ...order, status: "toPickup" });
          return;
        }
        setOffer(order);
      },
      accept: () => {
        if (!offer) return;
        setJob({ ...offer, status: "toPickup" });
        setOffer(null);
      },
      reject: (reason) => {
        if (!offer) return;
        setTrips((list) => [
          { id: offer.id, at: Date.now(), vehicle: offer.vehicle, pickup: offer.pickup.name, drop: offer.drop.name, km: 0, minutes: 0, fare: 0, bonus: 0, tip: 0, payment: offer.payment, status: "Missed", customer: offer.customer.name, reason },
          ...list,
        ]);
        setOffer(null);
      },
      patchJob: (patch) => setJob((current) => (current ? { ...current, ...patch } : current)),
      cancelJob: (reason) => {
        if (!job) return;
        setTrips((list) => [
          { id: job.id, at: Date.now(), vehicle: job.vehicle, pickup: job.pickup.name, drop: job.drop.name, km: 0, minutes: 0, fare: 0, bonus: 0, tip: 0, payment: job.payment, status: "Cancelled", customer: job.customer.name, reason },
          ...list,
        ]);
        setJob(null);
        setDayBook((book) => noteCaptainCancel(book));
        refreshSoon();
      },
      finishJob: (ratingGiven) => {
        if (!job) return null;
        // Live ratings come from passengers on the server; the preview shows a sample.
        const ratingReceived = undefined;
        const trip: Trip = {
          id: job.id,
          at: Date.now(),
          vehicle: job.vehicle,
          pickup: job.pickup.name,
          drop: job.drop.name,
          km: Math.round(job.tripKm * 10) / 10,
          minutes: job.startedAt ? Math.max(1, Math.round((Date.now() - job.startedAt) / 60000)) : job.tripMin,
          fare: job.fare,
          bonus: job.bonus,
          tip: 0,
          commission: rideBill(job.vehicle === "auto" ? "auto" : "bike", job.fare, ridePlan).commission,
          payment: job.payment,
          status: "Completed",
          customer: job.customer.name,
          ratingGiven: ratingGiven || undefined,
          ratingReceived,
        };
        setTrips((list) => [trip, ...list]);
        if (job.vehicle === "bike" || job.vehicle === "auto") setDayBook((book) => useDayOnCompletedTrip(book, job.vehicle));
        setJob(null);
        if (live) {
          refreshSoon();
          return trip;
        }
        if (job.bonus) log(`Ride bonus · ${job.id}`, job.bonus);
        if (ratingGiven) setFeedback((list) => [{ id: `f-${job.id}`, customer: job.customer.name, stars: ratingGiven, note: "", tags: [], at: Date.now() }, ...list]);
        return trip;
      },
      redeem: (amount) => {
        if (amount > wallet || !captain) return false;
        if (live) {
          void refresh();
          return true;
        }
        log(`Redeemed to bank ••${captain.bankLast4}`, -amount);
        return true;
      },
      setPref: (name, value) => setPrefs((all) => ({ ...all, [name]: value })),
      signOut: () => {
        sessionLife.current += 1;
        if (live && onlineSince) void request("/captain/duty", { body: { online: false } }).catch(() => undefined);
        void stopDutyTracking();
        void signOutRemote();
        void forgetPush();
        setOnlineState(false);
        setOnlineSince(null);
        setOffer(null);
        setJob(null);
        setSignedIn(false);
        persist(captain, false);
      },
      refresh,
    }),
    [ready, captain, signedIn, online, onlineSince, loginMinutes, autoAccept, offer, job, trips, txns, wallet, feedback, prefs, commissionPct, ridePlan, fareCard, dayBook],
  );

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export function useStore() {
  const value = useContext(Ctx);
  if (!value) throw new Error("Store missing");
  return value;
}

export { earned };
