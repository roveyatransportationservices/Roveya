// Amounts come from stored rows. This draft is not a tax invoice.

import { loadtestBlocks } from "./loadtestGuard";
import { paymentMethodLabel, paymentStatusLabel } from "./settlementPolicy";

export type ReceiptSource = "city" | "carpool";

export type ReceiptLine = { label: string; paise: number };

export type ServiceReceipt = {
  document: "non_tax_receipt_draft";
  compliance: "issuer_undecided";
  receiptNo: string;
  source: ReceiptSource;
  refId: string;
  bookingRef: string;
  passenger: string;
  captain: string;
  vehicle: string;
  route: string;
  lines: ReceiptLine[];
  paymentMethod: string;
  paymentStatus: string;
  completedAt: string;
  note: string;
};

const note = "This is a trip receipt draft, not a tax invoice. It lists amounts already stored for this trip. It does not decide whether ROVEYA or the captain is the supplier.";

export function receiptNo(source: ReceiptSource, ref: string) {
  const clean = ref.replace(/[^A-Za-z0-9]/g, "").slice(0, 24);
  return source === "city" ? `RV-C-${clean}` : `RV-S-${clean}`;
}

function line(label: string, paise: number | null | undefined): ReceiptLine | null {
  if (paise == null || !Number.isFinite(Number(paise))) return null;
  return { label, paise: Math.round(Number(paise)) };
}

export function cityReceipt(input: {
  tripId: string;
  code: string;
  passenger?: string | null;
  captain?: string | null;
  vehicle?: string | null;
  pickup?: string | null;
  drop?: string | null;
  farePaise?: number | null;
  payment?: string | null;
  paymentStatus?: string | null;
  completedAt: string;
}): ServiceReceipt {
  const fare = line("Ride fare", input.farePaise);
  return {
    document: "non_tax_receipt_draft",
    compliance: "issuer_undecided",
    receiptNo: receiptNo("city", input.code || input.tripId),
    source: "city",
    refId: input.tripId,
    bookingRef: input.code,
    passenger: input.passenger || "Passenger on the trip record",
    captain: input.captain || "Captain on the trip record",
    vehicle: input.vehicle || "",
    route: [input.pickup, input.drop].filter(Boolean).join(" to "),
    lines: fare ? [fare] : [],
    paymentMethod: paymentMethodLabel(input.payment),
    paymentStatus: paymentStatusLabel(input.payment, input.paymentStatus),
    completedAt: input.completedAt,
    note,
  };
}

export function carpoolReceipt(input: {
  bookingId: string;
  pnr: string;
  passenger?: string | null;
  captain?: string | null;
  vehicle?: string | null;
  pickup?: string | null;
  drop?: string | null;
  farePaise?: number | null;
  feePaise?: number | null;
  gstPaise?: number | null;
  securePaise?: number | null;
  paidWith?: string | null;
  status?: string | null;
  completedAt: string;
}): ServiceReceipt {
  const lines = [
    line("Seat fare", input.farePaise),
    line("Booking fee", input.feePaise),
    line("GST on the booking fee", input.gstPaise),
    line("Secure your trip", input.securePaise),
  ].filter((item): item is ReceiptLine => Boolean(item));
  return {
    document: "non_tax_receipt_draft",
    compliance: "issuer_undecided",
    receiptNo: receiptNo("carpool", input.pnr || input.bookingId),
    source: "carpool",
    refId: input.bookingId,
    bookingRef: input.pnr,
    passenger: input.passenger || "Passenger on the booking",
    captain: input.captain || "Captain on the trip",
    vehicle: input.vehicle || "",
    route: [input.pickup, input.drop].filter(Boolean).join(" to "),
    lines,
    paymentMethod: input.paidWith || "",
    paymentStatus: input.status || "",
    completedAt: input.completedAt,
    note,
  };
}

export function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] ?? char);
}

