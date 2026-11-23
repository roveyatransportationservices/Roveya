import "../../../../../car-captains/src/typeface";
import { useEffect, useRef } from "react";
import { bindHostSignOut } from "../../../../../car-captains/src/host";
import { CaptainNavigation as CarNavigation } from "../../../../../car-captains/src/navigation";
import { rememberCaptain, templateSeats } from "../../../../../car-captains/src/service";
import { StoreProvider as CarStore, useStore as useCarStore } from "../../../../../car-captains/src/store";
import type { Profile as CarProfile } from "../../../../../car-captains/src/types";
import { useStore } from "../store";
import type { Captain } from "../types";

function carProfile(captain: Captain): CarProfile {
  const layout = "seat6" as const;
  const seats = templateSeats(layout);
  const active = captain.status === "active";
  return {
    captain: {
      user_id: captain.captainId,
      captain_code: captain.captainId,
      phone: captain.phone,
      name: captain.name,
      city: captain.city,
      status: active ? "active" : "review",
      rating: 5,
      bank_last4: captain.bankLast4,
      email: captain.email,
      emergency_name: captain.emergencyName,
      emergency_phone: captain.emergencyPhone,
    },
    car: {
      id: "local-car",
      makeModel: captain.vehicleModel || "Maruti Ertiga",
      carClass: "SUV",
      plate: captain.vehicleNo,
      color: captain.vehicleColor || "White",
      year: Number(captain.vehicleYear) || 2022,
      ac: true,
      amenities: [],
      layout,
      layoutTitle: "7-seater",
      seatCount: seats.length,
      seats,
      status: active ? "active" : "review",
      reviewNote: null,
    },
    documents: [],
    plan: {
      cycle: "weekly",
      pendingCycle: null,
      periodStart: new Date(Date.now() - 7 * 86400000).toISOString(),
      periodEnd: new Date(Date.now() + 7 * 86400000).toISOString(),
    },
    balance: 0,
  };
}

function Seed() {
  const bike = useStore();
  const car = useCarStore();
  const captain = bike.captain;
  const opened = useRef(false);
  if (captain?.vehicle === "cab" && !opened.current) rememberCaptain(carProfile(captain));
  useEffect(() => {
    if (!captain || captain.vehicle !== "cab") return;
    if (car.phase === "boot") return;
    if (opened.current && car.phase === "signedOut") {
      bike.signOut();
      return;
    }
    if (!opened.current) {
      opened.current = true;
      car.setProfile(rememberCaptain(carProfile(captain)));
    }
  }, [captain, car.phase, car, bike]);
  return null;
}

export function CarGate() {
  const bike = useStore();
  useEffect(() => {
    bindHostSignOut(() => bike.signOut());
    return () => bindHostSignOut(null);
  }, [bike]);
  return (
    <CarStore>
      <Seed />
      <CarNavigation />
    </CarStore>
  );
}
