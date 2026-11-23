import { NextResponse } from "next/server";
import { db } from "@/lib/server/db";
import { gatewayReplay, webhookAdmission } from "@/lib/server/paymentState";
import { applyRazorpayEvent, recordSeatSettlement, resumeCapturedSeat, resumeReconcileRefund, type RazorpayEvent } from "@/lib/server/razorpay";

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

export async function POST(req: Request) {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET?.trim() ?? "";
  const raw = await req.text();
  const signature = req.headers.get("x-razorpay-signature") ?? "";
  let eventId = "";
  try {
    eventId = String((JSON.parse(raw) as { id?: string }).id ?? "");
  } catch {
    eventId = "";
  }
  const admission = webhookAdmission({ secret, raw, signature, eventId });
  if (admission.http !== 200) return NextResponse.json(admission.body, { status: admission.http });
  const event = JSON.parse(raw) as RazorpayEvent;
  const saved = await db().rpc("accept_gateway_event", {
    p_event_id: eventId,
    p_event_name: event.event ?? "",
    p_payload: event,
  });
  if (saved.error) return NextResponse.json({ error: "The event could not be stored. Try again." }, { status: 503 });
  const row = readJson(saved.data);
  const replay = gatewayReplay(typeof row.status === "string" ? row.status : undefined);
  if (replay === "retry") return NextResponse.json({ error: "The event is still being processed." }, { status: 503 });
  if (replay === "replay") {
    await resumeCapturedSeat(event);
    if (event.event === "refund.processed" || event.event === "refund.failed") await applyRazorpayEvent(event);
    return NextResponse.json({ ok: true, duplicate: true });
  }
  if (row.status === "paid" && row.purpose === "seat_booking" && row.ref_id) {
    await recordSeatSettlement(String(row.ref_id), String(row.payment_id ?? ""));
  }
  if (row.refund_required === true && row.payment_id) {
    const intent = await db().from("payment_intents").select("id,ref_id,amount_paise").eq("razorpay_payment_id", String(row.payment_id)).maybeSingle();
    if (intent.data?.id) await resumeReconcileRefund(String(intent.data.id), String(intent.data.ref_id ?? ""), Number(intent.data.amount_paise ?? 0));
  }
  if (row.kind === "refund" && row.changed === true) await applyRazorpayEvent(event);
  return NextResponse.json({ ok: true, status: String(row.status ?? "applied") });
}
