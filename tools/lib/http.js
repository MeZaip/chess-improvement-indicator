// Polite sequential HTTP client: one request at a time, minimum spacing,
// backs off on 429 and retries transient failures.
// Both Lichess and chess.com ask API users to NOT make parallel requests.

export const USER_AGENT =
  'chess-improvement-indicator-calibration/0.1 (+https://github.com/MeZaip/chess-improvement-indicator)';

const defaultSleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Thrown when the server keeps answering 429: stop and come back later. */
export class RateLimitedError extends Error {
  constructor(url) {
    super(`still rate limited after several waits (${new URL(url).host}) – wait ~30 min and run again`);
    this.code = 'rate_limited';
  }
}

export function createClient({
  minIntervalMs = 300,
  rateLimitWaitMs = 60_000,
  maxAttempts = 5,
  authToken = null, // optional Bearer token (e.g. a Lichess personal token → higher limits)
  fetchImpl = globalThis.fetch,
  sleep = defaultSleep,
  log = (m) => console.error(m),
} = {}) {
  let last = 0;
  const auth = authToken ? { Authorization: `Bearer ${authToken}` } : {};

  async function request(url, init = {}) {
    for (let attempt = 1; ; attempt++) {
      const wait = last + minIntervalMs - Date.now();
      if (wait > 0) await sleep(wait);
      last = Date.now();

      let res;
      try {
        res = await fetchImpl(url, { ...init, headers: { 'User-Agent': USER_AGENT, ...auth, ...init.headers } });
      } catch (err) {
        if (attempt >= maxAttempts) throw err;
        log(`network error (${err.message}), retry ${attempt}/${maxAttempts}`);
        await sleep(2000 * attempt);
        continue;
      }

      if (res.status === 429) {
        if (attempt >= maxAttempts) throw new RateLimitedError(url);
        // honour Retry-After (seconds) when the server sends it
        const retryAfter = Number(res.headers?.get?.('retry-after'));
        const waitMs = Number.isFinite(retryAfter) && retryAfter > 0 ? Math.max(retryAfter * 1000, rateLimitWaitMs) : rateLimitWaitMs;
        log(`429 rate limited – waiting ${Math.round(waitMs / 1000)}s (attempt ${attempt}/${maxAttempts})`);
        await sleep(waitMs);
        continue;
      }
      if (res.status >= 500 && attempt < maxAttempts) {
        log(`HTTP ${res.status}, retry ${attempt}/${maxAttempts}`);
        await sleep(3000 * attempt);
        continue;
      }
      return res;
    }
  }

  return { request };
}
