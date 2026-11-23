// Rules for the India-day captain fee. The charge itself is public.charge_active_day.
// That function inserts the marker and the ledger line in one transaction.

export type DayFeeDecision =
  | { action: "skip" }
  | { action: "already"; transactionId: string; amountPaise: number }
  | { action: "charge"; amountPaise: number };

export function dayFeeDecision(input: {
  vehicle: string;
  mode: string;
  bikeDayRupees: number;
  autoDayRupees: number;
  monthVehicle?: string | null;
  monthUntil?: string | null;
  day: string;
  existingPaise?: number | null;
  existingTransactionId?: string | null;
}): DayFeeDecision {
  if (input.vehicle !== "bike" && input.vehicle !== "auto") return { action: "skip" };
  if (input.mode === "commission") return { action: "skip" };
  if (input.monthVehicle === input.vehicle && input.monthUntil && input.monthUntil >= input.day) return { action: "skip" };
  if (input.existingTransactionId && input.existingPaise != null) {
    return { action: "already", transactionId: input.existingTransactionId, amountPaise: input.existingPaise };
  }
  const rupees = input.vehicle === "bike" ? input.bikeDayRupees : input.autoDayRupees;
  const amountPaise = Math.round(rupees * 100);
  if (amountPaise <= 0) return { action: "skip" };
  return { action: "charge", amountPaise };
}

export function dayFeeFromRpc(data: unknown) {
  if (data == null) return null;
  let row: unknown = data;
  if (typeof data === "string") {
    try {
      row = JSON.parse(data);
    } catch {
      return null;
    }
  }
  if (!row || typeof row !== "object") return null;
  const record = row as { transactionId?: unknown; day?: unknown; amountPaise?: unknown };
  const transactionId = typeof record.transactionId === "string" ? record.transactionId : "";
  const day = typeof record.day === "string" ? record.day : "";
  const amountPaise = Number(record.amountPaise);
  if (!transactionId || !day || !Number.isFinite(amountPaise)) return null;
  return { transactionId, day, amount: amountPaise / 100 };
}
