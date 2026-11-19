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

  function fmt(ii, { approx = false, capped = false } = {}) {
    if (ii == null) return '–';
    if (capped) return `≥${ii.toFixed(0)}x`;
    if (ii < 0.1) return '<0.1x';
    return `${approx ? '~' : ''}${ii.toFixed(2)}x`;
  }

  // Short explanations shown under a time class when needed.
  function notes(c) {
    const out = [];
    if (c.flags?.belowStart) out.push('below the typical beginner level');
    if (c.flags?.extrapolated) out.push('very rare rating – the value is an estimate');
    if (c.flags?.beyondExperience) out.push('more games than anyone in our sample – compared with the most experienced players');
    if (c.capped) out.push('capped at 20x');
    return out;
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
        el(
          'span',
          `cii-val cii-${tier(c.ii)}`,
          c.status === 'ok' ? fmt(c.ii, { approx: c.flags.extrapolated, capped: c.capped }) : 'n/a',
        ),
        el(
          'span',
          'cii-meta',
          c.status === 'ok'
            ? `${c.rating} · ${c.games} games` +
                (c.effectiveGames > c.games ? ` (+${Math.round(c.effectiveGames - c.games)} other TCs)` : '') +
                ` · typical ${Math.round(c.typical)} · scores ~${Math.round(c.expectedScore * 100)}% vs typical`
            : `${c.rating} · ${c.games} games · needs ≥30 non-provisional games`,
        ),
      );
      box.append(row);
      for (const n of c.status === 'ok' ? notes(c) : []) box.append(el('div', 'cii-note', n));
    }
    const pt = report.playtime;
    const ln = report.linked;
    if (ln) {
      const site = ln.platform === 'chesscom' ? 'chess.com' : 'lichess';
      box.append(
        el(
          'div',
          ln.counted ? 'cii-link' : 'cii-link cii-link-possible',
          ln.counted
            ? `✓ includes ${ln.games} games from ${site}/${ln.username} (linked in Lichess profile)`
            : `? ${site}/${ln.username} has the same name (${ln.games} games) – not counted: ` +
                'add the chess.com profile link to the Lichess profile to merge',
        ),
      );
    }
    box.append(
      el('div', 'cii-foot', 'ii: how far you climbed vs. a typical player with the same experience (1.00x = typical)'),
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
    const approx = report.classes.some((c) => c.status === 'ok' && c.flags.extrapolated);
    setContent(
      badge,
      hasData ? fmt(report.overall, { approx }) : 'n/a',
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
