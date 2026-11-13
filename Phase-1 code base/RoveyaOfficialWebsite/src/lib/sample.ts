import { SEAT_TEMPLATES } from "./rules";
import type { Trip } from "./types";

// Shown when the platform API is not running. Same Hyderabad sample captains as the database.
export function sampleTrips(from: string, to: string, date: string): Trip[] {
  const seats = SEAT_TEMPLATES.seat6.map((seat, index) => ({
    ...seat,
    price: 899,
    state: index === 2 ? ("booked" as const) : ("available" as const),
  }));
  return [
    {
      id: `sample-${from}-${to}-${date}`,
      code: "RVT-50001",
      fromId: from,
      toId: to,
      date,
      departAt: "09:00",
      arriveAt: "14:30",
      durationMin: 330,
      status: "scheduled",
      operator: "Arjun",
      operatorRating: 4.8,
      operatorReviews: 120,
      car: "Maruti Ertiga",
      carClass: "SUV",
      ac: true,
      layout: "seat6",
      layoutTitle: "7-seater",
      carAge: "2022",
      rating: 4.8,
      reviews: 86,
      fare: 899,
      seats,
      seatsLeft: seats.filter((seat) => seat.state === "available").length,
      boarding: [{ id: "b1", name: "Ameerpet", landmark: "Metro exit B", time: "09:00", dayOffset: 0, phone: "" }],
      drops: [{ id: "d1", name: "Benz Circle", landmark: "Trendset Mall", time: "14:30", dayOffset: 0, phone: "" }],
      tags: ["Sample"],
      amenities: ["AC", "Live tracking"],
      womenFriendly: true,
      assured: true,
    },
  ];
}

export function sampleTrip(id: string) {
  const parts = id.split("-");
  if (parts[0] !== "sample" || parts.length < 4) return null;
  const date = parts.slice(3).join("-");
  return sampleTrips(parts[1], parts[2], date)[0] ?? null;
}
