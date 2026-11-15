"use client";

import { useEffect, useState } from "react";

type RazorpayResult = { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string };

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => { open: () => void };
  }
}

export function PayWindow({ intentId, keyId, orderId, amount }: { intentId: string; keyId: string; orderId: string; amount: number }) {
  const [note, setNote] = useState("Opening the payment window…");

  useEffect(() => {
    let cancelled = false;
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.onload = () => {
      if (cancelled || !window.Razorpay) return;
      const checkout = new window.Razorpay({
        key: keyId,
        amount,
        currency: "INR",
        order_id: orderId,
        name: "ROVEYA",
        description: "Car seat ticket",
        handler: async (response: RazorpayResult) => {
          const result = await fetch(`/api/pay/confirm/${intentId}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(response) });
          const body = (await result.json().catch(() => null)) as { status?: string } | null;
          if (result.ok && body?.status === "paid") setNote("Payment received. You can close this window and return to the app.");
          else setNote("The payment was received, but the ticket is not confirmed. Keep this window and do not pay again.");
        },
        modal: { ondismiss: () => setNote("Payment was not finished. Go back to the app and try again.") },
      });
      checkout.open();
    };
    script.onerror = () => setNote("The payment window could not open. Check the connection and try again.");
    document.body.appendChild(script);
    return () => {
      cancelled = true;
    };
  }, [amount, intentId, keyId, orderId]);

  return (
    <main style={{ minHeight: "100vh", background: "#12060D", color: "#F6E7D8", display: "grid", placeItems: "center", padding: 24, fontFamily: "sans-serif" }}>
      <p>{note}</p>
    </main>
  );
}
