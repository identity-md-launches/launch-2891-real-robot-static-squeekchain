import { test } from "node:test";
import assert from "node:assert/strict";
import { windows, everyStretch, record, passageTimes } from "../tools/build_clips.mjs";
import { fetchRuns, CursorRefused } from "../tools/fetch_runs.mjs";
import { features } from "../js/features.js";

const cumulative = (gaps) => gaps.reduce((t, g) => [...t, t[t.length - 1] + g], [0]);

test("his record takes a stretch from every start passage", () => {
  const times = cumulative(new Array(20).fill(1000)); // a passage every second for 20 s
  // A stretch from passage i holds the passages in [t_i, t_i + 8 s): 8 of them up to t = 13 s.
  assert.equal([...everyStretch(times)].length, 14);
});

test("a steady stretch between two end-to-end windows still counts for the record", () => {
  const wobble = (n) => Array.from({ length: n }, (_, i) => (i % 2 ? 920 : 880));
  const steady = Array.from({ length: 12 }, (_, i) => (i % 2 ? 899.6 : 900.4));
  const times = cumulative([...wobble(4), ...steady, ...wobble(10)]);
  const endToEnd = Math.min(...windows(times).map((w) => features(w.t).sd));
  assert.ok(endToEnd > 5, String(endToEnd));
  assert.ok(record(times).steadiestSdMs < 1, JSON.stringify(record(times)));
});

test("only his device's own record goes in", () => {
  const seg = (over) => ({
    startAt: "2026-10-29T21:00:00.000000Z",
    provenance: "hardware",
    measurementEligible: true,
    passages: [{ at: "2026-10-29T21:00:00.000100Z" }, { at: "2026-10-29T21:00:00.900200Z" }],
    ...over,
  });
  const [a, b] = passageTimes({ items: [seg({})] });
  assert.equal(new Date(a).toISOString(), "2026-10-29T21:00:00.000Z");
  assert.ok(Math.abs(b - a - 900.1) < 1e-3, "microseconds are kept"); // epoch times hold about 0.0002 ms
  assert.throws(() => passageTimes({ items: [seg({ provenance: "simulated" })] }), /not "hardware"/);
  assert.throws(() => passageTimes({ items: [seg({ measurementEligible: false })] }), /not measurement-eligible/);
  const back = seg({ passages: [{ at: "2026-10-29T21:00:01.000000Z" }, { at: "2026-10-29T21:00:00.500000Z" }] });
  assert.throws(() => passageTimes({ items: [back] }), /do not increase/);
});

test("the fetcher stops at the feed's first empty page and keeps the cursor", async () => {
  const pages = [
    { schemaVersion: "measurement-runs.v1", items: [1, 2], nextCursor: "A" },
    { items: [3], nextCursor: "B" },
    { items: [], nextCursor: "B" },
  ];
  const urls = [];
  const runs = await fetchRuns({ get: async (url) => pages[urls.push(url) - 1], pace: 0 });
  assert.deepEqual(runs.items, [1, 2, 3]);
  assert.equal(runs.nextCursor, "B");
  assert.equal(urls.length, 3);
  assert.match(urls[1], /cursor=A$/);
  assert.equal(runs.meta.schemaVersion, "measurement-runs.v1");
});

test("a refused cursor starts again from the first page; other errors stop", async () => {
  const urls = [];
  const get = async (url) => {
    urls.push(url);
    if (url.includes("cursor=OLD")) throw new CursorRefused("HTTP 400");
    return url.includes("cursor=") ? { items: [], nextCursor: "A" } : { items: [1], nextCursor: "A" };
  };
  const runs = await fetchRuns({ start: "OLD", get, pace: 0 });
  assert.deepEqual(runs.items, [1]);
  assert.deepEqual(urls.map((u) => u.split("?")[1]), ["limit=100&cursor=OLD", "limit=100", "limit=100&cursor=A"]);
  await assert.rejects(fetchRuns({ get: async () => { throw new Error("HTTP 404"); }, pace: 0 }), /HTTP 404/);
});
