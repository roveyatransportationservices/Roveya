import { redirect } from "next/navigation";

// Bike and auto live boards are now ROVEYA Bike Live and ROVEYA Auto Live under Live Trips.
export default function RidesLivePage() {
  redirect("/live/bike");
}
