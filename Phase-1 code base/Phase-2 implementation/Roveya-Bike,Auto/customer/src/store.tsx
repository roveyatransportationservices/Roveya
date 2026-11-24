import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { AppState } from "react-native";
import { api as request, live, loadSession, signOutRemote } from "./backend";
import { forgetPush, registerPush } from "./push";
import { coupons, fallbackHere } from "./data";
import { passengerCancelFee } from "./dayPlan";
import { DEFAULT_FARE_CARD, refreshFareCard, type FareCard } from "./fareCard";
import { DEFAULT_RIDE_PLAN, refreshRidePlan, type RidePlan } from "./ridePlan";
import { COINS_PER_CORRECT, REDEEM_COINS, REDEEM_VALUE, todayKey } from "./lounge";
import type { ActiveTrip, Claim, ParcelBooking, PastRide, PayMethod, Place, PoolBooking, ScratchCard, TrustedContact, VehicleKind, WalletEntry } from "./types";

function remember(list: Place[], place: Place) {
  return [place, ...list.filter((item) => item.id !== place.id && item.name !== place.name)].slice(0, 6);
}


type ServerWallet = { balance: number; entries: { id: number; kind: string; amount: number; note: string | null; at: string }[] };
type ServerPoint = { name: string; latitude: number; longitude: number };
type ServerActive = {
  id: string;
  code: string;
  vehicle: VehicleKind;
  status: string;
  pickup: ServerPoint;
  drop: ServerPoint;
  distanceKm: number;
  etaMin: number;
  fare: number;
  payment: string;
  otp: string | null;
  captain: { name: string; rating: number; trips: number; vehicleNo: string; vehicleName: string } | null;
};
const activeStatus: Record<string, ActiveTrip["status"]> = { searching: "searching", assigned: "assigned", arrived: "arrived", on_trip: "onTrip" };
type ServerTrip = { code: string; vehicle: VehicleKind; status: string; pickup: { name: string }; drop: { name: string }; distanceKm: number; fare: number; payment: string; requestedAt: string; completedAt: string | null };

const ledgerLabel: Record<string, string> = { topup: "Added money", ride_payment: "Ride payment", refund: "Refund", adjustment: "Adjustment by ROVEYA", promo: "Offer credit" };
const rideWhen = (iso: string) => new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

// The server's wallet and ride history, shaped for the screens.
function fromServer(wallet: ServerWallet | null, trips: ServerTrip[] | null) {
  return {
    balance: wallet?.balance ?? null,
    log: wallet ? wallet.entries.map((entry): WalletEntry => ({ id: `w-${entry.id}`, label: entry.note || ledgerLabel[entry.kind] || "Wallet", amount: entry.amount, at: Date.parse(entry.at) })) : null,
    rides: trips
      ? trips
          .filter((trip) => ["completed", "cancelled", "expired"].includes(trip.status))
          .map(
            (trip): PastRide => ({
              id: trip.code,
              when: rideWhen(trip.completedAt ?? trip.requestedAt),
              pickup: trip.pickup.name,
              drop: trip.drop.name,
              vehicle: trip.vehicle,
              fare: trip.status === "completed" ? trip.fare : 0,
              status: trip.status === "completed" ? "Completed" : "Cancelled",
              distanceKm: trip.distanceKm,
              payment: trip.payment === "upi" || trip.payment === "online" ? trip.payment : "cash",
            }),
          )
      : null,
  };
}

export type Prefs = { codes: boolean; pool: boolean; parcel: boolean; offers: boolean; trivia: boolean };
const seedPrefs: Prefs = { codes: true, pool: true, parcel: true, offers: true, trivia: false };

type Session = { phone: string; name: string; email?: string };

type Account = {
  rides: PastRide[];
  wallet: number;
  walletLog: WalletEntry[];
  coins: number;
  cards: ScratchCard[];
  poolBookings: PoolBooking[];
  parcels: ParcelBooking[];
  home: Place | null;
  work: Place | null;
  contacts: TrustedContact[];
  claims: Claim[];
  prefs: Prefs;
  recentDrops: Place[];
  recentPickups: Place[];
  triviaDay: string | null;
  bests: Record<string, number>;
};

