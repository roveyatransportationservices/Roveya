import { createHmac, timingSafeEqual } from "node:crypto";
import { loadtestBlocks } from "../loadtestGuard";
import { ApiError } from "./api";
import { db } from "./db";
import { confirmationMessage, confirmationOutcome, orderFailureKind } from "./paymentState";
import { assertRazorpayCredentialsForRuntime } from "./razorpayEnv";
import { gatewayRefundDecision, refundEventDecision } from "./refundDecision";

type OrderPlacer = (amountPaise: number, receipt: string) => Promise<{ keyId: string; orderId: string }>;

function readJson(data: unknown) {
  if (typeof data === "string") {
    try {
      return JSON.parse(data) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  return data && typeof data === "object" ? data as Record<string, unknown> : {};
}

function keys() {
  const { id, secret } = assertRazorpayCredentialsForRuntime();
  return { id, secret };
}

export async function createOrder(amountPaise: number, receipt: string) {
  if (loadtestBlocks("https://api.razorpay.com/v1/orders")) throw new ApiError("Online payment is not switched on yet.", 503);
  const { id, secret } = keys();
  const auth = Buffer.from(`${id}:${secret}`).toString("base64");
  let response: Response;
  try {
    response = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json" },
      body: JSON.stringify({ amount: amountPaise, currency: "INR", receipt: receipt.slice(0, 40) }),
    });
  } catch {
    throw new ApiError("The payment service did not answer. Do not start another payment until this one is checked.", 503);
  }
  const body = (await response.json().catch(() => null)) as { id?: string } | null;
  if (!response.ok) {
    const kind = orderFailureKind(response.status);
    throw new ApiError(
      kind === "uncertain"
        ? "The payment service did not answer. Do not start another payment until this one is checked."
        : "Online payment could not be started. Try again.",
      kind === "uncertain" ? 503 : 422,
    );
  }
  if (!body?.id) throw new ApiError("The payment result is not known yet. Do not start another payment until this one is checked.", 503);
  return { keyId: id, orderId: body.id };
}

let orderPlacer: OrderPlacer = (amountPaise, receipt) => createOrder(amountPaise, receipt);

export function setOrderPlacerForTests(placer: OrderPlacer | null) {
  orderPlacer = placer ?? ((amountPaise, receipt) => createOrder(amountPaise, receipt));
}

// Reserves one attempt in the database, then asks Razorpay only if this caller won that attempt.
// The amount sent to Razorpay is the amount the database returned, never a figure from the phone.
export async function beginGatewayAttempt(input: {
  ownerId: string;
  purpose: "seat_booking" | "ride_fare" | "wallet_topup";
  refId: string;
  receipt: string;
  amountPaise?: number;
}) {
  const reserved = await db().rpc("reserve_payment_attempt", {
    p_owner: input.ownerId,
    p_purpose: input.purpose,
    p_ref: input.refId,
    p_amount: input.purpose === "wallet_topup" ? Math.trunc(Number(input.amountPaise ?? 0)) : 0,
  });
  if (reserved.error) throw new ApiError("Online payment could not be started. Try again.", 503);
  const row = readJson(reserved.data);
  const status = String(row.status ?? "");
  const action = String(row.action ?? "");
  if (status === "direct") throw new ApiError("This ride is paid to the captain in cash or by UPI.", 400);
  if (status === "not_owner" || status === "not_found") throw new ApiError("That booking was not found.", 404);
  if (status === "closed") throw new ApiError("This ticket can no longer be paid.", 409);
  if (status === "paid" || action === "paid") return { status: "paid" as const, intentId: String(row.intent_id ?? "") };
  if (action === "reuse") return { status: "payment_required" as const, intentId: String(row.intent_id ?? ""), amountPaise: Number(row.amount_paise) };
  if (action === "blocked" || action === "pending") {
    throw new ApiError("A payment for this ticket is already being checked. Open the same payment again in a moment. Do not start another one.", 409);
  }
  if (action !== "create") throw new ApiError("Online payment could not be started. Try again.", 503);
  const intentId = String(row.intent_id ?? "");
  const amountPaise = Number(row.amount_paise);
  let order: { orderId: string };
  try {
    order = await orderPlacer(amountPaise, input.receipt);
  } catch (error) {
    if (error instanceof ApiError && error.status < 500) await db().rpc("mark_gateway_rejected", { p_intent: intentId });
    else await db().rpc("mark_gateway_uncertain", { p_intent: intentId });
    throw error instanceof ApiError ? error : new ApiError("The payment service did not answer. Do not start another payment until this one is checked.", 503);
  }
  const attached = await db().rpc("attach_gateway_order", { p_intent: intentId, p_order: order.orderId });
  if (attached.error || readJson(attached.data).status !== "attached") {
    await db().rpc("mark_gateway_uncertain", { p_intent: intentId });
    throw new ApiError("The payment result is not known yet. Do not start another payment until this one is checked.", 503);
  }
  return { status: "payment_required" as const, intentId, amountPaise };
}

