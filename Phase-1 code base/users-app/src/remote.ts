import { useCallback, useEffect, useState } from "react";
import { Platform } from "react-native";
import * as WebBrowser from "expo-web-browser";
import { ApiError, api, live, loadSession, sendCode, signOutRemote, verifyCode, watch } from "./backend";
import { departureDate, searchTrips, tripById } from "./data";
import type { Booking, Trip } from "./types";

export { live, ApiError };

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export type BookingQuote = { fare: number; gst: number; secure: number; discount: number; cashUsed: number; total: number };
type ServerBooking = Booking & { id: string; status: Booking["status"] | "Pending"; payable: number; fare: number; gst: number; secure: number; cashUsed: number; holdUntil: string | null };

// ---------------------------------------------------------------------------
// Sign-in
// ---------------------------------------------------------------------------

export async function restoreRider(): Promise<{ name: string; phone: string } | null> {
  if (!live || !(await loadSession())) return null;
  try {
    const { rider } = await api<{ rider: { name: string; phone: string } }>("/rider/me");
    return { name: rider.name === "ROVEYA rider" ? "" : rider.name, phone: rider.phone };
  } catch (error) {
    if (error instanceof ApiError && (error.status === 401 || error.status === 403)) return null;
    throw error;
  }
}

export async function requestCode(phone: string) {
  if (!live) return wait(900);
  await sendCode(phone);
}

export async function confirmCode(phone: string, code: string) {
  if (!live) {
    await wait(800);
    if (code !== "1234") throw new Error("That code does not match. Try 1234 in this preview.");
    return { phone, name: "" };
  }
  await verifyCode(phone, code);
  return (await restoreRider()) ?? { phone, name: "" };
}

export async function saveName(name: string) {
  if (live) await api("/rider/me", { method: "PATCH", body: { name } });
}

export async function logout() {
  if (live) await signOutRemote();
}

// ---------------------------------------------------------------------------
// Trips
// ---------------------------------------------------------------------------

async function loadTrips(fromId: string, toId: string, date: string): Promise<Trip[]> {
  if (!live) {
    await wait(900);
    const soonest = Date.now() + 30 * 60 * 1000;
    return searchTrips(fromId, toId, date).filter((trip) => departureDate(trip).getTime() > soonest);
  }
  const { trips } = await api<{ trips: Trip[] }>(`/seats/search?from=${fromId}&to=${toId}&date=${date}`, { auth: false });
  return trips;
}

export function useTrips(fromId: string, toId: string, date: string) {
  const [state, setState] = useState<{ trips: Trip[]; loading: boolean; error: string }>({ trips: [], loading: true, error: "" });
  const load = useCallback(() => {
    let alive = true;
    setState((current) => ({ ...current, loading: true, error: "" }));
    loadTrips(fromId, toId, date)
      .then((trips) => alive && setState({ trips, loading: false, error: "" }))
      .catch((error: Error) => alive && setState({ trips: [], loading: false, error: error.message }));
    return () => {
      alive = false;
    };
  }, [fromId, toId, date]);
  useEffect(load, [load]);
  return { ...state, reload: load };
}

// Seats change while the traveller looks at them, so the trip refetches on every seat change.
export function useTrip(id: string) {
  const [state, setState] = useState<{ trip: Trip | null; loading: boolean; error: string }>({ trip: null, loading: true, error: "" });
  useEffect(() => {
    let alive = true;
    const load = (quiet: boolean) => {
      if (!quiet) setState({ trip: null, loading: true, error: "" });
      if (!live) {
        const timer = setTimeout(() => alive && setState({ trip: tripById(id), loading: false, error: "" }), quiet ? 0 : 650);
        return () => clearTimeout(timer);
      }
      api<{ trip: Trip }>(`/seats/trips/${id}`, { auth: false })
        .then(({ trip }) => alive && setState({ trip, loading: false, error: "" }))
        .catch((error: Error) => alive && setState((current) => ({ trip: current.trip, loading: false, error: error.message })));
      return undefined;
    };
    const cancel = load(false);
    const stop = live ? watch("seat_trip_seats", `trip_id=eq.${id}`, () => load(true)) : () => undefined;
    const poll = live ? setInterval(() => load(true), 20000) : null;
    return () => {
      alive = false;
      cancel?.();
      stop();
      if (poll) clearInterval(poll);
    };
  }, [id]);
  return state;
}

