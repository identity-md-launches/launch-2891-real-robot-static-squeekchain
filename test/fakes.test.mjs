import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fake, KINDS, CLIP_MS } from "../js/fakes.js";
import { features, gaps, mean } from "../js/features.js";
import { rng } from "../js/rng.js";
import { RECORD } from "../js/quiz.js";

const pool = JSON.parse(readFileSync(new URL("../data/clips.json", import.meta.url))).clips;
const many = (kind, n = 200, seed = 5) => {
  const r = rng(seed);
  return Array.from({ length: n }, () => {
    const real = r.pick(pool);
    return { real, f: fake(kind, r, real) };
  });
};

test("every fake is a valid 8-second clip that starts on a passage", () => {
  for (const kind of Object.keys(KINDS)) {
    for (const { f } of many(kind, 100)) {
      assert.equal(f.t[0], 0);
      assert.ok(f.t.length >= 7, `${kind}: ${f.t.length} passages`);
      assert.ok(f.t.every((x, i) => x < CLIP_MS && (i === 0 || x > f.t[i - 1])), kind);
      assert.equal(f.real, false);
      assert.equal(f.provenance, KINDS[kind].provenance);
    }
  }
});

test("fakes borrow the pace of a real clip", () => {
  for (const kind of ["motor", "hand", "smooth"]) {
    for (const { real, f } of many(kind, 100)) {
      const ratio = mean(gaps(f.t)) / mean(gaps(real.t));
      assert.ok(ratio > 0.93 && ratio < 1.07, `${kind}: ${ratio}`);
    }
  }
});

test("a motor is steadier than his steadiest stretch on record", () => {
  for (const { f } of many("motor", 3000)) assert.ok(features(f.t).sd < RECORD.steadiestSdMs, String(features(f.t).sd));
});

test("a replay loop repeats exactly", () => {
  for (const { f } of many("loop")) assert.equal(features(f.t).repeat.share, 1);
});

test("a clip rebuilt from counts is mostly flat runs", () => {
  for (const { f } of many("steps")) assert.ok(features(f.t).flat > RECORD.flatShareMax);
});

test("a hand zig-zags on average and a smooth simulation is smooth", () => {
  const hand = many("hand").map(({ f }) => features(f.t).lag1);
  assert.ok(mean(hand) < -0.3, String(mean(hand)));
  const smooth = many("smooth").map(({ f }) => features(f.t)).map((x) => x.jag / x.cv);
  assert.ok(mean(smooth) < 0.5, String(mean(smooth)));
});

test("fakes are reproducible from a seed", () => {
  const a = fake("hand", rng(42), pool[3]).t;
  const b = fake("hand", rng(42), pool[3]).t;
  assert.deepEqual(a, b);
});