export function verifyPayment(orderId: string, paymentId: string, signature: string) {
  const { secret } = keys();
  const expected = createHmac("sha256", secret).update(`${orderId}|${paymentId}`).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw new ApiError("The payment could not be verified.", 400);
}

export async function paymentStatus(userId: string, intentId: string) {
  const { data } = await db().from("payment_intents").select("id,status,owner_id,purpose,ref_id").eq("id", intentId).maybeSingle();
  if (!data || data.owner_id !== userId) throw new ApiError("That payment was not found.", 404);
  let bookingStatus: string | null = null;
  if (data.purpose === "seat_booking" && data.ref_id) {
    const booking = await db().from("seat_bookings").select("status").eq("id", data.ref_id).maybeSingle();
    bookingStatus = booking.data?.status ? String(booking.data.status) : null;
  }
  const outcome = confirmationOutcome({ purpose: String(data.purpose), intentStatus: String(data.status), bookingStatus });
  return { status: outcome.booked ? "paid" : outcome.status };
}

export async function checkoutDetails(intentId: string) {
  const { data } = await db().from("payment_intents").select("id,status,amount_paise,razorpay_order_id").eq("id", intentId).maybeSingle();
  if (!data) return null;
  const { id } = keys();
  return {
    intentId: String(data.id),
    status: String(data.status),
    amount: Number(data.amount_paise),
    orderId: String(data.razorpay_order_id ?? ""),
    keyId: id,
  };
}

export async function resumeReconcileRefund(intentId: string, refId: string, amountPaise: number) {
  const claim = await db().rpc("claim_reconcile_refund", { p_intent: intentId });
  if (claim.error || readJson(claim.data).send !== true) return;
  try {
    const refund = await refundSeatPayment(refId, amountPaise);
    if (refund.status === "none") {
      await db().rpc("release_refund_claim", { p_intent: intentId });
      return;
    }
    await db().rpc("mark_refund_pending", { p_intent: intentId });
  } catch {
    await db().rpc("release_refund_claim", { p_intent: intentId });
  }
}

export async function confirmOnlinePayment(intentId: string, payment: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }, claimerId?: string) {
  verifyPayment(payment.razorpay_order_id, payment.razorpay_payment_id, payment.razorpay_signature);
  const result = await db().rpc("confirm_gateway_payment", {
    p_intent: intentId,
    p_order: payment.razorpay_order_id,
    p_payment: payment.razorpay_payment_id,
    p_owner: claimerId ?? null,
  });
  if (result.error) throw new ApiError("The payment result is not known yet. Check the ticket again before starting another payment.", 503);
  const row = readJson(result.data);
  const outcome = confirmationOutcome({
    purpose: String(row.purpose ?? ""),
    intentStatus: String(row.status ?? ""),
    bookingStatus: row.booking_status ? String(row.booking_status) : null,
  });
  if (row.refund_required === true || String(row.status) === "reconcile") {
    await resumeReconcileRefund(intentId, String(row.ref_id ?? ""), Number(row.amount_paise ?? 0));
  }
  if (!outcome.booked) throw new ApiError(confirmationMessage(outcome.status), outcome.http);
  if (String(row.purpose) === "seat_booking" && row.ref_id) await recordSeatSettlement(String(row.ref_id), payment.razorpay_payment_id);
  return { status: "paid" as const };
}

type SavedRefund = { paymentId: string; amountPaise: number; refundId?: string; status: "pending" | "processing" | "processed" | "failed" | "sent" };

function refundKey(bookingId: string) {
  return `seat_refund_${bookingId}`;
}

