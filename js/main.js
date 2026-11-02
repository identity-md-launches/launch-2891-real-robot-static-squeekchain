// Real or Robot? Each clip is 8 seconds of wheel passages: one of Squeektoshi's recorded runs,
// or a fake. You call it, a small trained model calls it too, and the reveal says what gave it away.
import { SENSOR_ANGLE, TAU, inZone } from "./wheel.js";
import { ghostAngle } from "./ghost.js";
import { unlock, setSound, playClicks, stopClicks } from "./audio.js";
import { CLIP_MS } from "./fakes.js";
import { gaps } from "./features.js";
import { makeRound, judge, tell, provenanceLine, scoreCard, shareLine } from "./quiz.js";

const LEAD_MS = 500; // the wheel is already turning when a clip starts
const SPAN = 0.12; // the chart shows gaps within 12% of the clip's median gap
const $ = (id) => document.getElementById(id);
const motion = () => (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth");
const stage = $("stage");
const ctx2d = stage.getContext("2d");

const S = {
  model: null,
  pool: null,
  n: 4,
  seed: 0,
  round: [],
  results: [],
  index: 0,
  mode: "intro", // intro, playing, reveal, done
  race: null,
  startedAt: 0,
  running: false,
  layout: null,
};

// ?seed=N replays one exact round (for demos and tests); it applies to the first round only.
const seedParam = Number.parseInt(new URLSearchParams(location.search).get("seed") ?? "", 10);
let fixedSeed = Number.isInteger(seedParam) && seedParam > 0 ? seedParam : null;

function colors() {
  const cs = getComputedStyle(document.documentElement);
  const v = (n) => cs.getPropertyValue(n).trim();
  return {
    bg: v("--surface"), text: v("--text"), muted: v("--muted"), line: v("--line"),
    clip: v("--clip"), him: v("--him"), glow: v("--glow"),
  };
}

const median = (a) => {
  const s = [...a].sort((x, y) => x - y);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};

// ---------- layout ----------
function resize() {
  const W = stage.parentElement.clientWidth;
  const wide = W >= 640;
  // On a short screen (a phone held sideways) the stage shrinks so the guess buttons stay in view.
  const H = Math.round(wide ? Math.min(W * 0.38, Math.max(200, window.innerHeight - 170)) : W * 1.0);
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  stage.style.height = `${H}px`;
  stage.width = Math.round(W * dpr);
  stage.height = Math.round(H * dpr);
  ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0);
  S.layout = wide
    ? { W, H, R: Math.min(W * 0.13, H * 0.3), wheel: { x: W * 0.2, y: H * 0.55 },
        chart: { x0: W * 0.42 + 40, x1: W - 24, y0: H * 0.24, y1: H * 0.78 } }
    : { W, H, R: Math.min(W * 0.24, H * 0.18), wheel: { x: W * 0.5, y: H * 0.3 },
        chart: { x0: 64, x1: W - 16, y0: H * 0.64, y1: H * 0.9 } };
  draw(clipTime(performance.now()));
}

// ---------- drawing ----------
function roundRect(c, x, y, w, h, r) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

