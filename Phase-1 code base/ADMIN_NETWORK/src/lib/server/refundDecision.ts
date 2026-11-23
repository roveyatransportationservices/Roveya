export type SavedGatewayRefund = {
  status: "pending" | "processing" | "processed" | "failed" | "sent";
  amountPaise: number;
  refundId?: string;
};

// A repeated webhook or a retry must not send the same gateway refund again.
export function gatewayRefundDecision(saved: SavedGatewayRefund | null, amountPaise: number) {
  if (amountPaise < 100) return "none" as const;
  if (!saved || saved.amountPaise !== amountPaise) return "send" as const;
  if (saved.status === "processed" || saved.status === "sent" || saved.status === "processing") return "skip" as const;
  if (saved.status === "pending" && saved.refundId) return "skip" as const;
  return "send" as const;
}

export function refundEventDecision(savedStatus: string, nextStatus: "processed" | "failed") {
  return savedStatus === nextStatus ? "skip" as const : "apply" as const;
}
