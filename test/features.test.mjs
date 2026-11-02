import { test } from "node:test";
import assert from "node:assert/strict";
import { gaps, mean, sd, cv, lag1, jag, repeats, flat, features } from "../js/features.js";

test("gaps, mean and spread of a clip", () => {
  assert.deepEqual(gaps([0, 800, 1700, 2500]), [800, 900, 800]);
  assert.equal(mean([800, 900, 800]), 2500 / 3);
  assert.ok(Math.abs(sd([800, 900]) - 50) < 1e-9);
  assert.ok(Math.abs(cv([800, 900]) - 50 / 850) < 1e-9);
});

test("lag1 is negative for a zig-zag and positive for a drift", () => {
  assert.ok(lag1([800, 900, 800, 900, 800, 900, 800, 900]) < -0.8);
  assert.ok(lag1([800, 810, 820, 830, 840, 850, 860, 870]) > 0.5);
  assert.equal(lag1([850, 850, 850]), 0);
});

test("jag is zero for a straight ramp and large for a zig-zag", () => {
  assert.ok(jag([800, 810, 820, 830, 840]) < 1e-12);
  assert.ok(jag([800, 900, 800, 900, 800]) > 0.2);
});

test("repeats finds a loop and its length", () => {
  const loop = [810, 870, 845, 810, 870, 845, 810, 870, 845];
  assert.deepEqual(repeats(loop), { share: 1, lag: 3 });
  assert.ok(repeats([812, 861, 843, 899, 830, 874, 851, 822, 905]).share < 0.5);
});

test("flat counts neighbouring gaps that are exactly equal", () => {
  assert.equal(flat([800, 800, 800, 1000, 1000]), 0.75);
  assert.equal(flat([800, 801, 802]), 0);
});

test("features of a real clip are finite", () => {
  const f = features([0, 902.2, 1764.1, 2662.8, 3580.2, 4449.3, 6252.2, 7123]);
  for (const v of [f.mean, f.sd, f.cv, f.lag1, f.jag, f.repeat.share, f.flat]) assert.ok(Number.isFinite(v));
  assert.equal(f.n, 8);
  assert.equal(f.max, 6252.2 - 4449.3);
});
