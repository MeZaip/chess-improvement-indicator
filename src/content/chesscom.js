// www.chess.com/member/<username>
CII.run({
  platform: 'chesscom',
  getUsername(loc) {
    const m = loc.pathname.match(/^\/member\/([A-Za-z0-9_-]{3,25})(?:\/|$)/);
    return m ? m[1] : null;
  },
  // chess.com markup changes often; if none matches, the badge floats.
  anchorSelectors: [
    '.profile-card-username',
    '.profile-header-info',
    '.cc-user-username-component',
  ],
});
