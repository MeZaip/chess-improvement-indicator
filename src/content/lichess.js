// lichess.org/@/<username>
CII.run({
  platform: 'lichess',
  getUsername(loc) {
    const m = loc.pathname.match(/^\/@\/([A-Za-z0-9_-]{2,30})(?:\/|$)/);
    return m ? m[1] : null;
  },
  // Most specific first. If none matches, the badge floats bottom-right.
  anchorSelectors: [
    '.user-show .user-show__header',
    '.user-show .box__top',
    '.user-show',
  ],
});
