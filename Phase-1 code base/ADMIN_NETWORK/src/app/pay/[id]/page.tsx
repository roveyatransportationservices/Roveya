import { checkoutDetails } from "@/lib/server/razorpay";
import { PayWindow } from "./window";

export default async function PayPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const payment = await checkoutDetails(id).catch(() => null);
  if (!payment || !payment.orderId) {
    return (
      <main style={{ minHeight: "100vh", background: "#12060D", color: "#F6E7D8", display: "grid", placeItems: "center", padding: 24, fontFamily: "sans-serif" }}>
        <p>This payment could not be opened. Go back to the app and try again.</p>
      </main>
    );
  }
  if (payment.status === "paid") {
    return (
      <main style={{ minHeight: "100vh", background: "#12060D", color: "#F6E7D8", display: "grid", placeItems: "center", padding: 24, fontFamily: "sans-serif" }}>
        <p>This ticket is paid. You can close this window and return to the app.</p>
      </main>
    );
  }
  if (payment.status === "reconcile" || payment.status === "refund_pending" || payment.status === "refunded") {
    return (
      <main style={{ minHeight: "100vh", background: "#12060D", color: "#F6E7D8", display: "grid", placeItems: "center", padding: 24, fontFamily: "sans-serif" }}>
        <p>This payment is being checked. The ticket is not confirmed. Do not pay again.</p>
      </main>
    );
  }
  return <PayWindow intentId={payment.intentId} keyId={payment.keyId} orderId={payment.orderId} amount={payment.amount} />;
}
