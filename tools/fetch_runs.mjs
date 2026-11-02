// Save Squeektoshi's recorded runs from the public Squeekchain API, for tools/build_clips.mjs.
// Read-only and paced: one request every 1.1 s, with a growing pause after any refusal.
// The runs docs say to keep `nextCursor` "even on an empty page and continue from it until
// `items` is empty", and to start again from the first page when a cursor is refused.
// Node 20+, no packages.
//
// Usage: node tools/fetch_runs.mjs runs.json [--max-pages N]
import { writeFileSync } from "node:fs";

const API = "https://api.squeekchain.com";
const PACE_MS = 1100;
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

export class CursorRefused extends Error {}

// One page. A network error, 429 or 5xx waits and tries again; 400 or 409 means the cursor was
// refused; any other 4xx is a request the API will never accept, so the script stops.
async function page(url) {
  for (let wait = 5000; ; wait = Math.min(wait * 2, 120000)) {
    let res;
    try {
      res = await fetch(url, { headers: { accept: "application/json" } });
    } catch (err) {
      console.error(`${err.message}; trying again in ${wait / 1000} s`);
      await sleep(wait);
      continue;
    }
    if (res.ok) return await res.json();
    if (res.status === 400 || res.status === 409) throw new CursorRefused(`HTTP ${res.status}`);
    if (res.status !== 429 && res.status < 500) throw new Error(`HTTP ${res.status} from ${url}; stopping`);
    console.error(`HTTP ${res.status}; trying again in ${wait / 1000} s`);
    await sleep(wait);
  }
}

// Every page from `start` (the first page when null) to the feed's first empty page. The cursor
// to continue from later is kept as `nextCursor`.
export async function fetchRuns({ start = null, maxPages = Infinity, get = page, pace = PACE_MS } = {}) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    const items = [];
    let meta = null;
    let cursor = attempt === 1 ? start : null;
    try {
      for (let pages = 1; ; pages++) {
        const p = await get(`${API}/v1/measurement/runs?limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`);
        if (!meta) meta = Object.fromEntries(Object.entries(p).filter(([k]) => k !== "items" && k !== "nextCursor"));
        const got = p.items ?? [];
        items.push(...got);
        cursor = p.nextCursor ?? cursor;
        if (!got.length || !p.nextCursor || pages >= maxPages) break;
        await sleep(pace);
      }
    } catch (err) {
      if (!(err instanceof CursorRefused)) throw err;
      console.error(`the API refused the cursor (${err.message}); starting again from the first page`);
      await sleep(pace);
      continue;
    }
    return { fetchedAt: `${new Date().toISOString().slice(0, 19)}Z`, meta, nextCursor: cursor, items };
  }
  throw new Error("the API refused the cursor three times");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [, , out, flag, value] = process.argv;
  const runs = await fetchRuns({ maxPages: flag === "--max-pages" ? Number(value) : Infinity });
  writeFileSync(out, JSON.stringify(runs));
  console.error(`${runs.items.length} run segments`);
}
