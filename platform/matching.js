const geo = require("./geo");
const rides = require("./rides");
const captains = require("./captains");
const bus = require("./bus");

function offerFor(phone) {
  const presence = geo.online.get(phone);
  if (!presence) return null;
  const open = rides.listOpen(presence.vehicle, phone);
  if (!open.length) return null;
  open.sort((a, b) => geo.distanceKm(presence, a.pickup) - geo.distanceKm(presence, b.pickup));
  return open[0];
}

setInterval(() => {
  for (const ride of rides.rides.values()) {
    if (ride.status === "assigned" && ride.standby && Date.now() - ride.assignedAt > 3000) {
      ride.status = "arrived";
      bus.publish("ride.updated", ride);
      continue;
    }
    if (ride.status !== "searching") continue;
    if (Date.now() - ride.createdAt < 12000) continue;
    const nearest = geo.nearest(ride.pickup, ride.vehicle);
    if (nearest && !ride.passedBy.includes(nearest.phone)) continue;
    ride.status = "assigned";
    ride.standby = true;
    ride.assignedAt = Date.now();
    ride.captain = captains.standby[ride.vehicle] || captains.standby.bike;
    bus.publish("ride.assigned", ride);
  }
}, 1000);

module.exports = { offerFor };
