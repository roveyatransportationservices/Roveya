import assert from "node:assert/strict";
import test from "node:test";
import { ecpm, eligible, predictedCtr, runAuction, type CampaignCandidate } from "../src/lib/platform/ad-engine";
import { decodePolyline, thin } from "../src/lib/platform/polyline";
import { couponDiscount, DEFAULT_RATES, isPeak, peakBonusPaise, quote, ratesFrom, roadKm } from "../src/lib/platform/pricing";
import { deriveSecret, hashOtp, sameHash, signToken, verifyToken } from "../src/lib/platform/tokens";

test("desk-edited fares replace the defaults and bad values fall back", () => {
  const rates = ratesFrom({ fare_bike_base: "30", fare_bike_per_km: "8", fare_cab_min: "-4", fare_auto_per_km: "abc" });
  assert.deepEqual(rates.bike, { base: 30, perKm: 8, min: 35 });
  assert.equal(rates.cab.min, DEFAULT_RATES.cab.min);
  assert.equal(rates.auto.perKm, DEFAULT_RATES.auto.perKm);
  assert.equal(quote("bike", 10, rates).farePaise, 11000);
  assert.equal(quote("cab", 5, DEFAULT_RATES, 20).etaMin, 20);
  assert.equal(quote("bike", 5, DEFAULT_RATES, 20).etaMin, 17);
});

test("coupons respect minimum fare, vehicles, caps and the ₹10 floor", () => {
  const flat = { kind: "flat" as const, value: 5000, max_discount_paise: null, min_fare_paise: 10000, vehicles: [] };
  assert.equal(couponDiscount(flat, 9900, "bike"), 0);
  assert.equal(couponDiscount(flat, 12000, "cab"), 5000);
  assert.equal(couponDiscount({ ...flat, min_fare_paise: 0 }, 3500, "bike"), 2500);
  const percent = { kind: "percent" as const, value: 20, max_discount_paise: 3000, min_fare_paise: 0, vehicles: ["auto"] };
  assert.equal(couponDiscount(percent, 25000, "auto"), 3000);
  assert.equal(couponDiscount(percent, 10000, "auto"), 2000);
  assert.equal(couponDiscount(percent, 25000, "bike"), 0);
  assert.equal(couponDiscount({ ...percent, max_discount_paise: null }, 12345, "auto"), 2400);
});

test("Google route polylines decode to longitude, latitude pairs", () => {
  const points = decodePolyline("_p~iF~ps|U_ulLnnqC_mqNvxq`@");
  assert.deepEqual(points, [
    [-120.2, 38.5],
    [-120.95, 40.7],
    [-126.453, 43.252],
  ]);
  const many = Array.from({ length: 1000 }, (_, index) => [index, index] as [number, number]);
  const thinned = thin(many, 400);
  assert.ok(thinned.length <= 401);
  assert.deepEqual(thinned[thinned.length - 1], [999, 999]);
});

const banjara = { latitude: 17.4156, longitude: 78.4347 };
const hitech = { latitude: 17.4435, longitude: 78.3772 };

test("fares come from the server rate card with a minimum", () => {
  assert.deepEqual(quote("bike", 1), { farePaise: 3500, etaMin: 4 });
  assert.equal(quote("bike", 10).farePaise, 9500);
  assert.equal(quote("auto", 10).farePaise, 17000);
  assert.equal(quote("cab", 10).farePaise, 22000);
});

test("road distance is the straight line plus a quarter", () => {
  const km = roadKm(banjara, hitech);
  assert.ok(km > 8 && km < 9.5, `unexpected ${km}`);
  assert.equal(roadKm(banjara, banjara), 1);
});

test("peak hours follow India time", () => {
  assert.equal(isPeak(new Date("2026-10-21T03:30:00Z")), true);
  assert.equal(isPeak(new Date("2026-10-21T08:30:00Z")), false);
  assert.equal(peakBonusPaise(new Date("2026-10-21T13:00:00Z")), 1000);
});

test("signed tokens reject tampering and expiry", () => {
  const secret = deriveSecret("base", "ads");
  const token = signToken({ c: "camp", p: 2.5, exp: Date.now() + 1000 }, secret);
  assert.equal(verifyToken<{ c: string; exp: number }>(token, secret)?.c, "camp");
  const [body, sig] = token.split(".");
  const forged = `${Buffer.from(JSON.stringify({ c: "other", p: 0, exp: Date.now() + 1000 })).toString("base64url")}.${sig}`;
  assert.equal(verifyToken(forged, secret), null);
  assert.equal(verifyToken(`${body}.${sig}`, deriveSecret("base", "otp")), null);
  assert.equal(verifyToken(signToken({ exp: Date.now() - 1 }, secret), secret), null);
});

