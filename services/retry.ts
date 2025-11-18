// services/retry.ts
export interface RetryOptions {
  maxRetries?: number;
  baseDelayMs?: number;
  retryableStatusCodes?: number[];
}

export async function callWithRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    maxRetries = 5,
    baseDelayMs = 300,
    retryableStatusCodes = [502, 503, 504, 429],
  } = options;

  // Strings that often indicate transient network errors (declared once)
  const transientStrings = ['ECONNRESET', 'ETIMEDOUT', 'ECONNABORTED', 'EAI_AGAIN'];

  const isTransientError = (err: any, status?: number) => {
    const code = err?.code;
    const message: string = String(err?.message ?? '');

    const byCode = code && transientStrings.includes(String(code));
    const byStatus = typeof status === 'number' && retryableStatusCodes.includes(status);
    const byMessage = /timeout|timed out|ECONNRESET|ETIMEDOUT|ECONNABORTED|EAI_AGAIN/i.test(message);

    return Boolean(byCode || byStatus || byMessage);
  };

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      // Try to extract HTTP/status information commonly found on errors
      const status = err?.response?.status ?? err?.statusCode ?? err?.status;
      const shouldRetry = isTransientError(err, status);

      // If we've exhausted attempts or the error isn't transient/retryable, rethrow with attempts info
      if (attempt === maxRetries || !shouldRetry) {
        // Attach attempts to the error for better diagnostics
        try {
          (err as any).attempts = attempt;
        } catch {
          // ignore if non-writable
        }
        throw err;
      }

      // Exponential backoff with jitter
      const exponential = Math.pow(2, attempt - 1);
      const jitter = Math.floor(Math.random() * baseDelayMs);
      const waitMs = exponential * baseDelayMs + jitter;

      await new Promise((resolve) => setTimeout(resolve, waitMs));
      // continue to next attempt
    }
  }

  throw new Error('Exceeded retry attempts');
}