function freshAccount(): Account {
  return {
    rides: [],
    wallet: 0,
    walletLog: [],
    coins: 0,
    cards: [],
    poolBookings: [],
    parcels: [],
    home: null,
    work: null,
    contacts: [],
    claims: [],
    prefs: seedPrefs,
    recentDrops: [],
    recentPickups: [fallbackHere],
    triviaDay: null,
    bests: {},
  };
}

type Store = {
  ready: boolean;
  session: Session | null;
  known: Session | null;
  pickup: Place | null;
  wallet: number;
  rides: PastRide[];
  trip: ActiveTrip | null;
  home: Place | null;
  work: Place | null;
  poolBookings: PoolBooking[];
  bookPool: (booking: PoolBooking) => void;
  parcels: ParcelBooking[];
  bookParcel: (booking: ParcelBooking) => void;
  coins: number;
  cards: ScratchCard[];
  triviaPlayedToday: boolean;
  bests: Record<string, number>;
  finishTrivia: (correct: number) => number;
  revealCard: (id: string) => void;
  redeemCoins: () => boolean;
  saveBest: (game: string, score: number, lowerIsBetter?: boolean) => boolean;
  signIn: (session: Session) => void;
  signOut: () => void;
  setPickup: (place: Place) => void;
  recentPickups: Place[];
  recentDrops: Place[];
  rememberDrop: (place: Place) => void;
  setHome: (place: Place | null) => void;
  setWork: (place: Place | null) => void;
  ridePlan: RidePlan;
  fareCard: FareCard;
  applyCoupon: (code: string, fare: number) => { fare: number; note: string };
  startTrip: (trip: ActiveTrip) => void;
  patchTrip: (patch: Partial<ActiveTrip>) => void;
  finishTrip: (rating: number) => void;
  cancelTrip: (reason?: string) => string;
  payFromWallet: (amount: number, label?: string) => boolean;
  addWallet: (amount: number) => void;
  walletLog: WalletEntry[];
  updateProfile: (patch: { name?: string; email?: string }) => void;
  prefs: Prefs;
  setPref: (key: keyof Prefs, on: boolean) => void;
  contacts: TrustedContact[];
  addContact: (contact: TrustedContact) => void;
  removeContact: (phone: string) => void;
  claims: Claim[];
  raiseClaim: (claim: Omit<Claim, "id" | "at" | "status">) => Claim;
  refreshAccount: () => Promise<void>;
};

