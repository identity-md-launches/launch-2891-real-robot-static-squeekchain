import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { RECORD } from "../js/quiz.js";

const root = new URL("../", import.meta.url);
const read = (p) => readFileSync(new URL(p, root), "utf8");
const model = JSON.parse(read("data/model.json"));
const pages = ["index.html", "about.html", "README.md"];
const code = readdirSync(new URL("js/", root)).filter((f) => f.endsWith(".js")).map((f) => read(`js/${f}`));

test("the pages never call the model AI and never say anyone mines", () => {
  for (const text of [...pages.map(read), ...code]) {
    assert.ok(!/\bAI\b/.test(text), "says AI");
    assert.ok(!/\bmin(e|es|ed|ing|er|ers)\b/i.test(text), "mining wording");
  }
});

test("the model's numbers on the pages match data/model.json", () => {
  const pct = (x) => `${Math.round(x * 100)}%`;
  const about = read("about.html");
  for (const [kind, acc] of Object.entries(model.heldOut.byKind)) {
    assert.ok(about.includes(`<td data-kind="${kind}">${pct(acc)}</td>`), `${kind} ${pct(acc)}`);
  }
  assert.ok(about.includes(`right on ${pct(model.heldOut.balancedAccuracy)} of them`));
  assert.ok(about.includes(`tested on ${model.heldOut.clips.toLocaleString("en")} clips`));
  assert.ok(about.includes(`trained on ${model.trainedOn.realClips.toLocaleString("en")} of his stretches`));
  assert.ok(about.includes(`and ${model.trainedOn.fakeClips.toLocaleString("en")} fakes`));
  assert.ok(read("index.html").includes(`<span id="modelScore">${Math.round(model.heldOut.balancedAccuracy * 100)}</span>`));
  const d = model.heldOut.otherDraws;
  const draws = `Over ${d.draws} more draws the model stayed between ${pct(d.balancedAccuracy[0])} and ${pct(d.balancedAccuracy[1])} overall`;
  const kinds = `hands ranged from ${pct(d.byKind.hand[0])} to ${pct(d.byKind.hand[1])} and loops from ${pct(d.byKind.loop[0])} to ${pct(d.byKind.loop[1])}`;
  assert.ok(about.includes(`${draws}; ${kinds}.`), "about: other draws");
  assert.ok(read("README.md").includes(`over ${d.draws} more draws the model stayed between ${pct(d.balancedAccuracy[0])} and ${pct(d.balancedAccuracy[1])} overall, ${kinds}.`), "README: other draws");
});

test("the pages quote his record as the reveals do", () => {
  for (const page of ["about.html", "README.md"]) {
    const text = read(page);
    assert.ok(text.includes(RECORD.stretches.toLocaleString("en")), `${page}: stretches`);
    assert.ok(text.includes(`${RECORD.steadiestSdMs.toFixed(1)} ms`), `${page}: steadiest`);
    assert.ok(text.includes("two-thirds") && text.includes("a quarter") && text.includes("3 of every 4"), page);
  }
});

test("every quote from the docs is spelled the same on every page", () => {
  const quotes = [
    "The sensor counts passages; it cannot tell why the wheel moved.",
    "“Hamster proof of work” describes these recorded passages, not a way of proving animal identity or securing Ethereum consensus.",
    "A signing chip protects the key, not the truth of the data its host supplies.",
  ];
  for (const q of quotes) {
    assert.ok(read("index.html").includes(q), q);
    assert.ok(read("about.html").includes(q), q);
  }
});
