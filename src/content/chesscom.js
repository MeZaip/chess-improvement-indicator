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
  // The public API can lag hours behind, the profile page doesn't: read the
  // ratings from the rating cards (links /member/<user>/stats/<time class>,
  // language-independent). Checked Nov 2026.
  async getPageRatings(username) {
    await CII.waitForAny(['a.overview-stats-item-component'], 3000);
    const out = {};
    for (const a of document.querySelectorAll('a.overview-stats-item-component')) {
      const parts = new URL(a.getAttribute('href') ?? '', location.origin).pathname.split('/').filter(Boolean);
      if (parts[0] !== 'member' || parts[1]?.toLowerCase() !== username.toLowerCase() || parts[2] !== 'stats') continue;
      const tc = parts[3];
      const rating = Number.parseInt(a.querySelector('.overview-stats-item-rating')?.textContent.trim() ?? '', 10);
      if (['bullet', 'blitz', 'rapid'].includes(tc) && Number.isInteger(rating)) out[tc] = rating;
    }
    return Object.keys(out).length ? out : null;
  },
});
