// A click for every passage in a clip. The clicks are scheduled on the audio clock, so the
// rhythm you hear is the clip's exact rhythm, not the screen's frame rate. Off until a tap
// starts it, as browsers require. Adapted from Ghost Wheel's audio module.
let ctx = null;
let on = true;
let bus = null;

export function unlock() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
  }
  if (ctx.state === "suspended") ctx.resume();
}

export function setSound(value) {
  on = value;
  if (!on) stopClicks();
}

function blip(out, at, freq, dur, gain) {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = "triangle";
  o.frequency.value = freq;
  g.gain.setValueAtTime(0, at);
  g.gain.linearRampToValueAtTime(gain, at + 0.003);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  o.connect(g).connect(out);
  o.start(at);
  o.stop(at + dur + 0.02);
}

// Play a click at each passage time (ms), starting `delayMs` from now.
export function playClicks(timesMs, delayMs) {
  stopClicks();
  if (!on || !ctx) return;
  bus = ctx.createGain();
  bus.connect(ctx.destination);
  const t0 = ctx.currentTime + delayMs / 1000;
  for (const t of timesMs) blip(bus, t0 + t / 1000, 880, 0.06, 0.1);
}

export function stopClicks() {
  if (bus) {
    bus.disconnect();
    bus = null;
  }
}
