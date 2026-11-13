const http = require("http");
const bus = require("./bus");
const geo = require("./geo");
const pricing = require("./pricing");
const analytics = require("./analytics");
const users = require("./users");
const captains = require("./captains");
const rides = require("./rides");
const matching = require("./matching");

function readBody(request) {
  return new Promise((resolve) => {
    const chunks = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => {
      if (!chunks.length) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch {
        resolve({});
      }
    });
  });
}

function send(response, status, body) {
  response.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  });
  response.end(JSON.stringify(body));
}

const server = http.createServer(async (request, response) => {
  if (request.method === "OPTIONS") return send(response, 204, {});
  const url = new URL(request.url, "http://localhost");
  const body = request.method === "POST" ? await readBody(request) : {};

  if (url.pathname === "/health") {
    return send(response, 200, { ok: true, desk: "ROVEYA", services: ["user", "ride", "captain", "matching", "geo", "pricing", "payments", "analytics"] });
  }

  if (request.method === "POST" && url.pathname === "/v1/session") {
    const user = users.verify(body);
    if (!user) return send(response, 401, { error: "Use code 1234." });
    bus.publish("user.signed_in", user);
    return send(response, 200, user);
  }

  if (request.method === "POST" && url.pathname === "/v1/captains") {
    const profile = captains.save(body);
    bus.publish("captain.registered", { phone: profile.phone });
    return send(response, 200, profile);
  }

  if (request.method === "POST" && url.pathname.startsWith("/v1/captains/") && url.pathname.endsWith("/presence")) {
    const phone = decodeURIComponent(url.pathname.split("/")[3]);
    return send(response, 200, captains.presence(phone, body));
  }

  if (request.method === "GET" && url.pathname === "/v1/pricing/quote") {
    const kilometers = geo.distanceKm(
      { latitude: Number(url.searchParams.get("fromLat")), longitude: Number(url.searchParams.get("fromLng")) },
      { latitude: Number(url.searchParams.get("toLat")), longitude: Number(url.searchParams.get("toLng")) },
    );
    const priced = pricing.quote(url.searchParams.get("vehicle") || "bike", kilometers, url.searchParams.get("code"));
    return send(response, 200, { kilometers, ...priced });
  }

  if (request.method === "POST" && url.pathname === "/v1/rides") {
    const priced = pricing.quote(body.vehicle, body.distanceKm, body.code);
    const ride = rides.create({ ...body, fare: body.fare || priced.fare });
    return send(response, 201, ride);
  }

  const rideMatch = url.pathname.match(/^\/v1\/rides\/([^/]+)(?:\/(accept|pass|status))?$/);
  if (rideMatch) {
    const id = decodeURIComponent(rideMatch[1]);
    const action = rideMatch[2];
    if (request.method === "GET" && !action) {
      const ride = rides.get(id);
      return send(response, ride ? 200 : 404, ride || { error: "Ride not found" });
    }
    if (request.method === "POST" && action === "accept") {
      const profile = captains.profiles.get(body.phone);
      const ride = rides.accept(id, {
        name: profile?.name || body.name,
        rating: 4.9,
        vehicleNo: profile?.vehicleNo || body.vehicleNo,
        vehicleName: profile?.vehicleName || body.vehicleName,
        trips: 1,
      });
      return send(response, ride ? 200 : 409, ride || { error: "Ride is no longer open" });
    }
    if (request.method === "POST" && action === "pass") {
      return send(response, 200, rides.pass(id, body.phone) || { error: "Ride not found" });
    }
    if (request.method === "POST" && action === "status") {
      const result = rides.update(id, body.status, body.otp);
      if (result.error === "otp") return send(response, 422, { error: "That code does not match." });
      if (result.error) return send(response, 404, { error: "Ride not found" });
      return send(response, 200, result.ride);
    }
  }

  if (request.method === "GET" && url.pathname === "/v1/matching/offers") {
    const offer = matching.offerFor(url.searchParams.get("phone") || "");
    return send(response, 200, { offer });
  }

  if (request.method === "GET" && url.pathname === "/v1/analytics/summary") {
    return send(response, 200, { ...analytics.snapshot(), events: bus.recent() });
  }

  return send(response, 404, { error: "Unknown route" });
});

server.listen(4000, "0.0.0.0", () => {
  console.log("ROVEYA gateway listening on http://localhost:4000");
});
