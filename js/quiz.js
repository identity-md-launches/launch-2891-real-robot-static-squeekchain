// A round of clips, the reveal for each, and the score.
import { rng } from "./rng.js";
import { fake, KINDS } from "./fakes.js";
import { features, gaps, sameGap } from "./features.js";
import { modelCall } from "./model.js";

export const FAKE_KINDS = Object.keys(KINDS);

// His record: every 8-second stretch of his recorded runs that starts on a passage, nights of
// 26-30 Oct 2026 (53,604 overlapping stretches). tools/build_clips.mjs measures it from the raw
// runs and stores it in data/clips.json as `record`; a test keeps these numbers in step.
export const RECORD = { stretches: 53604, steadiestSdMs: 2.307, driftShare: 0.749, flatShareMax: 0.25, repeatShareMax: 0.667 };

// n clips: two real in a short round, four to six in a long one; never more than two fakes of a kind.
export function makeRound(seed, n, pool) {
  const r = rng(seed);
  const realCount = n <= 4 ? 2 : 4 + r.int(3);
  const reals = r.shuffle(pool).slice(0, realCount).map((c) => ({ real: true, kind: "real", ...c }));
  const kinds = [];
  const order = r.shuffle(FAKE_KINDS);
  for (let k = 0; kinds.length < n - realCount; k++) {
    const kind = order[k % order.length];
    if (kinds.filter((x) => x === kind).length < 2) kinds.push(kind);
  }
  const fakes = kinds.map((kind) => fake(kind, r, r.pick(pool)));
  return r.shuffle([...reals, ...fakes]);
}

export function judge(model, clip, guessRobot) {
  const call = modelCall(model, clip.t);
  return {
    youRight: guessRobot === !clip.real,
    modelRight: call.robot === !clip.real,
    model: call,
  };
}

const ms = (x) => `${Math.round(x)} ms`;
const steadiest = `Even his steadiest 8 seconds on record wobbled by ${RECORD.steadiestSdMs.toFixed(1)} ms.`;
const r2 = (x) => (Math.abs(x) < 0.005 ? 0 : x).toFixed(2); // never "-0.00"
const leading = (g, x) => {
  let n = 0;
  while (n < g.length && sameGap(g[n], x)) n++;
  return n;
};
const part = (n, x) => (n > 1 ? `${n} gaps of exactly ${ms(x)}` : `a single ${ms(x)} gap`);
const spread = "Someone counted the passages in each 4-second half and spread them out evenly.";

// What gave the clip away, in the clip's own numbers.
export function tell(clip) {
  const f = features(clip.t);
  switch (clip.kind) {
    case "real":
      return `His gaps wander between ${ms(f.min)} and ${ms(f.max)}, and the pattern never comes round again exactly.`;
    case "motor":
      return `Too even: every gap is ${ms(f.mean)}, give or take ${f.sd.toFixed(1)} ms. ${steadiest}`;
    case "hand": {
      const r = r2(f.lag1);
      if (f.lag1 < -0.1) {
        return `It zig-zags: a hand corrects its own beat, so a long gap tends to follow a short one (neighbouring gaps correlate at ${r}). In ${Math.round(RECORD.driftShare * 4)} of every 4 of his stretches they move together instead.`;
      }
      if (f.lag1 <= 0.1) {
        return `A hand corrects its own beat, so long and short gaps tend to alternate. Here neighbouring gaps barely correlate (${r}), so the zig-zag is hard to hear: a hard one.`;
      }
      return `A hand corrects its own beat, so long and short gaps usually alternate. This one happened to drift the way he does (neighbouring gaps correlate at ${r}), which hides the zig-zag: a hard one.`;
    }
    case "smooth":
      return `Too smooth: the gaps glide between ${ms(f.min)} and ${ms(f.max)} in one clean wave. His runs drift too, but usually with small stumbles on top.`;
    case "loop":
      return `It loops: the same ${f.repeat.lag} gaps come round again, each to a tenth of a millisecond. Not one 8-second stretch of his record does that, wherever it starts.`;
    case "steps": {
      const g = gaps(clip.t);
      const [a, b] = [g[0], g[g.length - 1]];
      if (sameGap(a, b)) return `Every gap is exactly ${ms(a)}. ${spread} ${steadiest}`;
      return `Flat steps: ${part(leading(g, a), a)}, then ${part(leading([...g].reverse(), b), b)}. ${spread} In no 8 seconds of his record do more than a quarter of neighbouring gaps match like that.`;
    }
    default:
      return "";
  }
}

export function provenanceLine(clip) {
  if (clip.real) return `Recorded by the WHEELY9000 on ${when(clip.startAt)}. The API labels his run records "hardware".`;
  if (clip.physical) {
    return `If a motor or a hand turned the real wheel, the sensor would count it just the same: "The sensor counts passages; it cannot tell why the wheel moved."`;
  }
  return `It plays the part of "${clip.provenance}" data. The API's provenance field can say "hardware", "simulated", "replay" or "derived"; his run records say "hardware".`;
}

export function when(iso) {
  const d = new Date(iso);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${d.getUTCDate()} ${months[d.getUTCMonth()]}, ${hh}:${mm} UTC`;
}

// The copied result, in the player's own voice. It names the mix of his runs and fakes, so it
// never reads as a verdict on his runs.
export function shareLine(card, url) {
  const verdict = card.you > card.model ? "I beat the model." : card.you === card.model ? "A draw with the model." : "The model beat me.";
  return (
    `Real or Robot?: I called ${card.you} of ${card.n} clips right (Squeektoshi's recorded runs mixed with fakes). ` +
    `The small trained model called ${card.model} of ${card.n}. ${verdict} ${url}`
  );
}

export function scoreCard(results) {
  const you = results.filter((x) => x.youRight).length;
  const model = results.filter((x) => x.modelRight).length;
  const n = results.length;
  let verdict = "The model wins this one.";
  if (you > model) verdict = "You beat the model.";
  else if (you === model) verdict = "A draw with the model.";
  return { you, model, n, line: `You ${you}/${n}, model ${model}/${n}`, verdict };
}
