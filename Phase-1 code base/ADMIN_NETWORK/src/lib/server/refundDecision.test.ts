import assert from "node:assert/strict";
import test from "node:test";
import { gatewayRefundDecision, refundEventDecision } from "./refundDecision.ts";

test("a second processed gateway refund is not sent again", () => {
  assert.equal(gatewayRefundDecision({ status: "processed", amountPaise: 59322, refundId: "rf_1" }, 59322), "skip");
  assert.equal(gatewayRefundDecision({ status: "processing", amountPaise: 59322, refundId: "rf_1" }, 59322), "skip");
  assert.equal(gatewayRefundDecision({ status: "pending", amountPaise: 59322, refundId: "rf_1" }, 59322), "skip");
});

test("a timeout with no gateway refund id can be retried, and a repeat webhook is ignored", () => {
  assert.equal(gatewayRefundDecision({ status: "pending", amountPaise: 59322 }, 59322), "send");
  assert.equal(gatewayRefundDecision({ status: "failed", amountPaise: 59322 }, 59322), "send");
  assert.equal(gatewayRefundDecision(null, 0), "none");
  assert.equal(refundEventDecision("processed", "processed"), "skip");
  assert.equal(refundEventDecision("processing", "processed"), "apply");
});