// The wheel, drawn as in Ghost Wheel: rim, rungs, spokes, the magnet and the sensor at the top.
function drawWheel(c, p, R, angle, col) {
  const { x, y } = p;
  c.save();
  c.lineCap = "round";
  c.strokeStyle = col.clip;
  c.lineWidth = Math.max(3, R * 0.05);
  c.beginPath();
  c.arc(x, y, R, 0, TAU);
  c.stroke();
  c.lineWidth = Math.max(1.5, R * 0.02);
  c.beginPath();
  c.arc(x, y, R * 0.84, 0, TAU);
  c.stroke();
  c.beginPath();
  for (let i = 0; i < 28; i++) {
    const a = angle + (i * TAU) / 28;
    c.moveTo(x + Math.cos(a) * R * 0.84, y + Math.sin(a) * R * 0.84);
    c.lineTo(x + Math.cos(a) * R, y + Math.sin(a) * R);
  }
  for (let i = 0; i < 6; i++) {
    const a = angle + (i * TAU) / 6 + 0.26;
    c.moveTo(x + Math.cos(a) * R * 0.1, y + Math.sin(a) * R * 0.1);
    c.lineTo(x + Math.cos(a) * R * 0.84, y + Math.sin(a) * R * 0.84);
  }
  c.stroke();
  c.fillStyle = col.clip;
  c.beginPath();
  c.arc(x, y, R * 0.1, 0, TAU);
  c.fill();
  c.fillStyle = col.him;
  c.beginPath();
  c.arc(x + Math.cos(angle) * R * 0.92, y + Math.sin(angle) * R * 0.92, Math.max(4, R * 0.065), 0, TAU);
  c.fill();
  const sx = x + Math.cos(SENSOR_ANGLE) * R * 1.12;
  const sy = y + Math.sin(SENSOR_ANGLE) * R * 1.12;
  const sw = Math.max(14, R * 0.2);
  const sh = Math.max(7, R * 0.09);
  c.fillStyle = inZone(angle) ? col.glow : col.line;
  roundRect(c, sx - sw / 2, sy - sh / 2, sw, sh, sh / 2);
  c.fill();
  c.fillStyle = col.muted;
  c.font = `400 ${Math.max(11, Math.round(R * 0.1))}px system-ui, sans-serif`;
  c.textBaseline = "middle";
  c.fillText("sensor", sx + sw / 2 + 6, sy);
  c.restore();
}

// The gaps between passages: one point per gap, at the passage that ends it.
function drawChart(c, L, col, clip, tMs, all) {
  const { x0, x1, y0, y1 } = L.chart;
  const g = gaps(clip.t);
  const mid = median(g);
  const lo = mid * (1 - SPAN);
  const hi = mid * (1 + SPAN);
  const X = (t) => x0 + ((x1 - x0) * t) / CLIP_MS;
  const Y = (v) => y1 - ((y1 - y0) * (Math.min(hi, Math.max(lo, v)) - lo)) / (hi - lo);
  c.save();
  c.font = "600 14px system-ui, sans-serif";
  c.fillStyle = col.text;
  c.textBaseline = "alphabetic";
  c.textAlign = "left";
  c.fillText("Gaps between passages", x0, y0 - 18);
  c.font = "400 12px system-ui, sans-serif";
  c.fillStyle = col.muted;
  c.lineWidth = 1;
  c.strokeStyle = col.line;
  for (const v of [lo, mid, hi]) {
    c.beginPath();
    c.moveTo(x0, Y(v));
    c.lineTo(x1, Y(v));
    c.stroke();
    c.textAlign = "right";
    c.textBaseline = "middle";
    c.fillText(`${Math.round(v)} ms`, x0 - 8, Y(v));
  }
  c.textBaseline = "top";
  for (const s of [0, 2, 4, 6, 8]) {
    c.textAlign = s === 0 ? "left" : s === 8 ? "right" : "center";
    c.fillText(`${s} s`, X(s * 1000), y1 + 8);
  }
  const pts = [];
  for (let k = 1; k < clip.t.length; k++) {
    if (!all && clip.t[k] > tMs) break;
    pts.push({ x: X(clip.t[k]), y: Y(g[k - 1]), out: g[k - 1] < lo || g[k - 1] > hi });
  }
  c.strokeStyle = col.clip;
  c.lineWidth = 2;
  c.lineJoin = "round";
  c.beginPath();
  pts.forEach((p, i) => (i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y)));
  c.stroke();
  for (const p of pts) {
    c.beginPath();
    c.arc(p.x, p.y, 5, 0, TAU);
    c.fillStyle = col.bg;
    c.fill();
    c.beginPath();
    c.arc(p.x, p.y, 4, 0, TAU);
    if (p.out) {
      c.lineWidth = 2;
      c.stroke(); // off the chart: an open marker at the edge
    } else {
      c.fillStyle = col.clip;
      c.fill();
    }
  }
  c.restore();
}

