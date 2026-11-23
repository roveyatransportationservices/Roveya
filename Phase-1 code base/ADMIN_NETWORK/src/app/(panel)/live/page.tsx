import { redirect } from "next/navigation";

// Live Trips opens on ROVEYA Bike Live. Carpool trips on the road are under Carpool Networks.
export default function LivePage() {
  redirect("/live/bike");
}
