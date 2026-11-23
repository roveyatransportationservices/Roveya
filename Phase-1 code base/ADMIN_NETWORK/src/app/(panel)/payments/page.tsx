import { redirect } from "next/navigation";

// Payments opens on ROVEYA Bike Riders Payments. The full ledger is at /payments/all.
export default function PaymentsPage() {
  redirect("/payments/riders/bike");
}
