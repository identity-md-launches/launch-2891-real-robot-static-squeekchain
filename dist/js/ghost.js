// Replays one of Squeektoshi's recorded runs. The ghost's magnet reaches the sensor
// exactly at each recorded passage time, the moment the device would see it; between
// passages the wheel turns once.
import { SENSOR_ANGLE, TAU, ZONE } from "./wheel.js";

const AT = SENSOR_ANGLE - ZONE; // the edge of the sensor's zone, where a passage registers

const LONG_GAP_MS = 2500; // longer pauses: he slows, rests, then sets off again

// Every recorded time the replay knows, in race milliseconds, oldest first.
export function timeline(race) {
  const out = [];
  if (race.lead !== null && race.lead !== undefined) out.push(race.lead);
  out.push(...race.t);
  if (race.tail !== null && race.tail !== undefined) out.push(race.tail);
  return out;
}

function lastAtOrBefore(ts, tMs) {
  let lo = 0;
  let hi = ts.length - 1;
  if (tMs < ts[0]) return -1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (ts[mid] <= tMs) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

// The share of a turn completed by time `into` within a gap of `gap` ms.
function turnShare(into, gap) {
  if (gap <= LONG_GAP_MS) return into / gap;
  const out = 700; // slowing to a stop over 0.3 of a turn
  const back = 900; // the last 0.7 of a turn, at running pace
  if (into <= out) return 0.3 * (1 - (1 - into / out) ** 2);
  if (into >= gap - back) return 0.3 + 0.7 * ((into - (gap - back)) / back);
  return 0.3;
}

// The ghost wheel's angle at race time tMs (it may be negative during the countdown).
export function ghostAngle(race, tMs) {
  const ts = timeline(race);
  const i = lastAtOrBefore(ts, tMs);
  if (i === -1) {
    // before the first known passage: keep the pace of the first gap
    if (ts.length < 2) return AT;
    const gap = ts[1] - ts[0];
    if (race.lead !== null && race.lead !== undefined) return AT + (TAU * (tMs - ts[0])) / gap;
    // his very first passage on record: wait 0.2 turn back, then roll in at that pace
    return AT - TAU * Math.min(0.2, (ts[0] - tMs) / gap);
  }
  if (i === ts.length - 1) return AT + TAU * i; // after the last known passage: at rest
  const gap = ts[i + 1] - ts[i];
  return AT + TAU * (i + turnShare(tMs - ts[i], gap));
}

// His passages inside the race so far.
export function ghostCount(race, tMs) {
  let n = 0;
  for (const t of race.t) {
    if (t <= tMs && t < race.raceMs) n += 1;
    else if (t > tMs) break;
  }
  return n;
}

// His real Squeek blocks completed so far, as SqueekCore records them.
export function ghostBlocks(race, tMs) {
  return race.blocks.filter((b) => b.at <= tMs && b.at < race.raceMs);
}