function clipTime(now) {
  return S.mode === "intro" ? -LEAD_MS : Math.min(CLIP_MS, now - S.startedAt);
}

function draw(tMs) {
  const L = S.layout;
  if (!L) return;
  const col = colors();
  const c = ctx2d;
  c.clearRect(0, 0, L.W, L.H);
  c.fillStyle = col.bg;
  c.fillRect(0, 0, L.W, L.H);
  const clip = S.round[S.index];
  if (!clip || S.mode === "intro") {
    drawWheel(c, L.wheel, L.R, SENSOR_ANGLE + Math.PI, col);
    return;
  }
  drawWheel(c, L.wheel, L.R, ghostAngle(S.race, tMs), col);
  drawChart(c, L, col, clip, tMs, S.mode !== "playing");
}

function frame(now) {
  const t = clipTime(now);
  draw(t);
  $("progress").style.width = `${(100 * Math.max(0, t)) / CLIP_MS}%`;
  if (t >= CLIP_MS) {
    S.running = false;
    if (S.mode === "playing") $("prompt").textContent = "Your call: hamster or robot?";
    return;
  }
  requestAnimationFrame(frame);
}

function run() {
  if (S.running) return;
  S.running = true;
  requestAnimationFrame(frame);
}

// ---------- the round ----------
function raceOf(t) {
  const g = gaps(t);
  return { lead: -g[0], t, tail: t[t.length - 1] + g[g.length - 1], raceMs: CLIP_MS, blocks: [] };
}

function startRound(n) {
  if (!S.pool || !S.model) return;
  unlock();
  S.n = n;
  S.seed = fixedSeed ?? 1 + Math.floor(Math.random() * 2 ** 31);
  fixedSeed = null;
  S.round = makeRound(S.seed, n, S.pool);
  S.results = [];
  S.index = 0;
  $("intro").hidden = true;
  $("end").hidden = true;
  $("game").hidden = false;
  playClip();
}

function playClip() {
  const clip = S.round[S.index];
  S.race = raceOf(clip.t);
  S.mode = "playing";
  S.startedAt = performance.now() + LEAD_MS;
  playClicks(clip.t, LEAD_MS);
  $("counter").textContent = `Clip ${S.index + 1} of ${S.n}`;
  $("prompt").textContent = "Listen and watch the gaps…";
  $("reveal").hidden = true;
  $("hamster").disabled = false;
  $("robot").disabled = false;
  document.querySelector(".track").scrollIntoView({ block: "nearest", behavior: motion() });
  run();
}

function replay() {
  const clip = S.round[S.index];
  S.startedAt = performance.now() + LEAD_MS;
  playClicks(clip.t, LEAD_MS);
  run();
}

const mark = (ok) => (ok ? "✓ Right:" : "✗ Wrong:");
const said = (robot) => (robot ? "robot" : "hamster");

function guess(robot) {
  if (S.mode !== "playing") return;
  const clip = S.round[S.index];
  const j = judge(S.model, clip, robot);
  S.results.push({ ...j, real: clip.real, name: clip.real ? "Squeektoshi" : clip.name });
  S.mode = "reveal";
  $("hamster").disabled = true;
  $("robot").disabled = true;
  $("prompt").textContent = "";
  $("truth").textContent = clip.real ? "Real: his recorded run." : `Not him: ${clip.name.toLowerCase()}.`;
  $("truth").dataset.real = String(clip.real);
  $("yourCall").textContent = `${mark(j.youRight)} you said ${said(robot)}.`;
  $("modelCall").textContent = `${mark(j.modelRight)} the model said ${said(j.model.robot)}, ${j.model.sure >= 100 ? "over 99" : j.model.sure}% sure.`;
  $("tell").textContent = tell(clip);
  $("prov").textContent = provenanceLine(clip);
  $("gapList").textContent = gaps(clip.t).map((x) => x.toFixed(1)).join(", ");
  $("next").textContent = S.index + 1 < S.n ? "Next clip" : "See the score";
  $("reveal").hidden = false;
  // Focus the answer, as the end screen does, so a screen reader reads it out.
  $("truth").focus({ preventScroll: true });
  $("reveal").scrollIntoView({ block: "nearest", behavior: motion() });
  draw(clipTime(performance.now()));
}

