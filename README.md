# chess-improvement-indicator

Chrome extension (Manifest V3) that adds an **improvement indicator (ii)** to
player profiles on **lichess.org** and **chess.com**, inspired by the osu!
improvement indicator.

`ii = 1.5x` means: *this player reached their current rating in 1/1.5 of the
games the average player needs to get there.*

## How ii is computed

For each time class (bullet / blitz / rapid / classical) we have a **baseline
curve** – the rating the average player has after `g` rated games:

```
expectedRating(g) = r0 + a · ln(1 + g / g0)
gamesToReach(r)   = g0 · (exp((r − r0) / a) − 1)      // inverse
```

Per time class:

```
ii = gamesToReach(currentRating) / gamesPlayed
```

The headline number is the **games-weighted geometric mean** of the per-class
values (ii is a ratio, so 2x and 0.5x average to 1x).

Rules:
- fewer than 30 games or provisional rating → `n/a` for that time class
- ii is capped at 20x (strong OTB players on fresh accounts)
- Lichess and chess.com have **separate baselines** (different rating systems
  and starting points)

Effort is measured in **games per time class**, not raw hours: a bullet game
and a classical game are not the same effort, and per-class games are
available on both platforms. Playtime is shown for context (real on Lichess,
estimated from games × average duration on chess.com).

> ⚠️ The baseline parameters in `src/core/baseline.js` are **placeholders**.
> The indicator is only meaningful after calibration.

## Calibration (next step)

1. Collect a sample of players per platform (not leaderboards – those are
   biased; e.g. random opponents from game exports / tournaments).
2. For each player + time class record `(games, rating)`.
3. Fit `r0, a, g0` per platform × time class (median rating per games bucket,
   then least squares on the curve).
4. Write the fitted values into `baseline.js`, bump `BASELINE_VERSION` and the
   cache version in `background.js`.

## Project layout

```
manifest.json
src/
  background.js          service worker: fetch + cache (6h) + build report
  core/                  pure logic, no browser APIs (unit tested)
    baseline.js          baseline curves per platform/time class
    indicator.js         ii per class + combination
    report.js            normalized player → report
    timeClasses.js       time classes, avg game durations
  providers/             API clients → normalized player
    lichess.js           GET lichess.org/api/user/{name}
    chesscom.js          GET api.chess.com/pub/player/{name}/stats
  content/               injected into the sites
    badge.js / .css      shared badge UI + SPA navigation handling
    lichess.js           URL + DOM anchors for lichess
    chesscom.js          URL + DOM anchors for chess.com
tests/core.test.js
```

## Development

- Load: `chrome://extensions` → Developer mode → **Load unpacked** → this folder.
- After editing: click the reload icon on the extension card, refresh the page.
- Tests: `npm test` (Node ≥ 20, no dependencies).
- If a site changes its markup and no anchor selector matches, the badge
  falls back to floating in the bottom-right corner — update the selectors
  in `src/content/<site>.js`.
