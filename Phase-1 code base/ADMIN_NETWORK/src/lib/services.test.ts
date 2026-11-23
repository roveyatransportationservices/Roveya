import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { serviceOfCaptain } from "./services.ts";

test("a stored seats captain belongs to carpool, and a taxi bike stays a bike", () => {
  assert.equal(serviceOfCaptain({ service: "seats", vehicle: "cab" }), "carpool");
  assert.equal(serviceOfCaptain({ service: "taxi", vehicle: "bike" }), "bike");
  assert.equal(serviceOfCaptain({ service: "taxi", vehicle: "auto" }), "auto");
  assert.equal(serviceOfCaptain({ service: "taxi", vehicle: "cab" }), "taxi");
});

test("carpool registration stores the seats value the desk already queries", () => {
  const source = readFileSync(new URL("./server/seatsPhone.ts", import.meta.url), "utf8");
  assert.match(source, /service: "seats"/);
  assert.doesNotMatch(source, /service: "carpool"/);
});
