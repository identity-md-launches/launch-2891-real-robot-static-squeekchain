import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { makeRound, judge, tell, provenanceLine, scoreCard, shareLine, when, RECORD, FAKE_KINDS } from "../js/quiz.js";
import { features } from "../js/features.js";

const read = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url)));
const model = read("../data/model.json");
const clipsFile = read("../data/clips.json");
const pool = clipsFile.clips;
const windows = read("../data/train-windows.json");

test("a short round is 2 real clips and 2 fakes of different kinds", () => {
  for (let seed = 1; seed <= 200; seed++) {
    const round = makeRound(seed, 4, pool);
    assert.equal(round.length, 4);
    assert.equal(round.filter((c) => c.real).length, 2);
    const fakes = round.filter((c) => !c.real).map((c) => c.kind);
    assert.notEqual(fakes[0], fakes[1]);
  }
});

test("a long round is 4 to 6 real clips, at least 3 kinds of fake, at most 2 of each", () => {
  for (let seed = 1; seed <= 200; seed++) {
    const round = makeRound(seed, 10, pool);
    assert.equal(round.length, 10);
    const real = round.filter((c) => c.real).length;
    assert.ok(real >= 4 && real <= 6);
    const kinds = round.filter((c) => !c.real).map((c) => c.kind);
    assert.ok(new Set(kinds).size >= 3);
    for (const k of FAKE_KINDS) assert.ok(kinds.filter((x) => x === k).length <= 2);
    assert.equal(new Set(round.filter((c) => c.real).map((c) => c.id)).size, real);
  }
});

test("the same seed gives the same round", () => {
  assert.deepEqual(makeRound(42, 10, pool), makeRound(42, 10, pool));
});

test("judging and the score", () => {
  const real = { real: true, kind: "real", t: pool[0].t };
  assert.equal(judge(model, real, false).youRight, true);
  assert.equal(judge(model, real, true).youRight, false);
  const card = scoreCard([{ youRight: true, modelRight: true }, { youRight: true, modelRight: false }, { youRight: false, modelRight: true }]);
  assert.equal(card.line, "You 2/3, model 2/3");
  assert.equal(card.verdict, "A draw with the model.");
  assert.equal(scoreCard([{ youRight: true, modelRight: false }]).verdict, "You beat the model.");
});

test("every reveal sentence is filled in from the clip", () => {
  for (let seed = 1; seed <= 100; seed++) {
    for (const c of makeRound(seed, 10, pool)) {
      for (const s of [tell(c), provenanceLine(c)]) {
        assert.ok(s.length > 40, s);
        assert.ok(!/undefined|NaN|Infinity/.test(s), s);
      }
    }
  }
});

test("the reveals quote his record, measured over every start passage", () => {
  // tools/build_clips.mjs measures the record from the raw runs; the sentences must say the same.
  assert.deepEqual(
    { ...RECORD },
    {
      stretches: clipsFile.record.stretches,
      steadiestSdMs: clipsFile.record.steadiestSdMs,
      driftShare: clipsFile.record.driftShare,
      flatShareMax: clipsFile.record.flatShareMax,
      repeatShareMax: clipsFile.record.repeatShareMax,
    },
  );
  assert.ok(RECORD.flatShareMax <= 0.25, "a quarter");
  assert.equal(Math.round(RECORD.driftShare * 4), 3, "3 of every 4");
  assert.ok(RECORD.repeatShareMax < 1, "his record never loops");
});

test("the record holds for every stretch shipped here", () => {
  // Each training, held-out and game stretch is one of the record's stretches, so none may beat it.
  const real = [...windows.train, ...windows.heldOut, ...pool.map((c) => c.t)].map(features);
  assert.ok(Math.min(...real.map((f) => f.sd)) >= RECORD.steadiestSdMs);
  assert.ok(real.every((f) => f.repeat.share <= RECORD.repeatShareMax), "no real stretch loops");
  assert.ok(real.every((f) => f.flat <= RECORD.flatShareMax));
  const drift = real.filter((f) => f.lag1 > 0).length / real.length;
  assert.ok(Math.abs(drift - RECORD.driftShare) < 0.03, String(drift));
  // "the pattern never comes round again exactly": no game clip comes close to a loop.
  for (const c of pool) assert.ok(features(c.t).repeat.share <= 0.25, c.id);
});

test("hand reveals follow the clip's own correlation and never print -0.00", () => {
  const seen = { zig: 0, faint: 0, drift: 0 };
  for (let seed = 1; seed <= 3000; seed++) {
    for (const c of makeRound(seed, seed % 2 ? 10 : 4, pool)) {
      if (c.kind !== "hand") continue;
      const r = features(c.t).lag1;
      const s = tell(c);
      assert.ok(!s.includes("-0.00"), s);
      if (r < -0.1) {
        assert.match(s, /^It zig-zags/, s);
        seen.zig += 1;
      } else if (r <= 0.1) {
        assert.match(s, /barely correlate/, s);
        seen.faint += 1;
      } else {
        assert.match(s, /happened to drift the way he does/, s);
        seen.drift += 1;
      }
    }
  }
  assert.ok(seen.zig && seen.faint && seen.drift, JSON.stringify(seen));
});

test("smooth and rebuilt clips are described in their own numbers", () => {
  let single = 0;
  for (let seed = 1; seed <= 2000; seed++) {
    for (const c of makeRound(seed, 10, pool)) {
      const s = tell(c);
      if (c.kind === "smooth") assert.match(s, /^Too smooth: the gaps glide between \d+ ms and \d+ ms/, s);
      if (c.kind !== "steps" || s.startsWith("Every gap is exactly")) continue;
      const run = "(\\d+ gaps of exactly \\d+ ms|a single \\d+ ms gap)";
      assert.match(s, new RegExp(`^Flat steps: ${run}, then ${run}\\.`), s);
      if (s.includes("a single")) single += 1;
    }
  }
  assert.ok(single > 0, "some halves hold a single gap");
});

test("the copied result speaks for the player and names the mix", () => {
  const url = "https://example.org/";
  const card = (you, model) => scoreCard([
    { youRight: you >= 1, modelRight: model >= 1 },
    { youRight: you >= 2, modelRight: model >= 2 },
  ]);
  assert.equal(
    shareLine(card(2, 1), url),
    "Real or Robot?: I called 2 of 2 clips right (Squeektoshi's recorded runs mixed with fakes). The small trained model called 1 of 2. I beat the model. https://example.org/",
  );
  assert.match(shareLine(card(1, 2), url), /The model beat me\./);
  assert.match(shareLine(card(1, 1), url), /A draw with the model\./);
  for (const s of [shareLine(card(2, 1), url), shareLine(card(0, 2), url)]) {
    assert.doesNotMatch(s, /real runs/);
    assert.doesNotMatch(s, /\bYou\b/);
  }
});

test("times are shown in UTC", () => {
  assert.equal(when("2026-10-29T21:22:31.478Z"), "29 Oct, 21:22 UTC");
});
