// The fakes. Two are physical: a motor or a person turning a real wheel. The sensor
// would count both, and their readings would still say "hardware", because "The sensor
// counts passages; it cannot tell why the wheel moved." Three are data fakes, matching
// the other provenance values the Squeekchain API documents: simulated, replay and derived.
import { gaps, mean } from "./features.js";

export const CLIP_MS = 8000;

export const KINDS = {
  motor: { name: "A steady motor", provenance: "hardware", physical: true },
  hand: { name: "A person turning the wheel by hand", provenance: "hardware", physical: true },
  smooth: { name: "A smooth simulation", provenance: "simulated", physical: false },
  loop: { name: "A replay loop", provenance: "replay", physical: false },
  steps: { name: "Rebuilt from counts", provenance: "derived", physical: false },
};

// Each fake borrows the pace of one of his real clips, so speed alone gives nothing away.
const pace = (real) => mean(gaps(real.t));

function fromGaps(gapList) {
  const t = [0];
  let k = 0;
  while (true) {
    const next = t[t.length - 1] + gapList(k++);
    if (next >= CLIP_MS) break;
    t.push(Math.round(next * 10) / 10);
  }
  return t;
}

const make = {
  // Every gap the same, give or take a millisecond.
  motor(r, real) {
    const m = pace(real);
    return fromGaps(() => m + 1.0 * r.normal());
  },
  // Made to tap like a person: a steady inner beat plus a hand delay that each gap
  // corrects, so a long gap tends to be followed by a short one.
  hand(r, real) {
    const m = pace(real);
    let prev = 18 * r.normal();
    return fromGaps(() => {
      const cur = 18 * r.normal();
      const g = m + 6 * r.normal() + cur - prev;
      prev = cur;
      return g;
    });
  },
  // Speed rises and falls like a wave, with no small stumbles.
  smooth(r, real) {
    const m = pace(real);
    const amp = r.range(0.035, 0.07);
    const period = r.range(7000, 12000);
    const phase = r.range(0, 2 * Math.PI);
    const t = [0];
    while (true) {
      const now = t[t.length - 1];
      const next = now + m * (1 + amp * Math.sin((2 * Math.PI * now) / period + phase));
      if (next >= CLIP_MS) break;
      t.push(Math.round(next * 10) / 10);
    }
    return t;
  },
  // Three or four gaps of a real run, played again and again. The stretch is one without a
  // long pause, so the loop holds as many passages as a real clip does.
  loop(r, real) {
    const g = gaps(real.t);
    const L = 3 + r.int(2);
    const starts = [];
    for (let s = 0; s + L <= g.length; s++) if (mean(g.slice(s, s + L)) <= 1100) starts.push(s);
    const start = starts.length ? r.pick(starts) : 0;
    const cycle = g.slice(start, start + L);
    return fromGaps((k) => cycle[k % cycle.length]);
  },
  // A real run's passage count per 4-second half, spread evenly inside each half.
  steps(r, real) {
    const half = CLIP_MS / 2;
    const n1 = real.t.filter((x) => x < half).length;
    const n2 = real.t.filter((x) => x >= half).length;
    const t = [];
    for (let i = 0; i < n1; i++) t.push((i * half) / n1);
    // Shift the second half so the gap across the boundary is the mean of the two step sizes.
    const shift = (half / Math.max(1, n2) - half / n1) / 2;
    for (let i = 0; i < n2; i++) t.push(half + shift + (i * half) / n2);
    return t.filter((x) => x < CLIP_MS).map((x) => Math.round(x * 10) / 10);
  },
};

export function fake(kind, r, real) {
  return { real: false, kind, ...KINDS[kind], t: make[kind](r, real) };
}
