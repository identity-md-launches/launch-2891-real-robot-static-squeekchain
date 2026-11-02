# Real or Robot?

Eight-second clips of a wheel turning: some are Squeektoshi's real recorded runs, and some are fakes. You hear every magnet passage and watch the gaps between passages, then call each clip **hamster** or **robot**. A small trained model calls them too. Each reveal names the tell that gave the clip away, and the score card reads "You 3/4, model 3/4".

It is a game about what Squeekchain's "hamster proof of work" proves and where it honestly stops. Two of the fakes, a motor and a hand, would turn the real wheel and be counted like any other passage, because "The sensor counts passages; it cannot tell why the wheel moved."

It is a static site: no build step, no packages, no wallet. It works at any hour, because the real clips are his recorded runs.

## The 60-second demo

Open the site with `?seed=148` (for example `http://localhost:8000/?seed=148`) to play a fixed round. Without it, every round is new.

1. Press **Play 4 clips**. Clip 1 plays for 8 seconds: clicks, a turning wheel and the gaps chart.
2. Press **Robot** (or the R key). The reveal: "Too even: every gap is … give or take … ms. Even his steadiest 8 seconds on record wobbled by 2.3 ms." The model called it too.
3. Clip 2 is his: press **Hamster**. The reveal shows when the WHEELY9000 recorded it.
4. Clip 3 is a replay loop: the same four gaps come round again. The model says hamster; you can say robot.
5. Clip 4 is his again. The card reads **You 4/4, model 3/4. You beat the model.**, with the docs' proof limits underneath.

## How it works

| Piece | What it does | Where |
|---|---|---|
| Real clips | 80 eight-second stretches of his runs from `/v1/measurement/runs`, nights of 29 and 30 October 2026 | `data/clips.json`, `tools/build_clips.mjs` |
| Fakes | A steady motor, a person's hand, a smooth simulation, a replay loop, and a run rebuilt from counts; each borrows the pace of a real clip | `js/fakes.js` |
| Rhythm measures | Gap spread, neighbour correlation (drift or zig-zag), jaggedness, exact repeats, flat runs | `js/features.js` |
| The model | A logistic regression on three rhythm measures and their pairwise products; it has no measure for exact repeats | `js/model.js`, `data/model.json`, `tools/train.mjs` |
| Rounds and reveals | 4 clips (2 real) or 10 clips (4 to 6 real, at most 2 fakes of a kind); every reveal sentence is built from the clip's own numbers | `js/quiz.js` |
| Wheel and clicks | The wheel and its replay come from Ghost Wheel; clicks are scheduled on the audio clock, so you hear the exact rhythm | `js/wheel.js`, `js/ghost.js`, `js/audio.js` |

The model was trained on 3,169 of his stretches from the nights of 26 to 28 October and 3,170 fakes. On 1,200 clips it had never seen (600 of his stretches from 29 and 30 October and 600 fakes) it was right 89% of the time: 93% on his runs, 100% on motors, 98% on rebuilt runs, 90% on smooth simulations, 78% on hands and 64% on loops. Each fake's figure comes from one draw of 120 clips, so it moves with the draw: over 40 more draws the model stayed between 88% and 90% overall, hands ranged from 63% to 78% and loops from 56% to 73%. A test keeps it above 80%.

### Where the numbers come from

The game's clips, training and test sets come from 5,752 eight-second stretches cut end to end without overlapping. The reveals compare each fake with his whole record instead: every 8-second stretch that starts on any of his passages and follows the same rules, 53,604 of them, overlapping, on the nights of 26 to 30 October 2026 (runs fetched at 08:45:55 UTC on 31 October). Across those:
- the steadiest stretch still had a 2.3 ms spread of gaps (28 October, 01:35:41 UTC);
- none looped: in no stretch did more than two-thirds of the gaps match the gap a few places before, to within a tenth of a millisecond;
- never more than a quarter of neighbouring gaps matched to within a tenth of a millisecond;
- in 3 of every 4 stretches, neighbouring gaps moved together.

`tools/build_clips.mjs` measures these from the raw runs and stores them in `data/clips.json` as `record`. The tests check every reveal sentence against that record, and the record against the stretches in `data/train-windows.json` and the game's clips. A rebuild with newer runs changes the numbers, and the tests say which.

What the game does **not** claim:
- The runs feed is "evidence signed by the device's key, not work certified by SqueekCore".
- The fakes stand in for the API's provenance values (`hardware`, `simulated`, `replay`, `derived`); the docs list those values but do not define them, so the game never says how Squeekchain labels a given fake.
- A rhythm that looks wrong is not proof either way. "Accepted work does not prove animal identity, direction, physical cause, calories, or health."

## Care policy

"The care policy never forces or encourages running, so some periods produce no work and no blocks." Real or Robot? only reads public records of runs he chose to make. Nothing a player does reaches his wheel.

## Run it locally

```sh
python3 -m http.server 8000      # then open http://localhost:8000
node --test                      # Node 20 or later, no packages
```

Rebuild the data (optional; the first step makes paced, read-only calls to the public API and stops at the feed's first empty page):

```sh
node tools/fetch_runs.mjs runs.json
node tools/build_clips.mjs runs.json data/clips.json data/train-windows.json
node tools/train.mjs data/train-windows.json data/model.json
```

The plan named Python for the training script. It is a Node script instead, so the game and the trainer share one copy of the fakes and the rhythm measures.

## Files

- `index.html`, `about.html`, `css/style.css`, `assets/icon.svg`
- `js/`: `main.js` (page), `quiz.js`, `model.js`, `fakes.js`, `features.js`, `rng.js`, `wheel.js`, `ghost.js`, `audio.js`
- `data/clips.json` (the 80 real clips and his record), `data/model.json` (the model), `data/train-windows.json` (the training and held-out stretches, as passage times)
- `tools/`: `fetch_runs.mjs`, `build_clips.mjs`, `train.mjs`
- `test/`: `node --test` suites for the measures, the clip cutter and the runs fetcher, the fakes, the model's accuracy floor, the rounds and reveals, and the pages

## Sources

- Squeekchain docs: [Proof limits](https://docs.squeekchain.com/security/proof-limits/), [Measuring wheel activity](https://docs.squeekchain.com/system/measurement/), [Squeektoshi](https://docs.squeekchain.com/system/squeektoshi/), [API](https://docs.squeekchain.com/developers/api/)
- Companion build: [Ghost Wheel](https://github.com/senti23/squeek-ghost-wheel), a race against his recorded runs

A community build for Squeekchain, not an official Squeekchain product. The MIT licence covers the code; the data in `data/` is derived from Squeekchain's public runs feed (`/v1/measurement/runs`, fetched at 08:45:55 UTC on 31 October 2026).