async function readRefund(bookingId: string): Promise<SavedRefund | null> {
  const { data } = await db().from("platform_settings").select("value").eq("key", refundKey(bookingId)).maybeSingle();
  if (!data?.value) return null;
  try {
    return JSON.parse(String(data.value)) as SavedRefund;
  } catch {
    return null;
  }
}

async function saveRefund(bookingId: string, value: SavedRefund) {
  await db().from("platform_settings").upsert({ key: refundKey(bookingId), value: JSON.stringify(value), updated_at: new Date().toISOString() });
}

// Sends a cancelled ticket's money back to the same UPI, card, or bank account.
// Without Razorpay keys the refund is stored and sent on the next cancel or payment.
export async function refundSeatPayment(bookingId: string, amountPaise: number) {
  const amount = Math.round(amountPaise);
  const saved = await readRefund(bookingId);
  const decision = gatewayRefundDecision(saved, amount);
  if (decision === "none") return { status: "none" as const };
  if (decision === "skip") return { status: saved?.status === "processing" ? "processing" as const : "processed" as const, refundId: saved?.refundId };
  const { data } = await db().from("payment_intents").select("id,razorpay_payment_id,amount_paise").eq("ref_id", bookingId).not("razorpay_payment_id", "is", null).order("created_at", { ascending: false }).limit(1).maybeSingle();
  const paymentId = data?.razorpay_payment_id ? String(data.razorpay_payment_id) : saved?.paymentId ?? "";
  if (!paymentId) return { status: "none" as const };
  const id = process.env.RAZORPAY_KEY_ID?.trim();
  const secret = process.env.RAZORPAY_KEY_SECRET?.trim();
  if (!id || !secret || loadtestBlocks("https://api.razorpay.com/v1/payments/refund")) {
    await saveRefund(bookingId, { paymentId, amountPaise: amount, status: "pending" });
    return { status: "pending" as const };
  }
  const auth = Buffer.from(`${id}:${secret}`).toString("base64");
  const response = await fetch(`https://api.razorpay.com/v1/payments/${paymentId}/refund`, {
    method: "POST",
    headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json" },
    body: JSON.stringify({ amount, receipt: bookingId.replace(/-/g, "").slice(0, 40), notes: { booking: bookingId } }),
  });
  const body = (await response.json().catch(() => null)) as { id?: string } | null;
  if (!response.ok || !body?.id) {
    await saveRefund(bookingId, { paymentId, amountPaise: amount, status: "pending" });
    return { status: "pending" as const };
  }
  await saveRefund(bookingId, { paymentId, amountPaise: amount, refundId: body.id, status: "processing" });
  return { status: "processing" as const, refundId: body.id };
}

export async function settlePendingRefunds() {
  const { data } = await db().from("platform_settings").select("key,value").like("key", "seat_refund_%").limit(40);
  for (const row of data ?? []) {
    let saved: SavedRefund | null = null;
    try {
      saved = JSON.parse(String(row.value)) as SavedRefund;
    } catch {
      saved = null;
    }
    if (!saved || saved.status === "sent" || saved.status === "processed" || saved.status === "processing") continue;
    const bookingId = String(row.key).replace(/^seat_refund_/, "");
    await refundSeatPayment(bookingId, saved.amountPaise).catch(() => undefined);
  }
}

type SeatSettlement = {
  bookingId: string;
  paymentId: string;
  captainId?: string;
  collectedPaise: number;
  captainPaise: number;
  feePaise: number;
  gstPaise: number;
  reversedPaise?: number;
  status: "pending_route" | "in_wallet" | "reversed";
};

async function saveSeatSettlement(row: SeatSettlement) {
  await db().from("platform_settings").upsert({ key: `seat_settlement_${row.bookingId}`, value: JSON.stringify(row), updated_at: new Date().toISOString() });
  await db().from("seat_settlements").upsert({
    booking_id: row.bookingId,
    payment_id: row.paymentId,
    collected_paise: row.collectedPaise,
    captain_paise: row.captainPaise,
    fee_paise: row.feePaise,
    gst_paise: row.gstPaise,
    status: row.status,
  }, { onConflict: "booking_id" });
}

async function readSeatSettlement(bookingId: string): Promise<SeatSettlement | null> {
  const { data } = await db().from("platform_settings").select("value").eq("key", `seat_settlement_${bookingId}`).maybeSingle();
  if (!data?.value) return null;
  try {
    return JSON.parse(String(data.value)) as SeatSettlement;
  } catch {
    return null;
  }
}

