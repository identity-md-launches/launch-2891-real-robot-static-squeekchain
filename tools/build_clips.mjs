// Cut Squeektoshi's recorded runs into 8-second clips for Real or Robot?.
// Offline, run once by the builder. Node 20+, no packages.
//
// Source: GET https://api.squeekchain.com/v1/measurement/runs, saved as JSON pages
// ({ items: [segments] }). In the API's words this is "evidence signed by the device's
// key, not work certified by SqueekCore". Times keep their microseconds.
//
// Usage: node tools/build_clips.mjs <runs.json> data/clips.json data/train-windows.json
import { readFileSync, writeFileSync } from "node:fs";
import { features } from "../js/features.js";

export const CLIP_MS = 8000;
const MAX_GAP_MS = 2500; // a clip is one unbroken stretch of running
const MIN_PASSAGES = 8;

// Every passage time, in milliseconds with microseconds kept. Only his device's own record goes
// in: a segment that is not "hardware" or not measurement-eligible, or whose times do not
// strictly increase, stops the build.
export function passageTimes(runs) {
  const segs = [...runs.items].sort((a, b) => (a.startAt < b.startAt ? -1 : 1));
  const out = [];
  for (const s of segs) {
    if (s.provenance !== "hardware") throw new Error(`segment ${s.startAt} is "${s.provenance}", not "hardware"`);
    if (s.measurementEligible !== true) throw new Error(`segment ${s.startAt} is not measurement-eligible`);
    for (const p of s.passages) {
      const ms = Date.parse(`${p.at.slice(0, 23)}Z`);
      const micro = Number((p.at.slice(23).replace("Z", "") + "000").slice(0, 3));
      const t = ms + micro / 1000;
      if (out.length && t <= out[out.length - 1]) throw new Error(`passage times do not increase at ${p.at}`);
      out.push(t);
    }
  }
  return out;
}

export const nightOf = (ms) => new Date(ms - 12 * 3600e3).toISOString().slice(0, 10);

// Non-overlapping 8-second windows that start on a passage and contain no long pause.
export function windows(times) {
  const out = [];
  let i = 0;
  while (i < times.length) {
    let j = i;
    while (j < times.length && times[j] < times[i] + CLIP_MS) j++;
    let maxGap = 0;
    for (let k = i; k < j - 1; k++) maxGap = Math.max(maxGap, times[k + 1] - times[k]);
    if (j - i >= MIN_PASSAGES && maxGap <= MAX_GAP_MS) {
      out.push({
        startAt: new Date(times[i]).toISOString(),
        night: nightOf(times[i]),
        t: times.slice(i, j).map((x) => Math.round((x - times[i]) * 10) / 10),
      });
      i = j;
    } else {
      i += 1;
    }
  }
  return out;
}

// His record, for the reveals: every 8-second stretch that starts on any passage and follows the
// same rules as the clips. These overlap, so no steadier or loopier stretch can hide between
// the non-overlapping windows above.
export function* everyStretch(times) {
  let j = 0;
  for (let i = 0; i < times.length; i++) {
    if (j < i) j = i;
    while (j < times.length && times[j] < times[i] + CLIP_MS) j++;
    if (j - i < MIN_PASSAGES) continue;
    let maxGap = 0;
    for (let k = i; k < j - 1; k++) maxGap = Math.max(maxGap, times[k + 1] - times[k]);
    if (maxGap <= MAX_GAP_MS) yield { startAt: times[i], t: times.slice(i, j).map((x) => Math.round((x - times[i]) * 10) / 10) };
  }
}

export function record(times) {
  let stretches = 0;
  let drift = 0;
  let steadiest = null;
  let repeatMax = 0;
  let flatMax = 0;
  for (const w of everyStretch(times)) {
    const f = features(w.t);
    stretches += 1;
    if (f.lag1 > 0) drift += 1;
    if (!steadiest || f.sd < steadiest.sd) steadiest = { sd: f.sd, startAt: new Date(w.startAt).toISOString() };
    repeatMax = Math.max(repeatMax, f.repeat.share);
    flatMax = Math.max(flatMax, f.flat);
  }
  return {
    stretches,
    steadiestSdMs: Math.round(steadiest.sd * 1000) / 1000,
    steadiestAt: steadiest.startAt,
    repeatShareMax: Math.round(repeatMax * 1000) / 1000,
    flatShareMax: Math.round(flatMax * 1000) / 1000,
    driftShare: Math.round((drift / stretches) * 1000) / 1000,
  };
}

// Spread picks evenly over a list, so the pool covers every pace and hour.
export function spread(list, n) {
  if (list.length <= n) return list;
  const out = [];
  for (let k = 0; k < n; k++) out.push(list[Math.floor((k * list.length) / n)]);
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [, , runsPath, poolPath, trainPath] = process.argv;
  const runs = JSON.parse(readFileSync(runsPath));
  const times = passageTimes(runs);
  const all = windows(times);
  // Nights 26-28 Oct train the model; nights 29-30 Oct are held out and feed the game.
  const train = all.filter((w) => w.night <= "2026-10-28");
  const held = all.filter((w) => w.night >= "2026-10-29");
  const byPace = [...held].sort((a, b) => a.t.length - b.t.length || (a.startAt < b.startAt ? -1 : 1));
  const pool = spread(byPace, 80).map((w, k) => ({ id: `r${k}`, ...w }));
  const heldTest = held.filter((w) => !pool.some((p) => p.startAt === w.startAt));
  writeFileSync(poolPath, JSON.stringify({
    schema: "real-or-robot-clips.v1",
    source: "https://api.squeekchain.com/v1/measurement/runs",
    runsFetchedAt: runs.fetchedAt ?? null,
    authority: runs.meta?.authority ?? null,
    certifiedCoreWork: runs.meta?.certifiedCoreWork ?? null,
    clipMs: CLIP_MS,
    record: record(times),
    clips: pool,
  }));
  writeFileSync(trainPath, JSON.stringify({ train: train.map((w) => w.t), heldOut: spread(heldTest, 600).map((w) => w.t) }));
  console.error(`windows ${all.length}: train ${train.length}, held out ${held.length}, pool ${pool.length}`);
  console.error(`record over every start passage: ${JSON.stringify(record(times))}`);
}
