import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { api as request, live, loadSession, signOutRemote } from "./backend";
import { seedFeedback, seedTrips, seedTxns } from "./data";
import { forgetPush, registerPush } from "./push";
import { stopDutyTracking } from "./tracking";
import { earned } from "./orders";
import type { Captain, DocKey, DocStatus, Feedback, Job, Order, Trip, Txn } from "./types";

const key = "roveya-captain";

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
};

const Ctx = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [captain, setCaptain] = useState<Captain | null>(null);
  const [signedIn, setSignedIn] = useState(false);
  const [online, setOnlineState] = useState(false);
  const [onlineSince, setOnlineSince] = useState<number | null>(null);
  const [loginMinutes, setLoginMinutes] = useState(214);
  const [autoAccept, setAutoAccept] = useState(false);
  const [offer, setOffer] = useState<Order | null>(null);
  const [job, setJob] = useState<Job | null>(null);
  const [trips, setTrips] = useState<Trip[]>(seedTrips);
  const [txns, setTxns] = useState<Txn[]>(seedTxns);
  const [feedback, setFeedback] = useState<Feedback[]>(seedFeedback);
  const [prefs, setPrefs] = useState<Prefs>({ sound: true, vibrate: true, awake: true, nav: "google", language: "English" });

  useEffect(() => {
    void loadSession();
    AsyncStorage.getItem(key)
      .then((raw) => {
        if (!raw) return;
        const saved = JSON.parse(raw) as { captain: Captain; signedIn: boolean };
        setCaptain(saved.captain);
        setSignedIn(saved.signedIn);
      })
      .finally(() => setReady(true));
  }, []);

  useEffect(() => {
    if (ready && signedIn && captain) void loadSession().then((hasTokens) => (hasTokens ? registerPush() : undefined));
  }, [ready, signedIn, captain?.phone]);

  const persist = (next: Captain | null, inside: boolean) => {
    if (next) void AsyncStorage.setItem(key, JSON.stringify({ captain: next, signedIn: inside }));
    else void AsyncStorage.removeItem(key);
  };

  const log = (label: string, amount: number) => setTxns((list) => [{ id: `t-${Date.now()}-${list.length}`, label, amount, at: Date.now() }, ...list]);
  const wallet = txns.reduce((sum, txn) => sum + txn.amount, 0);

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
      },
      finishJob: (ratingGiven) => {
        if (!job) return null;
        const ratingReceived = Math.random() < 0.85 ? 5 : 4;
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
          payment: job.payment,
          status: "Completed",
          customer: job.customer.name,
          ratingGiven,
          ratingReceived,
        };
        setTrips((list) => [trip, ...list]);
        if (job.payment === "online") log(`Ride ${job.id} · online`, job.fare);
        if (job.bonus) log(`Ride bonus · ${job.id}`, job.bonus);
        setFeedback((list) => [{ id: `f-${job.id}`, customer: job.customer.name, stars: ratingReceived, note: "", tags: ratingReceived === 5 ? ["On time"] : [], at: Date.now() }, ...list]);
        setJob(null);
        return trip;
      },
      redeem: (amount) => {
        if (amount > wallet || !captain) return false;
        log(`Redeemed to bank ••${captain.bankLast4}`, -amount);
        return true;
      },
      setPref: (name, value) => setPrefs((all) => ({ ...all, [name]: value })),
      signOut: () => {
        if (live && onlineSince) void request("/captain/duty", { body: { online: false } }).catch(() => undefined);
        void stopDutyTracking();
        void forgetPush().finally(() => signOutRemote());
        setOnlineState(false);
        setOnlineSince(null);
        setOffer(null);
        setJob(null);
        setSignedIn(false);
        persist(captain, false);
      },
    }),
    [ready, captain, signedIn, online, onlineSince, loginMinutes, autoAccept, offer, job, trips, txns, wallet, feedback, prefs],
  );

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export function useStore() {
  const value = useContext(Ctx);
  if (!value) throw new Error("Store missing");
  return value;
}

export { earned };