function next() {
  if (S.mode !== "reveal") return;
  if (S.index + 1 < S.n) {
    S.index += 1;
    playClip();
  } else {
    showEnd();
  }
}

function showEnd() {
  S.mode = "done";
  stopClicks();
  const card = scoreCard(S.results);
  $("final").textContent = card.line;
  $("verdict").textContent = card.verdict;
  const list = $("recap");
  list.replaceChildren(
    ...S.results.map((r) => {
      const li = document.createElement("li");
      li.textContent = `${r.name}: you ${r.youRight ? "✓" : "✗"}, model ${r.modelRight ? "✓" : "✗"}`;
      return li;
    }),
  );
  $("other").textContent = S.n === 4 ? "Play 10 clips" : "Play 4 clips";
  $("game").hidden = true;
  $("end").hidden = false;
  $("copied").textContent = "";
  $("final").focus({ preventScroll: true });
  $("end").scrollIntoView({ block: "start", behavior: motion() });
}

function shareText() {
  return shareLine(scoreCard(S.results), `${location.origin}${location.pathname}`);
}

async function copyResult() {
  try {
    await navigator.clipboard.writeText(shareText());
    $("copied").textContent = "Copied.";
  } catch {
    $("copied").textContent = shareText();
  }
}

// ---------- wiring ----------
async function load() {
  try {
    const [clips, model] = await Promise.all([
      fetch("data/clips.json").then((r) => r.json()),
      fetch("data/model.json").then((r) => r.json()),
    ]);
    S.pool = clips.clips;
    S.model = model;
    $("modelScore").textContent = String(Math.round(model.heldOut.balancedAccuracy * 100));
    $("play4").disabled = false;
    $("play10").disabled = false;
    $("status").textContent = "";
  } catch {
    $("status").textContent = "The clips could not be loaded. Serve this folder over HTTP (for example python3 -m http.server) instead of opening the file directly.";
  }
}

function wire() {
  $("play4").addEventListener("click", () => startRound(4));
  $("play10").addEventListener("click", () => startRound(10));
  $("hamster").addEventListener("click", () => guess(false));
  $("robot").addEventListener("click", () => guess(true));
  $("next").addEventListener("click", next);
  $("replay").addEventListener("click", replay);
  $("again").addEventListener("click", () => startRound(S.n));
  $("other").addEventListener("click", () => startRound(S.n === 4 ? 10 : 4));
  $("copy").addEventListener("click", copyResult);
  $("sound").addEventListener("click", () => {
    const on = $("sound").getAttribute("aria-pressed") !== "true";
    $("sound").setAttribute("aria-pressed", String(on));
    $("sound").textContent = on ? "Sound on" : "Sound off";
    setSound(on);
  });
  document.addEventListener("keydown", (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
    const k = e.key.toLowerCase();
    if (S.mode === "playing" && (k === "h" || k === "r")) {
      e.preventDefault();
      guess(k === "r");
    } else if (S.mode === "reveal" && k === "n") {
      e.preventDefault();
      next();
    }
  });
  window.addEventListener("resize", resize);
  window.matchMedia?.("(prefers-color-scheme: dark)").addEventListener?.("change", () => draw(clipTime(performance.now())));
}

wire();
resize();
load();
