// Time classes we compute an indicator for. Variants (960, atomic, ...) and
// correspondence/daily are ignored: "games played" is not a good effort
// measure there.
export const TIME_CLASSES = ['bullet', 'blitz', 'rapid', 'classical'];

// Rough average duration of one game, in seconds, per time class.
// Used to ESTIMATE playtime where the platform does not report it (chess.com).
// TODO(calibration): measure these from real game archives.
export const AVG_GAME_SECONDS = {
  bullet: 2 * 60,
  blitz: 7 * 60,
  rapid: 20 * 60,
  classical: 50 * 60,
};

export function estimatePlaytimeSeconds(perfs) {
  let total = 0;
  for (const tc of TIME_CLASSES) {
    const p = perfs[tc];
    if (p) total += p.games * AVG_GAME_SECONDS[tc];
  }
  return total;
}
