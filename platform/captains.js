const geo = require("./geo");
const profiles = new Map();

const standby = {
  bike: { name: "Ravi Kumar", rating: 4.92, vehicleNo: "TS09 AB 2146", vehicleName: "Honda SP 125", trips: 1840 },
  auto: { name: "Meera Patel", rating: 4.86, vehicleNo: "TS10 U 3391", vehicleName: "Bajaj RE", trips: 960 },
  cab: { name: "Arjun Reddy", rating: 4.95, vehicleNo: "TS07 EA 1184", vehicleName: "Ertiga CNG", trips: 720 },
};

function save(profile) {
  profiles.set(profile.phone, profile);
  return profile;
}

function presence(phone, body) {
  const profile = profiles.get(phone);
  geo.setPresence(phone, {
    phone,
    name: profile?.name || body.name,
    vehicle: body.vehicle || profile?.vehicle || "bike",
    vehicleNo: profile?.vehicleNo,
    vehicleName: profile?.vehicleName,
    latitude: body.latitude,
    longitude: body.longitude,
    online: Boolean(body.online),
  });
  return { online: Boolean(body.online) };
}

module.exports = { save, presence, profiles, standby };