test("OTP hashes bind the app and phone", () => {
  const secret = deriveSecret("base", "otp");
  const stored = hashOtp(secret, "rider", "9876543210", "1234");
  assert.ok(sameHash(stored, hashOtp(secret, "rider", "9876543210", "1234")));
  assert.ok(!sameHash(stored, hashOtp(secret, "captain", "9876543210", "1234")));
  assert.ok(!sameHash(stored, hashOtp(secret, "rider", "9876543211", "1234")));
});

function campaign(overrides: Partial<CampaignCandidate>): CampaignCandidate {
  return {
    id: "a",
    pricing: "cpm",
    bid_paise: 5000,
    impressions: 0,
    clicks: 0,
    daily_budget_paise: 100000,
    total_budget_paise: 1000000,
    spent_paise: 0,
    spent_today_paise: 0,
    spent_day: null,
    starts_at: "2026-01-01T00:00:00Z",
    ends_at: null,
    targeting: { apps: ["rider", "captain"], cities: [], vehicles: [], hours: [], min_trips: 0 },
    ...overrides,
  };
}

const ctx = { app: "captain" as const, city: "Hyderabad", vehicle: "bike", hour: 9, trips: 4, day: "2026-10-21", now: Date.parse("2026-10-21T04:00:00Z") };

test("targeting filters by app, city, vehicle, hour, trips, and budget", () => {
  assert.ok(eligible(campaign({}), ctx));
  assert.ok(!eligible(campaign({ targeting: { apps: ["rider"], cities: [], vehicles: [], hours: [], min_trips: 0 } }), ctx));
  assert.ok(!eligible(campaign({ targeting: { apps: [], cities: ["Khammam"], vehicles: [], hours: [], min_trips: 0 } }), ctx));
  assert.ok(!eligible(campaign({ targeting: { apps: [], cities: [], vehicles: ["cab"], hours: [], min_trips: 0 } }), ctx));
  assert.ok(!eligible(campaign({ targeting: { apps: [], cities: [], vehicles: [], hours: [18, 19], min_trips: 0 } }), ctx));
  assert.ok(!eligible(campaign({ targeting: { apps: [], cities: [], vehicles: [], hours: [], min_trips: 10 } }), ctx));
  assert.ok(!eligible(campaign({ spent_day: "2026-10-21", spent_today_paise: 100000 }), ctx));
  assert.ok(eligible(campaign({ spent_day: "2026-10-20", spent_today_paise: 100000 }), ctx));
  assert.ok(!eligible(campaign({ spent_paise: 1000000 }), ctx));
  assert.ok(!eligible(campaign({ ends_at: "2026-10-01T00:00:00Z" }), ctx));
});

test("CPC bids compete on expected revenue per thousand", () => {
  const cpc = campaign({ id: "b", pricing: "cpc", bid_paise: 300, impressions: 1000, clicks: 30 });
  assert.ok(Math.abs(predictedCtr(cpc) - (30 + 3) / 1200) < 1e-9);
  assert.ok(Math.abs(ecpm(cpc) - 300 * (33 / 1200) * 1000) < 1e-6);
});

test("second-price auction charges just above the runner-up", () => {
  const high = campaign({ id: "high", bid_paise: 8000 });
  const mid = campaign({ id: "mid", bid_paise: 5000 });
  const low = campaign({ id: "low", bid_paise: 1500 });
  const winners = runAuction([low, mid, high], 2, 2000);
  assert.deepEqual(winners.map((w) => w.campaign.id), ["high", "mid"]);
  assert.equal(winners[0].clearingCpm, 5001);
  assert.equal(winners[0].pricePerImpression, 5.001);
  assert.equal(winners[1].clearingCpm, 2001);
  assert.equal(runAuction([low], 1, 2000).length, 0);
});

test("a CPC winner never pays more than its bid per click", () => {
  const cpc = campaign({ id: "cpc", pricing: "cpc", bid_paise: 400 });
  const cpm = campaign({ id: "cpm", bid_paise: 3000 });
  const [winner] = runAuction([cpc, cpm], 1, 2000);
  assert.equal(winner.campaign.id, "cpc");
  assert.equal(winner.pricePerImpression, 0);
  assert.ok(winner.pricePerClick > 0 && winner.pricePerClick <= 400);
});
