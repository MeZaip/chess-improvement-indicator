---
title: How ii is calculated – Chess Improvement Indicator
---

# How ii is calculated

**ii** compares how far a player has climbed with a *typical* player who has
the same amount of experience on the same site.

- **1.00x** – typical for their experience
- **2.00x** – climbed about twice as far as typical
- **0.50x** – half as far

## Experience

Experience is the number of rated games in the time control, plus a share of
the games played in the other time controls. On Lichess, for example, blitz
and bullet games count fully towards rapid; on Chess.com, 30% of blitz games
count towards bullet. The shares were measured on thousands of real players
and are shown in the details panel ("counted: …").

If a Lichess profile links to the player's Chess.com account (in the profile
links or bio), the games from both sites are counted.

## Typical rating

"Typical" is the **median rating of players with the same experience** on
that site, measured on a random sample of a few thousand players per site.
Lichess and Chess.com are measured separately – ratings from the two sites
are never compared or mixed. Hover a value in the panel to see the typical
rating it was compared with.

## From rating to ii

```
ii = (your rating − start level) / (typical rating − start level)
```

The *start level* is where weak beginners sit on that site.

- Within about ±150 Elo of the typical rating every Elo point counts the
  same. That is roughly the size of normal rating swings, so a good or bad
  week barely moves the number.
- Further above typical, each Elo counts more, the rarer that rating is.
  Going from 2300 to 2400 is much harder than from 1500 to 1600, and ii
  reflects that.

The number on the badge combines the time controls, weighted by the time
spent in each (a rapid game weighs more than a bullet game).

## Colours

| ii | |
|---|---|
| below 0.4x | well below typical |
| 0.4 – 0.7x | below typical |
| 0.7 – 0.9x | a bit below typical |
| 0.9 – 1.15x | typical |
| 1.15 – 1.4x | a bit above typical |
| 1.4 – 2x | above typical |
| 2 – 3x | well above typical |
| 3x and more | exceptional |

## When there is no number, or a "~"

- **n/a** – fewer than 30 rated games in that time control on this site (10
  if a linked account on the other site exists), or the site still marks the
  rating as provisional.
- **~** – an estimate: the rating is rarer, or the player has more games,
  than anyone in the sample, so the model is extended beyond its data.

## Good to know

- ii measures **progress for the experience so far**. A player who reached
  2800 long ago and has since played 50 000 more games will show a lower ii
  than a player who reached 2000 in 500 games.
- Chess.com publishes player statistics with a delay of up to several hours,
  so a rating change may take a while to show. Lichess is updated
  immediately; results are cached for 10 minutes (use *refresh* in the
  panel).
- The model and its data are open source:
  <https://github.com/MeZaip/chess-improvement-indicator>

[Privacy policy](privacy.md)
