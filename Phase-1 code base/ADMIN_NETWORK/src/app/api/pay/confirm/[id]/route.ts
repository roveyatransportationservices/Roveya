import { NextResponse } from "next/server";
import { ApiError } from "@/lib/server/api";
import { allow } from "@/lib/server/rateLimit";
import { confirmOnlinePayment } from "@/lib/server/razorpay";

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  try {
    await allow("pay-confirm", id, 8, 60, "Too many payment checks. Wait a minute and try again.");
    const body = (await req.json().catch(() => null)) as { razorpay_order_id?: string; razorpay_payment_id?: string; razorpay_signature?: string } | null;
    if (!body?.razorpay_order_id || !body.razorpay_payment_id || !body.razorpay_signature) {
      return NextResponse.json({ error: "The payment could not be verified." }, { status: 400 });
    }
    return NextResponse.json(await confirmOnlinePayment(id, {
      razorpay_order_id: body.razorpay_order_id,
      razorpay_payment_id: body.razorpay_payment_id,
      razorpay_signature: body.razorpay_signature,
    }));
  } catch (error) {
    const status = error instanceof ApiError ? error.status : 503;
    const message = error instanceof ApiError ? error.message : "The payment result is not known yet. Check the ticket again before starting another payment.";
    return NextResponse.json({ error: message }, { status });
  }
}
