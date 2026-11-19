// "Effective games": how much chess experience counts towards the rating in
// one time class.
//
//   effective(X) = games(X) + Σ_{Y≠X} transfer[Y] · games(Y)
//
// With a CONFIRMED account on the other platform (see linking.js), its games
// are added the same way: same time class ×1, other classes × transfer.
//
// transfer[Y] ∈ [0, 1] is fitted per platform × time class (tools/fit.js):
// a game in another time class helps at most as much as a game in X.
// On Lichess data the pattern is clear: experience from FASTER time
// controls carries over to slower ones (bullet → blitz → rapid), not the
// other way round (rapid games don't make you faster at bullet).

import { TIME_CLASSES } from './timeClasses.js';

/** Fallback when there is not enough data: faster time classes count fully. */
export function defaultTransfer(timeClass) {
  const idx = TIME_CLASSES.indexOf(timeClass);
  const out = {};
  TIME_CLASSES.forEach((t, i) => {
    if (t !== timeClass) out[t] = i < idx ? 1 : 0;
  });
  return out;
}

/**
 * @param {Record<string,{games:number}>} perfs
 * @param {string} timeClass
 * @param {Record<string,number>} transfer  weights of the OTHER time classes
 * @param {Record<string,{games:number}>|null} linkedPerfs  confirmed account on the other platform
 */
export function effectiveGames(perfs, timeClass, transfer = defaultTransfer(timeClass), linkedPerfs = null) {
  const g = (ps, t) => ps?.[t]?.games ?? 0;
  let total = g(perfs, timeClass) + g(linkedPerfs, timeClass);
  for (const [t, w] of Object.entries(transfer)) {
    if (t !== timeClass && w > 0) total += w * (g(perfs, t) + g(linkedPerfs, t));
  }
  return total;
}
