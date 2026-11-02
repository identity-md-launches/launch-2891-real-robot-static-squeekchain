import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { robotProbability, modelCall, train, vector } from "../js/model.js";
import { fake, KINDS } from "../js/fakes.js";
import { features } from "../js/features.js";
import { rng } from "../js/rng.js";

const read = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url)));
const model = read("../data/model.json");
const windows = read("../data/train-windows.json");
const pool = read("../data/clips.json").clips;
const kinds = Object.keys(KINDS);

// Accuracy on real clips and on an equal number of fakes of each kind, weighted half and half.
function balanced(reals, seed, perKind) {
  const r = rng(seed);
  const realAcc = reals.filter((t) => robotProbability(model, t) < 0.5).length / reals.length;
  const byKind = {};
  for (const kind of kinds) {
    let right = 0;
    for (let i = 0; i < perKind; i++) right += robotProbability(model, fake(kind, r, { t: r.pick(reals) }).t) >= 0.5 ? 1 : 0;
    byKind[kind] = right / perKind;
  }
  const fakeAcc = kinds.reduce((s, k) => s + byKind[k], 0) / kinds.length;
  return { all: (realAcc + fakeAcc) / 2, realAcc, byKind };
}

test("accuracy floor: at least 80% on held-out clips from nights it never trained on", () => {
  const a = balanced(windows.heldOut, 7, 120);
  assert.ok(a.all >= 0.8, JSON.stringify(a));
});

test("accuracy floor on the game's own 80 real clips and fresh fakes", () => {
  const a = balanced(pool.map((c) => c.t), 8, 80);
  assert.ok(a.all >= 0.8, JSON.stringify(a));
  assert.ok(a.realAcc >= 0.85, JSON.stringify(a));
});

test("the model is beatable where the page says: it misses some loops", () => {
  const a = balanced(windows.heldOut, 9, 200);
  assert.ok(a.byKind.loop < 0.8, JSON.stringify(a.byKind));
  assert.equal(a.byKind.motor, 1);
});

test("the shipped weights are exactly what tools/train.mjs produces", () => {
  // Same data, same seeds, same steps as tools/train.mjs.
  const r = rng(1);
  const per = Math.round(windows.train.length / kinds.length);
  const clips = windows.train.map((t) => ({ real: true, t }));
  for (const kind of kinds) for (let i = 0; i < per; i++) clips.push(fake(kind, r, { t: r.pick(windows.train) }));
  const m = train(clips.map((c) => vector(features(c.t))), clips.map((c) => (c.real ? 0 : 1)));
  m.weights.forEach((w, i) => assert.ok(Math.abs(w - model.weights[i]) < 1e-9, `weight ${i}`));
  assert.ok(Math.abs(m.bias - model.bias) < 1e-9);
});

test("modelCall gives a call and a confidence between 50 and 100", () => {
  for (const c of pool.slice(0, 20)) {
    const call = modelCall(model, c.t);
    assert.equal(typeof call.robot, "boolean");
    assert.ok(call.sure >= 50 && call.sure <= 100);
  }
});