const key = "roveya-customer-session";
const openRideKey = "roveya-open-ride";
const knownKey = "roveya-customer-known";
const Ctx = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [known, setKnown] = useState<Session | null>(null);
  const [pickup, setPickupState] = useState<Place | null>(null);
  const [recentPickups, setRecentPickups] = useState<Place[]>([fallbackHere]);
  const [recentDrops, setRecentDrops] = useState<Place[]>([]);
  const [wallet, setWallet] = useState(0);
  const [rides, setRides] = useState<PastRide[]>([]);
  const [trip, setTrip] = useState<ActiveTrip | null>(null);
  const [home, setHomeState] = useState<Place | null>(null);
  const [work, setWorkState] = useState<Place | null>(null);
  const [poolBookings, setPoolBookings] = useState<PoolBooking[]>([]);
  const [parcels, setParcels] = useState<ParcelBooking[]>([]);
  const [coins, setCoins] = useState(0);
  const [cards, setCards] = useState<ScratchCard[]>([]);
  const [triviaDay, setTriviaDay] = useState<string | null>(null);
  const [bests, setBests] = useState<Record<string, number>>({});
  const [walletLog, setWalletLog] = useState<WalletEntry[]>([]);
  const [prefs, setPrefs] = useState<Prefs>(seedPrefs);
  const [contacts, setContacts] = useState<TrustedContact[]>([]);
  const [claims, setClaims] = useState<Claim[]>([]);
  const [ridePlan, setRidePlan] = useState<RidePlan>(DEFAULT_RIDE_PLAN);
  const [fareCard, setFareCard] = useState<FareCard>(DEFAULT_FARE_CARD);

  useEffect(() => {
    void refreshRidePlan().then(setRidePlan);
    void refreshFareCard().then(setFareCard);
  }, []);

  const owner = useRef<string | null>(null);
  const sessionLife = useRef(0);
  const vault = useRef<Record<string, Account>>({});

  const snapshot = (): Account => ({ rides, wallet, walletLog, coins, cards, poolBookings, parcels, home, work, contacts, claims, prefs, recentDrops, recentPickups, triviaDay, bests });
  const load = (account: Account) => {
    setRides(account.rides);
    setWallet(account.wallet);
    setWalletLog(account.walletLog);
    setCoins(account.coins);
    setCards(account.cards);
    setPoolBookings(account.poolBookings);
    setParcels(account.parcels);
    setHomeState(account.home);
    setWorkState(account.work);
    setContacts(account.contacts);
    setClaims(account.claims);
    setPrefs(account.prefs);
    setRecentDrops(account.recentDrops);
    setRecentPickups(account.recentPickups);
    setTriviaDay(account.triviaDay);
    setBests(account.bests);
  };
  const switchTo = (phone: string) => {
    const current = owner.current;
    if (current === phone) return;
    if (current) {
      vault.current[current] = snapshot();
      load(vault.current[phone] ?? freshAccount());
    } else if (known && known.phone !== phone) {
      load(freshAccount());
    }
    owner.current = phone;
  };

  const logWallet = (label: string, amount: number) => setWalletLog((list) => [{ id: `w-${Date.now()}-${list.length}`, label, amount, at: Date.now() }, ...list]);

  const earnCard = (_from: string) => undefined;

  const refreshAccount = async () => {
    if (!live) return;
    const [walletData, rideData] = await Promise.all([request<ServerWallet>("/wallet").catch(() => null), request<{ trips: ServerTrip[] }>("/rides").catch(() => null)]);
    const next = fromServer(walletData, rideData?.trips ?? null);
    if (next.balance !== null) setWallet(next.balance);
    if (next.log) setWalletLog(next.log);
    if (next.rides) setRides(next.rides);
  };

  // A ride still open on the server comes back after the app restarts.
  const restoreTrip = async () => {
    if (!live) return;
    const ride = await request<ServerActive | { trip: null }>("/rides/current").catch(() => null);
    if (!ride || !("id" in ride)) return;
    const status = activeStatus[ride.status];
    if (!status) return;
    const place = (point: ServerPoint, id: string): Place => ({ id, name: point.name, subtitle: "", latitude: point.latitude, longitude: point.longitude });
    setTrip(
      (current) =>
        current ?? {
          id: ride.code,
          pickup: place(ride.pickup, "pickup"),
          drop: place(ride.drop, "drop"),
          vehicle: ride.vehicle,
          fare: ride.fare,
          distanceKm: ride.distanceKm,
          etaMin: ride.etaMin,
          payment: ride.payment === "upi" || ride.payment === "online" ? ride.payment : "cash",
          otp: ride.otp ?? "",
          captain: ride.captain ?? { name: "Your captain", rating: 5, trips: 0, vehicleNo: "", vehicleName: "" },
          status,
          progress: 0,
          serverId: ride.id,
        },
    );
  };

  const [rideReady, setRideReady] = useState(false);
  useEffect(() => {
    void AsyncStorage.getItem(openRideKey)
      .then((raw) => {
        if (!raw) return;
        const saved = JSON.parse(raw) as ActiveTrip;
        if (saved.status === "done" || saved.status === "rating") return;
        setTrip((current) => current ?? saved);
      })
      .finally(() => setRideReady(true));
  }, []);

  useEffect(() => {
    if (!rideReady) return;
    if (trip && trip.status !== "done" && trip.status !== "rating") void AsyncStorage.setItem(openRideKey, JSON.stringify(trip));
    else void AsyncStorage.removeItem(openRideKey);
  }, [trip, rideReady]);

  useEffect(() => {
    const stamp = sessionLife.current;
    void loadSession();
    AsyncStorage.multiGet([key, knownKey])
      .then(([[, raw], [, rawKnown]]) => {
        if (sessionLife.current !== stamp) return;
        if (raw) owner.current = (JSON.parse(raw) as Session).phone;
        if (raw) setSession(JSON.parse(raw) as Session);
        if (rawKnown) setKnown(JSON.parse(rawKnown) as Session);
        else if (raw) setKnown(JSON.parse(raw) as Session);
      })
      .finally(() => {
        if (sessionLife.current === stamp) setReady(true);
      });
  }, []);

  useEffect(() => {
    if (ready && session)
      void loadSession().then((signedIn) => {
        if (!signedIn) return;
        void registerPush();
        void refreshAccount();
        void restoreTrip();
      });
  }, [ready, session?.phone]);

  // A ride the ROVEYA desk books for the passenger shows up without restarting the app.
  const hasTrip = Boolean(trip);
  useEffect(() => {
    if (!live || !ready || !session || hasTrip) return;
    const timer = setInterval(() => void restoreTrip(), 20000);
    const watcher = AppState.addEventListener("change", (state) => {
      if (state === "active") void restoreTrip();
    });
    return () => {
      clearInterval(timer);
      watcher.remove();
    };
  }, [ready, session?.phone, hasTrip]);

  const api = useMemo<Store>(
    () => ({
      ready,
      session,
      known,
      pickup,
      wallet,
      rides,
      trip,
      home,
      work,
      poolBookings,
      bookPool: (booking) => {
        setPoolBookings((list) => [booking, ...list]);
        earnCard(`Taxipool ${booking.id}`);
      },
      parcels,
      bookParcel: (booking) => {
        setParcels((list) => [booking, ...list]);
        earnCard(`Parcel ${booking.id}`);
      },
      coins,
      cards,
      triviaPlayedToday: triviaDay === todayKey(),
      bests,
      finishTrivia: (correct) => {
        if (triviaDay === todayKey()) return 0;
        const earned = correct * COINS_PER_CORRECT;
        setTriviaDay(todayKey());
        setCoins((value) => value + earned);
        return earned;
      },
      revealCard: (id) => {
        const card = cards.find((item) => item.id === id);
        if (!card || card.scratched) return;
        setCards((list) => list.map((item) => (item.id === id ? { ...item, scratched: true } : item)));
        if (card.reward.kind === "cash") {
          setWallet((value) => value + card.reward.amount);
          logWallet("Scratch card reward", card.reward.amount);
        } else setCoins((value) => value + card.reward.amount);
      },
      redeemCoins: () => {
        if (live || coins < REDEEM_COINS) return false;
        setCoins((value) => value - REDEEM_COINS);
        setWallet((value) => value + REDEEM_VALUE);
        logWallet(`${REDEEM_COINS} coins redeemed`, REDEEM_VALUE);
        return true;
      },
      saveBest: (game, score, lowerIsBetter = false) => {
        const current = bests[game];
        const better = current === undefined || (lowerIsBetter ? score < current : score > current);
        if (better) setBests((all) => ({ ...all, [game]: score }));
        return better;
      },
      signIn: (next) => {
        const stamp = sessionLife.current;
        switchTo(next.phone);
        setSession(next);
        setKnown(next);
        void AsyncStorage.multiSet([[key, JSON.stringify(next)], [knownKey, JSON.stringify(next)]]).then(() => {
          if (sessionLife.current !== stamp) void AsyncStorage.removeItem(key);
        });
      },
      signOut: () => {
        sessionLife.current += 1;
        void signOutRemote();
        void forgetPush();
        setSession(null);
        setTrip(null);
        void AsyncStorage.removeItem(key);
      },
      setPickup: (place) => {
        setPickupState(place);
        if (place.id !== "gps") setRecentPickups((list) => remember(list, place));
      },
      recentPickups,
      recentDrops,
      rememberDrop: (place) => setRecentDrops((list) => remember(list, place)),
      setHome: setHomeState,
      setWork: setWorkState,
      walletLog,
      updateProfile: (patch) => {
        if (!session) return;
        const stamp = sessionLife.current;
        const next = { ...session, ...patch };
        setSession(next);
        setKnown(next);
        void AsyncStorage.multiSet([[key, JSON.stringify(next)], [knownKey, JSON.stringify(next)]]).then(() => {
          if (sessionLife.current !== stamp) void AsyncStorage.removeItem(key);
        });
      },
      prefs,
      setPref: (name, on) => setPrefs((all) => ({ ...all, [name]: on })),
      contacts,
      addContact: (contact) => setContacts((list) => [...list.filter((item) => item.phone !== contact.phone), contact].slice(0, 3)),
      removeContact: (phone) => setContacts((list) => list.filter((item) => item.phone !== phone)),
      claims,
      raiseClaim: (draft) => {
        const claim: Claim = { ...draft, id: `CL-${String(Date.now()).slice(-5)}`, at: Date.now(), status: "Under review" };
        setClaims((list) => [claim, ...list]);
        return claim;
      },
      refreshAccount,
      ridePlan,
      fareCard,
      applyCoupon: (code, fare) => {
        const off = coupons[code.trim().toUpperCase()] ?? 0;
        if (!off) return { fare, note: "That code is not active." };
        if (fare < 100) return { fare, note: "Add a longer ride to use this code." };
        return { fare: Math.max(35, fare - off), note: `₹${off} taken off.` };
      },
      startTrip: setTrip,
      patchTrip: (patch) => setTrip((current) => (current ? { ...current, ...patch } : current)),
      finishTrip: (rating) => {
        if (!trip) return;
        setRides((list) => [
          {
            id: trip.id,
            when: "Just now",
            pickup: trip.pickup.name,
            drop: trip.drop.name,
            vehicle: trip.vehicle,
            fare: trip.fare,
            passengerFee: trip.passengerFee,
            status: "Completed",
            distanceKm: trip.distanceKm,
            payment: trip.payment,
            rating,
          },
          ...list,
        ]);
        earnCard(`Ride ${trip.id}`);
        setTrip(null);
        if (trip.serverId) setTimeout(() => void refreshAccount(), 1500);
      },
      cancelTrip: (reason?: string) => {
        if (!trip) return "";
        const fee = passengerCancelFee(trip.vehicle, trip.status);
        if (fee === null) return "This ride has started. It finishes at the drop.";
        setRides((list) => [
          {
            id: trip.id,
            when: "Just now",
            pickup: trip.pickup.name,
            drop: trip.drop.name,
            vehicle: trip.vehicle,
            fare: fee,
            status: "Cancelled",
            reason,
            distanceKm: trip.distanceKm,
          },
          ...list,
        ]);
        if (trip.serverId) setTimeout(() => void refreshAccount(), 1500);
        setTrip(null);
        return fee ? `Cancel fee ₹${fee} is owed to the captain.` : "";
      },
      payFromWallet: (amount, label = "Paid from wallet") => {
        if (wallet < amount) return false;
        setWallet((value) => value - amount);
        logWallet(label, -amount);
        return true;
      },
      addWallet: (amount) => {
        setWallet((value) => value + amount);
        logWallet("Added money", amount);
      },
    }),
    [ready, session, known, pickup, recentPickups, recentDrops, wallet, rides, trip, home, work, poolBookings, parcels, coins, cards, triviaDay, bests, walletLog, prefs, contacts, claims, ridePlan, fareCard],
  );

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export function useStore() {
  const value = useContext(Ctx);
  if (!value) throw new Error("Store missing");
  return value;
}

export type { PayMethod, VehicleKind };
