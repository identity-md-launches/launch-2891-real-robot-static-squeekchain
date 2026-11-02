// A wheel with weight. Your strokes push it, it coasts, and friction slows it.
// Because it is heavy, rocking it back and forth across the sensor is slow,
// just as it is on a real wheel. Angles are in radians, speeds in radians per second.

export const SENSOR_ANGLE = -Math.PI / 2; // the sensor sits at the top of the wheel
export const ZONE = 0.14; // half-width of the arc where the magnet reads as "at the sensor"
export const STEP_MS = 2; // physics and sensor sampling step
export const MAX_OMEGA = 26; // about 250 rpm
const PUSH_TAU = 0.05; // how fast a faster hand brings the wheel up to its speed
const REVERSE_TAU = 0.55; // a hand moving the other way slows a heavy wheel only gradually
const DRAG_TAU = 3.0; // coasting loses speed slowly
const FRICTION = 0.8; // rad/s², so a coasting wheel comes to rest

export const TAU = Math.PI * 2;

export function wrap(a) {
  a = (a + Math.PI) % TAU;
  if (a < 0) a += TAU;
  return a - Math.PI;
}

export function createWheel(angle = SENSOR_ANGLE + Math.PI) {
  return { angle, omega: 0 };
}

export function inZone(angle) {
  return Math.abs(wrap(angle - SENSOR_ANGLE)) < ZONE;
}

// hand: { omega, engaged }. A hand only adds speed when it moves faster than the wheel
// in the same direction; it cannot stop a turning wheel dead.
export function step(w, dtS, hand) {
  if (hand && hand.engaged && hand.omega !== 0) {
    const same = w.omega === 0 || Math.sign(hand.omega) === Math.sign(w.omega);
    if (same && Math.abs(hand.omega) > Math.abs(w.omega)) {
      w.omega += (hand.omega - w.omega) * (1 - Math.exp(-dtS / PUSH_TAU));
    } else if (!same) {
      w.omega += (hand.omega - w.omega) * (1 - Math.exp(-dtS / REVERSE_TAU));
    }
  }
  w.omega *= Math.exp(-dtS / DRAG_TAU);
  const f = FRICTION * dtS;
  w.omega = Math.abs(w.omega) <= f ? 0 : w.omega - Math.sign(w.omega) * f;
  w.omega = Math.max(-MAX_OMEGA, Math.min(MAX_OMEGA, w.omega));
  w.angle += w.omega * dtS;
}

export function rpm(omega) {
  return (Math.abs(omega) * 60) / TAU;
}

// Turns a stream of pointer positions around the hub into a hand speed.
export function createHand() {
  return { omega: 0, engaged: false, lastAngle: null, lastT: null, lastMoveT: -1e9 };
}

export function pointerMove(h, tMs, x, y, cx, cy, minRadius = 18) {
  const dx = x - cx;
  const dy = y - cy;
  if (dx * dx + dy * dy < minRadius * minRadius) {
    h.lastAngle = null; // too close to the hub to read a direction
    return;
  }
  const a = Math.atan2(dy, dx);
  if (h.lastAngle !== null && h.lastT !== null && tMs > h.lastT) {
    const dt = (tMs - h.lastT) / 1000;
    const inst = wrap(a - h.lastAngle) / dt;
    const k = 1 - Math.exp(-dt / 0.06);
    h.omega += (Math.max(-MAX_OMEGA, Math.min(MAX_OMEGA, inst)) - h.omega) * k;
    h.lastMoveT = tMs;
  }
  h.lastAngle = a;
  h.lastT = tMs;
}

export function pointerLeave(h) {
  h.lastAngle = null;
  h.lastT = null;
}

// Keyboard: alternate two keys like pedals. Each stroke is worth 0.35 of a turn,
// so about five alternations a second hold 100 rpm, his sprint pace.
export const STROKE_TURN = 0.35;
export function createPedals() {
  return { last: null, strokes: [] };
}

export function pedal(p, tMs, key) {
  if (key === p.last) return false; // the same key twice is not a stroke
  p.last = key;
  p.strokes.push(tMs);
  return true;
}

// Update the hand from pointer recency and pedal cadence. Call once per frame.
export function handNow(h, p, tMs) {
  const pointerLive = tMs - h.lastMoveT < 110;
  p.strokes = p.strokes.filter((t) => tMs - t < 1000);
  const recent = p.strokes.length && tMs - p.strokes[p.strokes.length - 1] < 260;
  if (recent) {
    const cadence = p.strokes.length; // strokes in the last second
    return { omega: cadence * STROKE_TURN * TAU, engaged: true };
  }
  if (pointerLive) return { omega: h.omega, engaged: true };
  h.omega *= 0.5;
  return { omega: 0, engaged: false };
}
