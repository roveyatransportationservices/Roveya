import "server-only";
import Razorpay from "razorpay";
import { z } from "zod";
import { AppError, logServerError } from "@/lib/errors";
import { verifyRazorpayPaymentSignature } from "@/lib/domain/signature";
import { db, dbError, kickConsumers, must, rupees, secret, siteUrl } from "@/lib/platform/gateway";
import { signToken, verifyToken } from "@/lib/platform/tokens";

const PLATFORM = "00000000-0000-0000-0000-000000000001";

type Purpose = "wallet_topup" | "trip" | "advertiser_topup";

function gateway() {
  const keyId = process.env.RAZORPAY_KEY_ID?.trim();
  const keySecret = process.env.RAZORPAY_KEY_SECRET?.trim();
  if (!keyId || !keySecret) throw new AppError("Online payments are not set up yet.", 503);
  return { keyId, keySecret, client: new Razorpay({ key_id: keyId, key_secret: keySecret }) };
}

export const topupSchema = z.object({ amount: z.number().int().min(10, "Add at least ₹10.").max(10000, "Add up to ₹10,000 at a time.") });

export async function createIntent(ownerId: string, purpose: Purpose, amountPaise: number, refId: string | null) {
  const rzp = gateway();
  const client = db();
  const intent = must(await client.from("payment_intents").insert({ owner_id: ownerId, purpose, amount_paise: amountPaise, ref_id: refId }).select("id").single()) as { id: string };
  let orderId: string;
  try {
    const order = await rzp.client.orders.create({ amount: amountPaise, currency: "INR", receipt: intent.id.slice(0, 40), notes: { intent_id: intent.id, purpose } });
    orderId = order.id;
  } catch (error) {
    logServerError("razorpay-intent", error);
    await client.from("payment_intents").update({ status: "failed" }).eq("id", intent.id);
    throw new AppError("We could not start the payment. Try again.", 502);
  }
  await client.from("payment_intents").update({ razorpay_order_id: orderId }).eq("id", intent.id);
  const checkoutToken = signToken({ i: intent.id, o: ownerId, exp: Date.now() + 15 * 60 * 1000 }, secret("checkout"));
  const query = new URLSearchParams({ order: orderId, key: rzp.keyId, amount: String(amountPaise), token: checkoutToken, purpose });
  return { intentId: intent.id, orderId, keyId: rzp.keyId, amount: rupees(amountPaise), checkoutUrl: siteUrl(`/m/checkout?${query.toString()}`) };
}

export function ownerFromCheckoutToken(token: string) {
  const payload = verifyToken<{ i: string; o: string; exp: number }>(token, secret("checkout"));
  if (!payload) throw new AppError("This payment link has expired. Start the payment again.", 401);
  return payload.o;
}

export async function intentStatus(ownerId: string, intentId: string) {
  const { data } = await db().from("payment_intents").select("id,purpose,status,amount_paise,ref_id,updated_at").eq("id", intentId).eq("owner_id", ownerId).maybeSingle();
  if (!data) throw new AppError("Payment not found.", 404);
  return { id: data.id, purpose: data.purpose, status: data.status, amount: rupees(data.amount_paise), refId: data.ref_id };
}

export async function tripPaymentIntent(riderId: string, tripId: string) {
  const { data: trip } = await db().from("trips").select("id,fare_paise,discount_paise,payment_status,status").eq("id", tripId).eq("rider_id", riderId).maybeSingle();
  if (!trip) throw new AppError("Ride not found.", 404);
  if (trip.payment_status === "paid") throw new AppError("This ride is already paid.", 409);
  if (!["on_trip", "completed"].includes(trip.status)) throw new AppError("Pay once the ride has started.", 409);
  return createIntent(riderId, "trip", trip.fare_paise - (trip.discount_paise ?? 0), tripId);
}

export const verifySchema = z.object({
  orderId: z.string().min(6),
  paymentId: z.string().min(6),
  signature: z.string().min(16),
});

