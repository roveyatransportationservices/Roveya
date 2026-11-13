const bus = require("./bus");
const payments = require("./payments");

const rides = new Map();
let sequence = 2400;

function create(input) {
  sequence += 1;
  const ride = {
    id: `RV-${sequence}`,
    otp: "4821",
    status: "searching",
    createdAt: Date.now(),
    passedBy: [],
    captain: null,
    ...input,
  };
  rides.set(ride.id, ride);
  bus.publish("ride.requested", ride);
  return ride;
}

function get(id) {
  return rides.get(id) || null;
}

function listOpen(vehicle, phone) {
  return [...rides.values()].filter(
    (ride) => ride.status === "searching" && ride.vehicle === vehicle && !ride.passedBy.includes(phone),
  );
}

function accept(id, captain) {
  const ride = rides.get(id);
  if (!ride || ride.status !== "searching") return null;
  ride.status = "assigned";
  ride.captain = captain;
  bus.publish("ride.assigned", ride);
  return ride;
}

function pass(id, phone) {
  const ride = rides.get(id);
  if (!ride) return null;
  if (!ride.passedBy.includes(phone)) ride.passedBy.push(phone);
  bus.publish("ride.passed", { id, phone });
  return ride;
}

function update(id, status, otp) {
  const ride = rides.get(id);
  if (!ride) return { error: "missing" };
  if (status === "onTrip" && otp !== ride.otp) return { error: "otp" };
  ride.status = status;
  if (status === "done") {
    payments.settle(ride);
    bus.publish("ride.completed", ride);
  }
  bus.publish("ride.updated", ride);
  return { ride };
}

module.exports = { create, get, listOpen, accept, pass, update, rides };
