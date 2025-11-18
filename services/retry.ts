export type RetryOptions = {
  maxRetries?: number;        // total retry attempts (default 5)
  baseDelayMs?: number;       // base delay in ms for backoff (default 300)
  retryableStatusCodes?: number[]; // additional codes to treat as retryable
};

const DEFAULT_OPTIONS: Required<RetryOptions> = {
  maxRetries: 5,
  baseDelayMs: 300,
  retryableStatusCodes: []
};

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isTransientError(err: any, extraRetryable: number[]) {
  const status =
    err?.status ||
    err?.code ||
    err?.response?.status ||
    err?.response?.statusCode ||
    (typeof err?.status === 'string' ? parseInt(err.status, 10) : undefined);

  const transientCodes = [429, 503, ...extraRetryable];

  if (status && transientCodes.includes(Number(status))) return true;

  const transientStrings = ['ECONNRESET', 'ETIMEDOUT', 'ECONNABORTED', 'EAI_AGAIN'];
  if (err?.code && transientStrings.includes(String(err.code))) return true;

  const msg = String(err?.message || '').toLowerCase();
  if (msg.includes('overloaded') || msg.includes('unavailable') || msg.includes('rate limit')) return true;

  return false;
}

export async function callWithRetry<T>(fn: () => Promise<T>, options?: RetryOptions): Promise<T> {
  const opts = { ...DEFAULT_OPTIONS, ...(options || {}) };
  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      const isLastAttempt = attempt === opts.maxRetries;
      const retryAfterHeader = err?.response?.headers?.['retry-after'] || err?.response?.headers?.['Retry-After'] || err?.headers?.['retry-after'] || err?.headers?.['Retry-After'];
      const shouldRetry = isTransientError(err, opts.retryableStatusCodes);

      if (!shouldRetry || isLastAttempt) {
        try { err.attempts = attempt + 1; } catch (_) {}
        throw err;
      }

      let retryAfterMs = 0;
      if (retryAfterHeader) {
        const parsed = parseFloat(String(retryAfterHeader));
        if (!isNaN(parsed)) retryAfterMs = parsed * 1000;
      }

      const exponential = opts.baseDelayMs * Math.pow(2, attempt);
      const jitter = Math.random() * exponential;
      const waitMs = Math.max(exponential + jitter, retryAfterMs || 0);

      console.warn(`Transient error encountered; retrying attempt ${attempt + 1}/${opts.maxRetries} after ${Math.round(waitMs)}ms.`, err?.message || err);

      await delay(waitMs);
    }
  }

  throw new Error('Exceeded retry attempts');
}
