// Rhythm features of a clip: the gaps between passages, in milliseconds.
export function gaps(t) {
  const g = [];
  for (let i = 1; i < t.length; i++) g.push(t[i] - t[i - 1]);
  return g;
}

export function mean(a) {
  return a.reduce((x, y) => x + y, 0) / a.length;
}

export function sd(a) {
  const m = mean(a);
  return Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / a.length);
}

// How much the gaps vary, relative to their size.
export function cv(g) {
  return sd(g) / mean(g);
}

// Do neighbouring gaps move together (drift, positive) or zig-zag (negative)?
export function lag1(g) {
  const m = mean(g);
  let num = 0;
  let den = 0;
  for (let i = 0; i < g.length; i++) {
    den += (g[i] - m) ** 2;
    if (i > 0) num += (g[i] - m) * (g[i - 1] - m);
  }
  return den === 0 ? 0 : num / den;
}

// How jagged the rhythm is: the mean size of second differences, relative to the gap size.
export function jag(g) {
  if (g.length < 3) return 0;
  let s = 0;
  for (let i = 2; i < g.length; i++) s += Math.abs(g[i] - 2 * g[i - 1] + g[i - 2]);
  return s / (g.length - 2) / mean(g);
}

// Two gaps match when they agree to within a tenth of a millisecond, the resolution of the
// times here. They are compared as whole tenths, so no floating-point edge decides it.
export function sameGap(a, b) {
  return Math.abs(Math.round(a * 10) - Math.round(b * 10)) <= 1;
}

// The largest share of gaps that exactly repeat the gap `lag` places earlier (a loop).
// Every lag is checked against at least three gaps, so a chance match can't pass for a loop.
export function repeats(g) {
  let best = { share: 0, lag: 0 };
  for (let lag = 2; lag <= g.length - 3; lag++) {
    let same = 0;
    for (let i = lag; i < g.length; i++) if (sameGap(g[i], g[i - lag])) same += 1;
    const share = same / (g.length - lag);
    if (share > best.share) best = { share, lag };
  }
  return best;
}

// The share of neighbouring gaps that are exactly equal (flat steps).
export function flat(g) {
  let same = 0;
  for (let i = 1; i < g.length; i++) if (sameGap(g[i], g[i - 1])) same += 1;
  return g.length > 1 ? same / (g.length - 1) : 0;
}

export function features(t) {
  const g = gaps(t);
  return {
    n: t.length,
    mean: mean(g),
    sd: sd(g),
    min: Math.min(...g),
    max: Math.max(...g),
    cv: cv(g),
    lag1: lag1(g),
    jag: jag(g),
    repeat: repeats(g),
    flat: flat(g),
  };
}
