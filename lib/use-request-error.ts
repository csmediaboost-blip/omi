import { useCallback } from 'react';

export interface ApiErrorResponse {
  success: false;
  error: string;
  code: string;
  status: number;
  details?: Record<string, any>;
  retryAfter?: number;
}

export interface ApiSuccessResponse<T = any> {
  success: true;
  data: T;
  status: number;
}

/**
 * Hook for making API requests with standardized error handling
 * Automatically retries on network errors (max 3 attempts)
 * Handles timeout (30s max), rate limits, and auth errors gracefully
 */
export function useRequestError() {
  const makeRequest = useCallback(
    async (
      url: string,
      options?: RequestInit & {
        timeout?: number;
        retries?: number;
      }
    ): Promise<ApiSuccessResponse | ApiErrorResponse> => {
      const {
        timeout = 30000, // 30 second default timeout
        retries = 2, // 2 retries = 3 attempts total
        ...fetchOptions
      } = options || {};

      let lastError: any;

      for (let attempt = 0; attempt <= retries; attempt++) {
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), timeout);

          const response = await fetch(url, {
            ...fetchOptions,
            signal: controller.signal,
          });

          clearTimeout(timeoutId);

          const data: ApiErrorResponse | ApiSuccessResponse =
            await response.json();

          // If successful, return immediately
          if (response.ok && data.success) {
            return data as ApiSuccessResponse;
          }

          // If error, check if retryable
          if (!response.ok) {
            const errorData = data as ApiErrorResponse;

            // 429 = Rate limited, retry with backoff
            if (response.status === 429 && attempt < retries) {
              const backoffMs = (errorData.retryAfter || 1) * 1000 * (attempt + 1);
              console.log(
                `[API] Rate limited. Retrying in ${backoffMs}ms (attempt ${attempt + 1}/${retries})`
              );
              await new Promise((r) => setTimeout(r, backoffMs));
              continue;
            }

            // 5xx = Server error, retry
            if (response.status >= 500 && attempt < retries) {
              const backoffMs = 1000 * Math.pow(2, attempt); // exponential backoff
              console.log(
                `[API] Server error. Retrying in ${backoffMs}ms (attempt ${attempt + 1}/${retries})`
              );
              await new Promise((r) => setTimeout(r, backoffMs));
              continue;
            }

            return errorData;
          }

          return data as ApiSuccessResponse;
        } catch (err: any) {
          lastError = err;

          // Network error or timeout, retry
          if (
            err instanceof TypeError ||
            err.name === 'AbortError' ||
            err.message.includes('network')
          ) {
            if (attempt < retries) {
              const backoffMs = 500 * Math.pow(2, attempt);
              console.log(
                `[API] Network error. Retrying in ${backoffMs}ms (attempt ${attempt + 1}/${retries})`
              );
              await new Promise((r) => setTimeout(r, backoffMs));
              continue;
            }
          }

          // Not retryable, throw
          throw err;
        }
      }

      // All retries exhausted
      if (lastError?.name === 'AbortError') {
        return {
          success: false,
          error: `Request timeout after ${timeout}ms. Please check your connection and try again.`,
          code: 'TIMEOUT',
          status: 408,
          details: { timeout },
        } as ApiErrorResponse;
      }

      return {
        success: false,
        error:
          lastError?.message ||
          'Network error. Please check your connection and try again.',
        code: 'NETWORK_ERROR',
        status: 0,
        details: { cause: lastError },
      } as ApiErrorResponse;
    },
    []
  );

  return { makeRequest };
}
