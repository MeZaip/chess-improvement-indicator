// Shared UI for all sites. Loaded as a classic content script before the
// site-specific script, exposes `globalThis.CII`.
// All external data goes through textContent (never innerHTML).

(() => {
  const BADGE_ID = 'cii-badge';

  // Labels and colours modelled on chess.com's move classification.
  // Thresholds chosen on the calibration sample: on Lichess roughly
  // blunder 6% · mistake 13% · inaccuracy 19% · good 30% · excellent 17% ·
  // best 11% · great 3% · brilliant 1%. Colours: change them here only.
  const TIERS = [
    { name: 'Blunder',    min: 0,    color: '#ca3431', text: '#fff' },
    { name: 'Mistake',    min: 0.4,  color: '#e58f2a', text: '#fff' },
    { name: 'Inaccuracy', min: 0.7,  color: '#f7c045', text: '#2b2b2b' },
    { name: 'Good',       min: 0.9,  color: '#95af8a', text: '#fff' },
    { name: 'Excellent',  min: 1.15, color: '#96bc4b', text: '#fff' },
    { name: 'Best',       min: 1.4,  color: '#81b64c', text: '#fff' },
    { name: 'Great',      min: 2,    color: '#5c8bb0', text: '#fff' },
    { name: 'Brilliant',  min: 3,    color: '#1baca6', text: '#fff' },
  ];

  function tier(ii) {
    if (ii == null) return null;
    return TIERS.filter((t) => ii >= t.min).at(-1);
  }

  function paint(node, t, { background }) {
    if (!t) return;
    if (background) {
      node.style.background = t.color;
      node.style.color = t.text;
    } else {
      node.style.color = t.color;
    }
  }

  function fmt(ii, { approx = false, capped = false } = {}) {
    if (ii == null) return '–';
    if (capped) return `≥${ii.toFixed(0)}x`;
    if (ii < 0.1) return '<0.1x';
    return `${approx ? '~' : ''}${ii.toFixed(2)}x`;
  }

  // 8394 → "8.4k", 950 → "950"
  function kGames(n) {
    return n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : String(Math.round(n));
  }

  function pct(p) {
    if (p > 0.99) return '>99%';
    if (p < 0.01) return '<1%';
    return `~${Math.round(p * 100)}%`;
  }

  // "other TCs: bullet 1965 × 0.3 + rapid 1918 × 0.05" (linked account marked)
  function effortText(parts) {
    const other = (p) => (p.linked ? ' (other site)' : '');
    return 'counted: ' + parts
      .map((p) => `${p.timeClass}${other(p)} ${p.games}` + (p.weight === 1 ? '' : ` × ${p.weight}`))
      .join(' + ');
  }

  // Short explanations shown under a time class when needed.
  function notes(c) {
    const out = [];
    if (c.flags?.belowStart) out.push('below the typical beginner level');
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
        (() => {
          const v = el('span', 'cii-val', c.status === 'ok' ? fmt(c.ii, { approx: c.flags.extrapolated || c.flags.beyondExperience, capped: c.capped }) : 'n/a');
          if (c.status === 'ok') {
            paint(v, tier(c.ii), { background: false });
            v.title =
              `Players with ~${kGames(c.effectiveGames)} games here are usually rated ~${Math.round(c.typical)}` +
              `${c.flags.beyondExperience ? ' (extrapolated – more games than anyone in our sample)' : ''}. ` +
              `Against them you would score ${pct(c.expectedScore)}.`;
            v.style.cursor = 'help';
          }
          return v;
        })(),
        el(
          'span',
          'cii-meta',
          c.status === 'ok'
            ? `${c.rating} · ${c.games} games` +
                (c.effectiveGames > c.games ? ` (+${Math.round(c.effectiveGames - c.games)} weighted from other TCs)` : '')
            : `${c.rating} · ${c.games} games · needs ≥30 non-provisional games`,
        ),
      );
      box.append(row);
      if (c.status === 'ok' && c.effortParts?.length) box.append(el('div', 'cii-note', effortText(c.effortParts)));
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
    const legend = el('div', 'cii-legend');
    for (const [i, t] of TIERS.entries()) {
      const next = TIERS[i + 1];
      const chip = el('span', 'cii-chip', i === 0 ? `<${next.min}x` : next ? `${t.min}–${next.min}x` : `≥${t.min}x`);
      paint(chip, t, { background: true });
      legend.append(chip);
    }
    const approx = report.classes.some((c) => c.status === 'ok' && (c.flags.extrapolated || c.flags.beyondExperience));
    box.append(
      legend,
      ...(approx ? [el('div', 'cii-foot', '~ estimate: rating rarer, or more games, than anyone in our sample')] : []),
      el('div', 'cii-foot', 'ii: how far you climbed vs. the median player with the same experience on this site (1.00x = typical). Hover a value for details.'),
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

  function setContent(badge, label, cls, title, t = null) {
    badge.replaceChildren();
    badge.className = `cii-badge ${cls}${badge.classList.contains('cii-floating') ? ' cii-floating' : ''}`;
    badge.style.background = '';
    badge.style.color = '';
    badge.append(el('span', 'cii-label', 'ii'), el('span', 'cii-main', label));
    if (t) paint(badge, t, { background: true });
    badge.title = title ?? '';
  }

  function renderLoading(anchor) {
    closeDetails();
    currentReport = null;
    setContent(getOrCreateBadge(anchor), '…', 'cii-loading', 'Improvement indicator: loading');
  }

  function renderError(anchor, error) {
    closeDetails();
    currentReport = null;
    const msg = { not_found: 'user not found', rate_limited: 'rate limited, try later', closed: 'account closed' }[error] ?? 'error';
    setContent(getOrCreateBadge(anchor), '!', 'cii-error', `Improvement indicator: ${msg}`);
  }

  function renderReport(anchor, report) {
    const badge = getOrCreateBadge(anchor);
    const hasData = report.overall != null;
    const approx = report.classes.some((c) => c.status === 'ok' && (c.flags.extrapolated || c.flags.beyondExperience));
    const t = tier(report.overall);
    setContent(
      badge,
      hasData ? fmt(report.overall, { approx }) : 'n/a',
      hasData ? '' : 'cii-none',
      hasData ? 'Improvement vs. players with the same experience (click for details)' : 'Not enough rated games yet',
      t,
    );
    closeDetails();
    currentReport = report;
    if (!badge.dataset.ciiBound) {
      // capture phase + preventDefault: works even if the site wraps the
      // badge in a link or handles clicks on the profile header itself
      badge.addEventListener('click', onBadgeClick, true);
      badge.dataset.ciiBound = '1';
    }
  }

  // --- details popover --------------------------------------------------
  // Lives directly on <body> with position: fixed, so no site container
  // (overflow: hidden, transforms, stacking contexts) can clip or hide it.
  const DETAILS_ID = 'cii-details';
  let currentReport = null;

  function onBadgeClick(e) {
    e.preventDefault();
    e.stopPropagation();
    if (document.getElementById(DETAILS_ID)) closeDetails();
    else if (currentReport) openDetails(e.currentTarget, currentReport);
  }

  function openDetails(badge, report) {
    const box = buildDetails(report);
    box.id = DETAILS_ID;
    box.style.visibility = 'hidden';
    document.body.append(box);
    positionDetails(badge, box);
    box.style.visibility = '';
    box.addEventListener('click', (e) => e.stopPropagation());
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', closeDetails, { passive: true, capture: true });
    window.addEventListener('resize', closeDetails);
    // deferred so the click that opened the panel doesn't close it again
    setTimeout(() => document.addEventListener('click', closeDetails));
  }

  function positionDetails(badge, box) {
    const r = badge.getBoundingClientRect();
    const w = box.offsetWidth;
    const h = box.offsetHeight;
    const left = Math.min(Math.max(8, r.left), window.innerWidth - w - 8);
    const below = r.bottom + 6;
    const top = below + h <= window.innerHeight - 8 ? below : Math.max(8, r.top - h - 6);
    box.style.left = `${left}px`;
    box.style.top = `${top}px`;
  }

  function onKey(e) {
    if (e.key === 'Escape') closeDetails();
  }

  function closeDetails() {
    document.getElementById(DETAILS_ID)?.remove();
    document.removeEventListener('click', closeDetails);
    document.removeEventListener('keydown', onKey);
    window.removeEventListener('scroll', closeDetails, { capture: true });
    window.removeEventListener('resize', closeDetails);
  }

  function removeBadge() {
    closeDetails();
    currentReport = null;
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
