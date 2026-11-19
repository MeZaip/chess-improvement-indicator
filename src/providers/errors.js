export class ProviderError extends Error {
  /** @param {'not_found'|'rate_limited'|'closed'|'http'} code */
  constructor(code, message) {
    super(message ?? code);
    this.code = code;
  }
}

export function checkResponse(res) {
  if (res.status === 404) throw new ProviderError('not_found');
  if (res.status === 429) throw new ProviderError('rate_limited');
  if (!res.ok) throw new ProviderError('http', `HTTP ${res.status}`);
  return res;
}
