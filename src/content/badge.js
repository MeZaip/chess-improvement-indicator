// Shared UI for all sites. Loaded as a classic content script before the
// site-specific script, exposes `globalThis.CII`.
// All external data goes through textContent (never innerHTML).

(() => {
  const BADGE_ID = 'cii-badge';

  function tier(ii) {
    if (ii == null) return 'none';
    if (ii < 0.75) return 'low';
    if (ii < 1.25) return 'avg';
    if (ii < 2) return 'good';
    return 'great';
  }

  function fmt(ii) {
    if (ii == null) return '–';
    if (ii < 0.1) return '<0.1x';
    return `${ii.toFixed(2)}x`;
  }

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function buildDetails(report) {
    const box = el('div', 'cii-details');
    for (const c of report.classes) {
      const row = el('div', 'cii-row');
      row.append(
        el('span', 'cii-tc', c.timeClass),
        el('span', `cii-val cii-${tier(c.ii)}`, c.status === 'ok' ? fmt(c.ii) : 'n/a'),
        el('span', 'cii-meta', `${c.rating} · ${c.games} games · avg ${Math.round(c.expectedRating)}`),
      );
      box.append(row);
    }
    const pt = report.playtime;
    box.append(
      el('div', 'cii-foot', `${Math.round(pt.hours)}h playtime${pt.estimated ? ' (estimated)' : ''}`),
      el('div', 'cii-foot', `baseline: ${report.baselineVersion}`),
    );
    return box;
  }

  function getOrCreateBadge(anchor) {
    let badge = document.getElementById(BADGE_ID);
    if (!badge) {
      badge = el('span');
      badge.id = BADGE_ID;
    }
    if (anchor) {
      badge.classList.remove('cii-floating');
      if (badge.parentElement !== anchor) anchor.append(badge);
    } else {
      badge.classList.add('cii-floating');
      if (!badge.isConnected) document.body.append(badge);
    }
    return badge;
  }

  function setContent(badge, label, cls, title) {
    badge.replaceChildren();
    badge.className = `cii-badge ${cls}${badge.classList.contains('cii-floating') ? ' cii-floating' : ''}`;
    badge.append(el('span', 'cii-label', 'ii'), el('span', 'cii-main', label));
    badge.title = title ?? '';
  }

  function renderLoading(anchor) {
    setContent(getOrCreateBadge(anchor), '…', 'cii-loading', 'Improvement indicator: loading');
  }

  function renderError(anchor, error) {
    const msg = { not_found: 'user not found', rate_limited: 'rate limited, try later', closed: 'account closed' }[error] ?? 'error';
    setContent(getOrCreateBadge(anchor), '!', 'cii-error', `Improvement indicator: ${msg}`);
  }

  function renderReport(anchor, report) {
    const badge = getOrCreateBadge(anchor);
    const hasData = report.overall != null;
    setContent(
      badge,
      hasData ? fmt(report.overall) : 'n/a',
      `cii-${tier(report.overall)}`,
      hasData ? 'Improvement vs. average player (click for details)' : 'Not enough rated games yet',
    );
    const details = buildDetails(report);
    details.hidden = true;
    badge.append(details);
    badge.onclick = (e) => {
      e.stopPropagation();
      details.hidden = !details.hidden;
    };
  }

  function removeBadge() {
    document.getElementById(BADGE_ID)?.remove();
  }

  function requestReport(platform, username) {
    return chrome.runtime.sendMessage({ type: 'getReport', platform, username });
  }

  /** Find the first selector that matches, waiting up to `timeoutMs` (SPAs render late). */
  function waitForAny(selectors, timeoutMs = 4000) {
    const find = () => selectors.map((s) => document.querySelector(s)).find(Boolean) ?? null;
    return new Promise((resolve) => {
      const found = find();
      if (found) return resolve(found);
      const obs = new MutationObserver(() => {
        const f = find();
        if (f) { obs.disconnect(); resolve(f); }
      });
      obs.observe(document.body, { childList: true, subtree: true });
      setTimeout(() => { obs.disconnect(); resolve(find()); }, timeoutMs);
    });
  }

  /**
   * Generic driver: on every URL change, extract a username; if present,
   * fetch the report and render it next to the first matching anchor
   * (or as a floating badge if the site layout changed).
   */
  function run({ platform, getUsername, anchorSelectors }) {
    let current = null;

    async function update() {
      const username = getUsername(location);
      if (username === current) return;
      current = username;
      if (!username) return removeBadge();

      const anchor = await waitForAny(anchorSelectors);
      if (current !== username) return; // navigated away meanwhile
      renderLoading(anchor);
      try {
        const res = await requestReport(platform, username);
        if (current !== username) return;
        res.ok ? renderReport(anchor, res.report) : renderError(anchor, res.error);
      } catch (e) {
        renderError(anchor, 'error');
      }
    }

    update();
    // Both sites do client-side navigation; polling the URL is the simplest
    // robust way to notice it from an isolated content script.
    setInterval(update, 1000);
  }

  globalThis.CII = { run };
})();