// ---------------------------------------------------------------------------
// Bookings and payment
// ---------------------------------------------------------------------------

export type HoldInput = {
  tripId: string;
  travellers: { seatId: string; name: string; age: number; gender: "Male" | "Female" }[];
  boardingId: string;
  dropId: string;
  phone: string;
  email: string;
  secured: boolean;
  coupon: string;
  useCash: boolean;
};

export async function holdSeats(input: HoldInput): Promise<{ bookingId: string; holdUntil: string; quote: BookingQuote }> {
  const { booking } = await api<{ booking: ServerBooking }>("/seats/bookings", { body: input });
  return {
    bookingId: booking.id,
    holdUntil: booking.holdUntil ?? new Date(Date.now() + 10 * 60000).toISOString(),
    quote: { fare: booking.fare, gst: booking.gst, secure: booking.secure, discount: booking.discount, cashUsed: booking.cashUsed, total: booking.payable },
  };
}

async function bookingById(id: string) {
  return (await api<{ booking: ServerBooking }>(`/seats/bookings/${id}`)).booking;
}

async function waitForPayment(intentId: string, until: number) {
  while (Date.now() < until) {
    const intent = await api<{ status: "created" | "paid" | "failed" }>(`/payments/${intentId}`).catch(() => null);
    if (intent?.status === "paid") return true;
    if (intent?.status === "failed") return false;
    await wait(2500);
  }
  return false;
}

// Wallet payments confirm at once. Online payments open the ROVEYA checkout page (Razorpay)
// and the seats confirm when the server hears from Razorpay.
export async function payBooking(bookingId: string, method: "online" | "wallet"): Promise<Booking> {
  const result = await api<{ status: "confirmed" | "payment_required"; booking?: ServerBooking; payment?: { intentId: string; checkoutUrl: string } }>(`/seats/bookings/${bookingId}/pay`, { body: { method } });
  if (result.status === "confirmed" && result.booking) return result.booking;
  const payment = result.payment!;
  const deadline = Date.now() + 8 * 60 * 1000;
  const watching = waitForPayment(payment.intentId, deadline);
  if (Platform.OS === "web") window.open(payment.checkoutUrl, "_blank");
  else await WebBrowser.openBrowserAsync(payment.checkoutUrl, { presentationStyle: WebBrowser.WebBrowserPresentationStyle.FULL_SCREEN }).catch(() => undefined);
  const paid = await watching;
  const booking = await bookingById(bookingId);
  if (booking.status === "Upcoming") return booking;
  throw new Error(paid ? "Payment received, but the seats went to someone else. The full amount is in your ROVEYA Cash." : "The payment did not go through. Your seats stay held for a few minutes, so you can try again.");
}

export async function myBookings(): Promise<Booking[]> {
  return (await api<{ bookings: ServerBooking[] }>("/seats/bookings")).bookings;
}

export async function cancelRemote(bookingId: string) {
  return api<{ refund: number; booking: ServerBooking }>(`/seats/bookings/${bookingId}/cancel`, { method: "POST" });
}

// The team reads every rating; good ones can appear on the ROVEYA website.
export async function reviewRemote(bookingId: string, rating: number, quote: string) {
  if (!live) return wait(700);
  await api(`/seats/bookings/${bookingId}/review`, { body: { rating, quote, consent: true } });
}

export async function lookupRemote(pnr: string, phone: string) {
  return (await api<{ booking: ServerBooking }>("/seats/bookings/lookup", { body: { pnr, phone } })).booking;
}

export async function walletRemote() {
  return api<{ balance: number; entries: { id: number; kind: string; amount: number; note: string | null; at: string }[] }>("/wallet");
}