export async function resumeCapturedSeat(event: RazorpayEvent) {
  const payment = event.payload?.payment?.entity;
  if (!payment?.id || !payment.order_id) return;
  const intent = await db().from("payment_intents").select("purpose,ref_id,status").eq("razorpay_order_id", payment.order_id).maybeSingle();
  if (intent.data?.purpose !== "seat_booking" || intent.data.status !== "paid" || !intent.data.ref_id) return;
  await recordSeatSettlement(String(intent.data.ref_id), payment.id);
}

export async function recordSeatSettlement(bookingId: string, paymentId: string) {
  const existing = await readSeatSettlement(bookingId);
  if (existing?.status === "in_wallet" || existing?.status === "reversed") return;
  const { data } = await db().from("seat_bookings").select("fare_paise,fee_paise,gst_paise,total_paise,cash_paise,wallet_collected_paise,gateway_collected_paise,desk_collected_paise,trip_id").eq("id", bookingId).maybeSingle();
  if (!data) return;
  const captain = Math.round(Number(data.fare_paise) || 0);
  const fee = Math.round(Number(data.fee_paise) || 0);
  const gst = Math.round(Number(data.gst_paise) || 0);
  const collected = Math.round(Number(data.wallet_collected_paise) || 0) + Math.round(Number(data.gateway_collected_paise) || 0) + Math.round(Number(data.desk_collected_paise) || 0);
  const trip = data.trip_id ? await db().from("seat_trips").select("captain_id").eq("id", data.trip_id).maybeSingle() : { data: null };
  const captainId = trip.data?.captain_id ? String(trip.data.captain_id) : "";
  // Captain cash is posted once, by seat_trip_complete. Posting it here as well paid the fare twice.
  const row: SeatSettlement = { bookingId, paymentId, captainId, collectedPaise: collected, captainPaise: captain, feePaise: fee, gstPaise: gst, reversedPaise: 0, status: "pending_route" };
  await saveSeatSettlement(row);
}

export async function reverseSeatCredit(bookingId: string, refundPaise: number) {
  const saved = await readSeatSettlement(bookingId);
  if (!saved || saved.status !== "in_wallet" || !saved.captainId) return;
  const already = Math.max(0, saved.reversedPaise ?? 0);
  const slice = Math.min(saved.captainPaise - already, Math.max(0, Math.round(refundPaise)));
  if (slice < 100) return;
  const posted = await db().rpc("ledger_post", {
    p_owner: saved.captainId,
    p_kind: "adjustment",
    p_amount: -slice,
    p_ref_type: "admin_adjustment",
    p_ref_id: bookingId,
    p_note: "Carpool seat fare returned",
    p_allow_negative: true,
  });
  if (posted.error) return;
  const reversedPaise = already + slice;
  await saveSeatSettlement({ ...saved, reversedPaise, status: reversedPaise >= saved.captainPaise ? "reversed" : "in_wallet" });
}

export type RazorpayEvent = { event?: string; payload?: { payment?: { entity?: { id?: string; order_id?: string } }; refund?: { entity?: { id?: string; payment_id?: string; status?: string } } } };

export async function applyRazorpayEvent(event: RazorpayEvent) {
  const name = event.event ?? "";
  const refund = event.payload?.refund?.entity;
  if (refund?.id && (name === "refund.processed" || name === "refund.failed")) {
    const { data } = await db().from("platform_settings").select("key,value").like("key", "seat_refund_%").limit(80);
    for (const row of data ?? []) {
      let saved: SavedRefund | null = null;
      try {
        saved = JSON.parse(String(row.value)) as SavedRefund;
      } catch {
        saved = null;
      }
      if (!saved || saved.refundId !== refund.id) continue;
      const status = name === "refund.processed" ? "processed" : "failed";
      if (refundEventDecision(saved.status, status) === "skip") continue;
      await saveRefund(String(row.key).replace(/^seat_refund_/, ""), { ...saved, status });
      if (status === "processed" && saved.paymentId) {
        const bookingId = String(row.key).replace(/^seat_refund_/, "");
        await reverseSeatCredit(bookingId, saved.amountPaise);
      }
    }
  }
}