export function receiptHtml(receipt: ServiceReceipt) {
  const rows = receipt.lines.map((item) => `<tr><td style="padding:6px 0;color:#f6f1dc;">${escapeHtml(item.label)}</td><td style="padding:6px 0;text-align:right;color:#f6f1dc;">₹${(item.paise / 100).toFixed(2)}</td></tr>`).join("");
  const total = receipt.lines.reduce((sum, item) => sum + item.paise, 0);
  return `<!doctype html><html><body style="margin:0;background:#12060d;font-family:Georgia,serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#12060d;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" style="max-width:480px;background:#1c0c12;border:1px solid rgba(214,160,0,0.35);border-radius:24px;padding:32px 24px;">
        <tr><td style="color:#d6a000;font-size:28px;letter-spacing:0.08em;">ROVEYA</td></tr>
        <tr><td style="color:#f6f1dc;font-size:18px;padding-top:12px;">Trip receipt</td></tr>
        <tr><td style="color:rgba(246,241,220,0.65);font-size:13px;padding-top:8px;font-family:Arial,sans-serif;">${escapeHtml(receipt.note)}</td></tr>
        <tr><td style="color:#f6f1dc;font-size:14px;padding-top:20px;font-family:Arial,sans-serif;">Receipt ${escapeHtml(receipt.receiptNo)} · Ride ${escapeHtml(receipt.bookingRef)}</td></tr>
        <tr><td style="color:#f6f1dc;font-size:14px;padding-top:8px;font-family:Arial,sans-serif;">${escapeHtml(receipt.completedAt)}</td></tr>
        <tr><td style="color:#f6f1dc;font-size:14px;padding-top:16px;font-family:Arial,sans-serif;">Passenger: ${escapeHtml(receipt.passenger)}</td></tr>
        <tr><td style="color:#f6f1dc;font-size:14px;padding-top:4px;font-family:Arial,sans-serif;">Captain: ${escapeHtml(receipt.captain)}</td></tr>
        <tr><td style="color:#f6f1dc;font-size:14px;padding-top:4px;font-family:Arial,sans-serif;">Vehicle: ${escapeHtml(receipt.vehicle || "—")}</td></tr>
        <tr><td style="color:#f6f1dc;font-size:14px;padding-top:4px;font-family:Arial,sans-serif;">Route: ${escapeHtml(receipt.route || "—")}</td></tr>
        <tr><td style="padding-top:20px;"><table role="presentation" width="100%">${rows}
          <tr><td style="padding-top:12px;border-top:1px solid rgba(214,160,0,0.35);color:#d6a000;font-family:Arial,sans-serif;">Total</td><td style="padding-top:12px;border-top:1px solid rgba(214,160,0,0.35);text-align:right;color:#d6a000;font-family:Arial,sans-serif;">₹${(total / 100).toFixed(2)}</td></tr>
        </table></td></tr>
        <tr><td style="color:rgba(246,241,220,0.75);font-size:13px;padding-top:20px;font-family:Arial,sans-serif;">${escapeHtml(receipt.paymentMethod)}</td></tr>
        <tr><td style="color:rgba(246,241,220,0.55);font-size:12px;padding-top:4px;font-family:Arial,sans-serif;">Payment status on record: ${escapeHtml(receipt.paymentStatus || "—")}</td></tr>
      </table>
    </td></tr>
  </table></body></html>`;
}

export function receiptEmailDecision(input: { configured: boolean; approved: boolean; alreadySent: boolean }) {
  if (input.alreadySent) return "skip" as const;
  if (!input.configured || !input.approved) return "hold" as const;
  return "send" as const;
}

export function refundNotice(status: string, storedRefundPaise = 0, gatewayPaise = 0) {
  if (status === "failed") return null;
  if (status === "pending" || status === "processing" || (gatewayPaise > 0 && status !== "processed" && status !== "none")) {
    return { kind: "refund_initiated" as const, title: "Refund started", body: "A refund has been started. It is not complete yet." };
  }
  if (status === "processed") return { kind: "refund_completed" as const, title: "Refund completed", body: "The stored refund has been completed." };
  if (gatewayPaise <= 0 && storedRefundPaise > 0) return { kind: "refund_completed" as const, title: "Refund completed", body: "The stored wallet refund has been completed." };
  return null;
}

export async function deliverReceiptEmail(input: {
  to: string;
  receipt: ServiceReceipt;
  configured: boolean;
  approved: boolean;
  alreadySent: boolean;
  apiKey?: string;
  from?: string;
  fetchImpl?: (url: string, init: { method: string; headers: Record<string, string>; body: string }) => Promise<{ ok: boolean }>;
}) {
  const decision = receiptEmailDecision(input);
  if (decision !== "send" || loadtestBlocks("https://api.resend.com/emails")) return { status: decision === "send" ? "hold" as const : decision, sent: false as const };
  const send = input.fetchImpl;
  if (!send || !input.apiKey || !input.from || !input.to) return { status: "hold" as const, sent: false as const };
  const response = await send("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${input.apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: input.from, to: input.to, subject: `ROVEYA receipt ${input.receipt.receiptNo}`, html: receiptHtml(input.receipt) }),
  });
  return { status: response.ok ? "accepted" as const : "failed" as const, sent: response.ok };
}
