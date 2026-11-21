# chess-improvement-indicator

Chrome extension (Manifest V3) that adds an **improvement indicator (ii)** to
player profiles on **lichess.org** and **chess.com**, inspired by the osu!
improvement indicator.

`ii = 1.5x` means: *this player climbed about 1.5× as far as a typical
player with the same amount of experience.*

Privacy: the extension has no server and collects nothing; see the
[privacy policy](docs/privacy.md).

## How ii is computed

For each platform × time class (fitted on a random sample of players):

- **typical(E)** – median rating of players with `E` effective games
  (games in this time class + games in other time classes × transfer weight,
  see below)
- **start** – rating of weak beginners (10th percentile at minimal experience)
- **difficulty t(r)** – `−ln P(rating ≥ r)`: how rare a rating is

For a player with rating `r` and `E` effective games, `T = typical(E)`:

```
r ≤ T + 150:   ii = (r − start) / (T − start)          plain Elo, linear
r > T + 150:   same, but each Elo above T + 150 counts t'(r) / t'(T + 150) Elo
```

- `ii = 1.00x` exactly at the typical rating; median over the sample ≈ 1.00x.
- **±150 Elo around typical is linear on purpose** – that's about the size of
  normal rating fluctuation, so a good or bad week doesn't swing the number.
- **Above that, harder Elo weighs more**: going 2200 → 2300 counts for more
  than 1500 → 1600, because far fewer players get there.
- Same rating with more games → lower ii.

The details panel also shows the **expected score against a typical player
with your experience** (Elo formula `1 / (1 + 10^((T − r)/400))`), e.g.
"scores ~65% vs typical".

Notes shown when they apply:
- `~1.92x` – rating above what the random sample covers; the difficulty scale
  is extrapolated (normal tail anchored to the data)
- `<0.1x` – below the typical beginner level
- more games than anyone in the sample → compared with the most experienced
- `≥20x` – display cap
- fewer than 30 games or provisional rating → `n/a` for that time class

The headline number is the **time-weighted geometric mean** of the per-class
values (a classical game weighs ~25 bullet games).

### Effective games (time controls)

```
effective(X) = games(X) + Σ transfer[Y] · games(Y)      transfer ∈ [0, 1]
```

The weights are fitted per platform and time class: experience from faster
time controls carries over to slower ones (on Lichess: rapid = rapid + blitz
+ bullet; blitz = blitz + bullet; bullet = bullet only). Capped at 1 because
the unconstrained fit picks up reverse causation (strong players play lots of
bullet). If a time class has too few players, the default rule is "faster
time classes count fully".

## Cross-platform accounts

Many people play on both sites. If we can tell it's the same person, their
games on the other site count as experience too (same time class ×1, other
time classes × the fitted transfer weights).

- **confirmed** – the Lichess profile (links or bio) points to
  `chess.com/member/<name>`. Checked in both directions: on a chess.com
  profile we look up the same name on Lichess and require the link back.
  → counted.
- **possible** – an account with the same username exists on the other site,
  but nothing ties them together → shown in the details panel, **not
  counted** (common usernames belong to different people).

The calibration sample uses the same rule (`npm run link`), otherwise players
on both sites would systematically get a lower ii than the baseline expects.

## Calibration

The baseline parameters live in `src/core/baselineParams.js` and are
generated from a sample of real players. Run from the repo root
(needs Node ≥ 20 and internet):

```bash
npm run collect:lichess -- --target 5000    # random sample, ~10–20 min
npm run tail:lichess                        # optional, NOT used by the fit (see below)
npm run collect:chesscom -- --target 5000   # random sample, ~1h (one request per player)
npm run tail:chesscom                       # optional, NOT used by the fit
npm run link                                # confirmed accounts on the other site
npm run fit                                  # writes src/core/baselineParams.js
```

Then reload the extension. Cached reports are invalidated automatically
(the cache key contains `BASELINE_VERSION`).

**How players are sampled**

- **chess.com** – random accounts from the per-country member lists
  (`/pub/country/{ISO}/players`, ~24 countries, equal share each). Includes
  inactive accounts, which is what "average player" should mean.
- **Lichess** – seeds from recent arena tournaments (rating-limited arenas
  cover every level), then the *opponents* of those seeds in ordinary rated
  games, profiles fetched in bulk (300 per request).

Both collectors are sequential and rate-limited (the APIs ask for no
parallel requests), back off on HTTP 429, and are **resumable**: re-run the
same command and it continues, skipping players already in
`data/raw/<platform>.jsonl`.

**The tail (`npm run tail:*`) is NOT used by the fit.** Leaderboard and
titled players turned out to be a different population (strong OTB players
with few online games); mixing them in flattened the top of the model. The
data is kept for reference only.

**How the model is fitted** (`tools/lib/fit.js`, random sample only)

1. Transfer weights: coordinate search over [0, 1] maximising R² of
   rating ~ ln(effective games).
2. Experience curve: bucket players by effective games (×1.6 per bucket),
   median rating per bucket, isotonic regression (never decreasing).
   Start level = 10th percentile of the two least-experienced buckets; a time
   class without real beginners (Lichess classical) borrows the platform's
   lowest start level.
3. Difficulty: kernel-smoothed survival function of ratings (50 Elo
   bandwidth); above the last 30 players, a normal tail anchored at the 80th
   percentile and continuous with the data.

`npm run fit -- --dry-run` prints the experience curve, the ii distribution
over the sample and example values without writing anything. Time classes
with < 200 usable players keep their previous parameters.

**Known biases**

- Survivorship: players with thousands of games are the ones who didn't quit.
- Lichess sample comes through recent games → favours currently active players.
- chess.com fair-play closures are not filtered (medians absorb them).
- chess.com lets new players pick their starting rating, which distorts
  low-game-count accounts.

## Project layout

```
manifest.json
src/
  background.js          service worker: fetch + cache (6h) + build report
  core/                  pure logic, no browser APIs (unit tested)
    baseline.js          baseline curve + inverse
    baselineParams.js    fitted parameters (generated by tools/fit.js)
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
tools/
  collect.js             sample players → data/raw/<platform>.jsonl
  fit.js                 fit curves → src/core/baselineParams.js
  collectors/            lichess + chess.com sampling strategies
  lib/                   http client (rate limit), fitting, helpers
tests/                   node:test, no network needed
```

## Development

- Load: `chrome://extensions` → Developer mode → **Load unpacked** → this folder.
- After editing: click the reload icon on the extension card, refresh the page.
- Tests: `npm test` (Node ≥ 20, no dependencies).
- If a site changes its markup and no anchor selector matches, the badge
  falls back to floating in the bottom-right corner — update the selectors
  in `src/content/<site>.js`.
