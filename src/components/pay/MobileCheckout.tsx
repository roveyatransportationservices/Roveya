"use client";

import { useEffect, useRef, useState } from "react";

type Result = { status: "success" | "failed" | "cancelled"; orderId: string; message?: string };
type CheckoutResponse = { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string };
type RazorpayCtor = new (options: Record<string, unknown>) => { open: () => void; on: (event: string, handler: (response: { error?: { description?: string } }) => void) => void };

const labels: Record<string, string> = {
  wallet_topup: "Add money to your ROVEYA wallet",
  trip: "Pay for your ROVEYA ride",
  advertiser_topup: "Add ad credit",
};

function tell(result: Result) {
  const bridge = (window as unknown as { ReactNativeWebView?: { postMessage: (data: string) => void } }).ReactNativeWebView;
  const message = JSON.stringify({ type: "roveya-payment", ...result });
  if (bridge) bridge.postMessage(message);
  else if (window.opener) window.opener.postMessage(message, "*");
}

function loadRazorpay() {
  return new Promise<boolean>((resolve) => {
    if ((window as unknown as { Razorpay?: RazorpayCtor }).Razorpay) return resolve(true);
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

export function MobileCheckout({ orderId, keyId, amountPaise, token, purpose }: { orderId: string; keyId: string; amountPaise: number; token: string; purpose: string }) {
  const [state, setState] = useState<"loading" | "open" | "verifying" | "done" | "error">("loading");
  const [message, setMessage] = useState("");
  const opened = useRef(false);
  const valid = Boolean(orderId && keyId && token && amountPaise > 0);

  const open = async () => {
    if (!valid) {
      setState("error");
      setMessage("This payment link is incomplete. Go back and start again.");
      return;
    }
    const ready = await loadRazorpay();
    const Razorpay = (window as unknown as { Razorpay?: RazorpayCtor }).Razorpay;
    if (!ready || !Razorpay) {
      setState("error");
      setMessage("Razorpay did not load. Check your connection and try again.");
      return;
    }
    setState("open");
    const checkout = new Razorpay({
      key: keyId,
      order_id: orderId,
      amount: amountPaise,
      currency: "INR",
      name: "ROVEYA",
      description: labels[purpose] ?? "ROVEYA payment",
      theme: { color: "#D6A000" },
      handler: async (response: CheckoutResponse) => {
        setState("verifying");
        const reply = await fetch("/api/v1/payments/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Checkout-Token": token },
          body: JSON.stringify({ orderId: response.razorpay_order_id, paymentId: response.razorpay_payment_id, signature: response.razorpay_signature }),
        }).catch(() => null);
        if (reply?.ok) {
          setState("done");
          tell({ status: "success", orderId });
        } else {
          const body = reply ? ((await reply.json().catch(() => ({}))) as { error?: string }) : {};
          setState("error");
          setMessage(body.error ?? "We are confirming your payment. It will reflect in a minute.");
          tell({ status: "failed", orderId, message: body.error });
        }
      },
      modal: {
        ondismiss: () => {
          setState("error");
          setMessage("Payment cancelled. You were not charged.");
          tell({ status: "cancelled", orderId });
        },
      },
    });
    checkout.on("payment.failed", (response) => {
      setState("error");
      setMessage(response.error?.description ?? "The payment failed. You were not charged.");
      tell({ status: "failed", orderId, message: response.error?.description });
    });
    checkout.open();
  };

  const openRef = useRef(open);
  openRef.current = open;

  useEffect(() => {
    if (opened.current) return;
    opened.current = true;
    void openRef.current();
  }, []);

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="text-xs font-semibold tracking-[0.24em] text-[#D6A000]">ROVEYA PAYMENTS</p>
      <h1 className="text-2xl font-semibold">
        {state === "done" ? "Payment received" : state === "verifying" ? "Confirming your payment…" : `₹${(amountPaise / 100).toLocaleString("en-IN")}`}
      </h1>
      <p className="text-sm text-[#F6F1DC]/70">{state === "done" ? "You can go back to the app now." : message || labels[purpose] || "Secure payment by Razorpay"}</p>
      {state === "error" ? (
        <button type="button" className="btn-primary mt-2 w-full py-4" onClick={() => void open()}>
          TRY AGAIN
        </button>
      ) : null}
      <p className="mt-6 text-xs text-[#F6F1DC]/45">Payments are processed by Razorpay. ROVEYA never sees your card or UPI PIN.</p>
    </main>
  );
}