export async function verifyPayment(ownerId: string, input: z.infer<typeof verifySchema>) {
  const rzp = gateway();
  if (!verifyRazorpayPaymentSignature({ ...input, keySecret: rzp.keySecret })) throw new AppError("The payment could not be verified.", 400);
  const { data: intent } = await db().from("payment_intents").select("id,owner_id,amount_paise").eq("razorpay_order_id", input.orderId).maybeSingle();
  if (!intent || intent.owner_id !== ownerId) throw new AppError("Payment not found.", 404);

  let amount: number;
  try {
    const payment = await rzp.client.payments.fetch(input.paymentId);
    if (payment.order_id !== input.orderId) throw new AppError("The payment does not match this order.", 400);
    if (payment.status === "authorized") await rzp.client.payments.capture(input.paymentId, Number(payment.amount), "INR");
    else if (payment.status !== "captured") throw new AppError("The payment has not gone through yet.", 409);
    amount = Number(payment.amount);
  } catch (error) {
    if (error instanceof AppError) throw error;
    logServerError("razorpay-verify", error);
    throw new AppError("We could not confirm the payment with Razorpay.", 502);
  }
  return applyIntent(input.orderId, input.paymentId, amount);
}

// Applies a captured payment once, whether the app or the webhook reports it first.
export async function applyIntent(orderId: string, paymentId: string, amountPaise: number) {
  const client = db();
  const { data: intent } = await client.from("payment_intents").select("*").eq("razorpay_order_id", orderId).maybeSingle();
  if (!intent) return { ok: true, ignored: true };
  if (amountPaise !== intent.amount_paise) {
    logServerError("intent-amount", new Error("Captured amount did not match the intent"));
    return { ok: true, ignored: true };
  }
  const { data: claimed } = await client
    .from("payment_intents")
    .update({ status: "paid", razorpay_payment_id: paymentId })
    .eq("id", intent.id)
    .neq("status", "paid")
    .select("id")
    .maybeSingle();
  if (!claimed) return { ok: true, duplicate: true, intentId: intent.id };

  const ref = { p_ref_type: "intent", p_ref_id: intent.id };
  if (intent.purpose === "wallet_topup") {
    await client.rpc("ledger_post", { p_owner: intent.owner_id, p_kind: "topup", p_amount: intent.amount_paise, ...ref, p_note: "Added money" });
  } else if (intent.purpose === "advertiser_topup") {
    await client.rpc("ledger_post", { p_owner: intent.owner_id, p_kind: "advertiser_topup", p_amount: intent.amount_paise, ...ref, p_note: "Ad credit" });
  } else if (intent.purpose === "trip" && intent.ref_id) {
    await client.from("trips").update({ payment: "online", payment_status: "paid" }).eq("id", intent.ref_id).eq("rider_id", intent.owner_id);
    await client.rpc("ledger_post", { p_owner: PLATFORM, p_kind: "ride_payment", p_amount: intent.amount_paise, p_ref_type: "trip", p_ref_id: intent.ref_id });
  }
  void kickConsumers();
  return { ok: true, duplicate: false, intentId: intent.id, purpose: intent.purpose };
}

export async function markIntentFailed(orderId: string) {
  await db().from("payment_intents").update({ status: "failed" }).eq("razorpay_order_id", orderId).eq("status", "created");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Desk: captain payouts
// ---------------------------------------------------------------------------

export async function listPayouts(status: string) {
  const { data } = await db()
    .from("payout_requests")
    .select("id,amount_paise,bank_last4,status,reference,created_at,decided_at,captains(name,captain_code,phone,ifsc,bank_holder)")
    .eq("status", status)
    .order("created_at", { ascending: true })
    .limit(200);
  return { payouts: (data ?? []).map((row) => ({ ...row, amount: rupees(row.amount_paise) })) };
}

export const payoutDecisionSchema = z.object({
  action: z.enum(["paid", "reject"]),
  reference: z.string().trim().max(80).optional(),
});

export async function decidePayout(id: string, staffUserId: string, input: z.infer<typeof payoutDecisionSchema>) {
  if (input.action === "paid" && !input.reference) throw new AppError("Add the bank transfer reference (UTR).", 400);
  const client = db();
  const { data: payout, error } = await client
    .from("payout_requests")
    .update({ status: input.action === "paid" ? "paid" : "rejected", reference: input.reference ?? null, decided_by: staffUserId, decided_at: new Date().toISOString() })
    .eq("id", id)
    .eq("status", "requested")
    .select("*")
    .maybeSingle();
  const failure = dbError(error);
  if (failure) throw failure;
  if (!payout) throw new AppError("This payout was already decided.", 409);
  if (input.action === "reject") {
    await client.rpc("ledger_post", { p_owner: payout.captain_id, p_kind: "payout_reversal", p_amount: payout.amount_paise, p_ref_type: "payout", p_ref_id: payout.id, p_note: "Payout returned to wallet" });
  }
  void kickConsumers();
  return { payout };
}
