// www.chess.com/member/<username>
CII.run({
  platform: 'chesscom',
  getUsername(loc) {
    const m = loc.pathname.match(/^\/member\/([A-Za-z0-9_-]{3,25})(?:\/|$)/);
    return m ? m[1] : null;
  },
  // chess.com markup changes often; if none matches, the badge floats.
  // Checked Nov 2026: the row with title · username · flag. Not the username
  // element itself – it (and its parent) have overflow: hidden.
  anchorSelectors: [
    '.profile-header-user-info .profile-card-user-block',
    '.profile-header-user-info',
  ],
});
