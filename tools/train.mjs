// Train the model that plays against you, and measure it on clips it never saw.
// Offline, run once by the builder. Node 20+, no packages.
//
// Usage: node tools/train.mjs <train-windows.json> data/model.json
//   train-windows.json comes from tools/build_clips.mjs: real 8-second windows from the
//   nights of 26-28 Oct (training) and 29-30 Oct (held out; the game's clips come from these nights).
import { readFileSync, writeFileSync } from "node:fs";
import { rng } from "../js/rng.js";
import { fake, KINDS } from "../js/fakes.js";
import { features } from "../js/features.js";
import { train, vector, robotProbability } from "../js/model.js";

const [, , windowsPath, outPath] = process.argv;
const w = JSON.parse(readFileSync(windowsPath));
const kinds = Object.keys(KINDS);

function dataset(reals, seed, perKind) {
  const r = rng(seed);
  const clips = reals.map((t) => ({ real: true, kind: "real", t }));
  for (const kind of kinds) {
    for (let i = 0; i < perKind; i++) clips.push(fake(kind, r, { t: r.pick(reals) }));
  }
  return clips;
}

const trainSet = dataset(w.train, 1, Math.round(w.train.length / kinds.length));
const model = train(trainSet.map((c) => vector(features(c.t))), trainSet.map((c) => (c.real ? 0 : 1)));

const test = dataset(w.heldOut, 2, Math.round(w.heldOut.length / kinds.length));
const byKind = {};
for (const c of test) {
  const right = (robotProbability(model, c.t) >= 0.5) === !c.real;
  const k = (byKind[c.kind] ??= { n: 0, right: 0 });
  k.n += 1;
  k.right += right ? 1 : 0;
}
const total = Object.values(byKind).reduce((s, k) => ({ n: s.n + k.n, right: s.right + k.right }), { n: 0, right: 0 });
// A round is about half real clips, so also report the accuracy on a balanced mix.
const realAcc = byKind.real.right / byKind.real.n;
const fakeAcc = kinds.reduce((s, k) => s + byKind[k].right / byKind[k].n, 0) / kinds.length;
model.heldOut = {
  clips: total.n,
  accuracy: Math.round((1000 * total.right) / total.n) / 1000,
  balancedAccuracy: Math.round(500 * (realAcc + fakeAcc)) / 1000,
  byKind: Object.fromEntries(Object.entries(byKind).map(([k, v]) => [k, Math.round((1000 * v.right) / v.n) / 1000])),
};
// Each fake's figure rests on one draw of 120 fakes, so measure how far it moves: the same
// held-out stretches against 40 more draws of fakes.
const ranges = {};
const balancedRange = [];
for (let seed = 3; seed < 43; seed++) {
  const right = {};
  for (const c of dataset(w.heldOut, seed, Math.round(w.heldOut.length / kinds.length))) {
    if (c.real) continue;
    const k = (right[c.kind] ??= { n: 0, right: 0 });
    k.n += 1;
    k.right += robotProbability(model, c.t) >= 0.5 ? 1 : 0;
  }
  const acc = Object.fromEntries(kinds.map((k) => [k, right[k].right / right[k].n]));
  balancedRange.push((realAcc + kinds.reduce((s, k) => s + acc[k], 0) / kinds.length) / 2);
  for (const k of kinds) (ranges[k] ??= []).push(acc[k]);
}
const span = (a) => [Math.round(1000 * Math.min(...a)) / 1000, Math.round(1000 * Math.max(...a)) / 1000];
model.heldOut.otherDraws = {
  draws: 40,
  balancedAccuracy: span(balancedRange),
  byKind: Object.fromEntries(kinds.map((k) => [k, span(ranges[k])])),
};
model.trainedOn = { realClips: w.train.length, fakeClips: trainSet.length - w.train.length, nights: "26-28 Oct 2026" };
writeFileSync(outPath, JSON.stringify(model, null, 1));
console.error(JSON.stringify(model.heldOut));
