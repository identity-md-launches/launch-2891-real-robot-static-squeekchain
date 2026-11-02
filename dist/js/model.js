// The opponent: a small trained model (a logistic regression) that hears only three things
// about a clip: how much the gaps vary, whether neighbouring gaps drift or zig-zag, and how
// jagged the rhythm is. It weighs those three and their pairwise products. It cannot hear
// exact repeats. Its weights are trained offline by tools/train.mjs and ship in data/model.json.
import { features } from "./features.js";

const BASE = ["logCv", "lag1", "logJag"];
export const MODEL_FEATURES = [...BASE];
for (let i = 0; i < BASE.length; i++) for (let j = i; j < BASE.length; j++) MODEL_FEATURES.push(`${BASE[i]}*${BASE[j]}`);

export function vector(f) {
  const x = [Math.log(f.cv + 1e-4), f.lag1, Math.log(f.jag + 1e-4)];
  const out = [...x];
  for (let i = 0; i < x.length; i++) for (let j = i; j < x.length; j++) out.push(x[i] * x[j]);
  return out;
}

export function sigmoid(z) {
  return 1 / (1 + Math.exp(-z));
}

// The model's probability that a clip is a robot.
export function robotProbability(model, t) {
  const x = vector(features(t));
  let z = model.bias;
  for (let i = 0; i < x.length; i++) z += model.weights[i] * ((x[i] - model.mean[i]) / model.std[i]);
  return sigmoid(z);
}

export function modelCall(model, t) {
  const p = robotProbability(model, t);
  return { robot: p >= 0.5, sure: Math.round(100 * Math.max(p, 1 - p)) };
}

// Plain batch gradient descent with a little L2, used by tools/train.mjs.
export function train(xs, ys, { steps = 4000, rate = 0.3, l2 = 1e-3 } = {}) {
  const d = xs[0].length;
  const mean = Array.from({ length: d }, (_, j) => xs.reduce((s, x) => s + x[j], 0) / xs.length);
  const std = Array.from({ length: d }, (_, j) =>
    Math.sqrt(xs.reduce((s, x) => s + (x[j] - mean[j]) ** 2, 0) / xs.length) || 1);
  const zs = xs.map((x) => x.map((v, j) => (v - mean[j]) / std[j]));
  const w = new Array(d).fill(0);
  let b = 0;
  for (let it = 0; it < steps; it++) {
    const gw = new Array(d).fill(0);
    let gb = 0;
    for (let i = 0; i < zs.length; i++) {
      let z = b;
      for (let j = 0; j < d; j++) z += w[j] * zs[i][j];
      const e = sigmoid(z) - ys[i];
      for (let j = 0; j < d; j++) gw[j] += e * zs[i][j];
      gb += e;
    }
    for (let j = 0; j < d; j++) w[j] -= rate * (gw[j] / zs.length + l2 * w[j]);
    b -= (rate * gb) / zs.length;
  }
  return { features: MODEL_FEATURES, mean, std, weights: w, bias: b };
}
