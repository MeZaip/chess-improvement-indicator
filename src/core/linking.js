// Cross-platform accounts.
//
// A Lichess profile can contain links (profile.links) and a bio; many players
// put their chess.com profile there. That is the only signal we trust:
//
//   confirmed – the Lichess profile links to chess.com/member/<name>
//   possible  – an account with the same username exists on the other site,
//               but nothing ties the two together → shown, NOT counted
//
// The same rule is applied when building the calibration sample
// (tools/link.js), so the baseline and the indicator count the same thing.

const CHESSCOM_RE = /chess\.com\/(?:member|players)\/([A-Za-z0-9_-]{3,25})/gi;

/** chess.com usernames (lowercase) mentioned in a Lichess profile. */
export function chesscomLinksFromLichessProfile(profile) {
  const text = `${profile?.links ?? ''}\n${profile?.bio ?? ''}`;
  return [...new Set([...text.matchAll(CHESSCOM_RE)].map((m) => m[1].toLowerCase()))];
}

/** The single chess.com account a Lichess profile points to, or null if none/ambiguous. */
export function linkedChesscomName(profile) {
  const names = chesscomLinksFromLichessProfile(profile);
  return names.length === 1 ? names[0] : null;
}

/** Does this Lichess profile confirm ownership of chess.com/member/<name>? */
export function lichessConfirmsChesscom(profile, chesscomName) {
  return chesscomLinksFromLichessProfile(profile).includes(chesscomName.toLowerCase());
}
