/**
 * Centralized API configuration and timeout settings
 * All times in milliseconds
 */

export const API_CONFIG = {
  // Global timeout for all requests (30 seconds for Vercel)
  GLOBAL_TIMEOUT: 30000,

  // Specific endpoint timeouts
  ENDPOINTS: {
    // Auth endpoints - faster (network auth)
    'POST /api/auth/register': 10000,
    'POST /api/auth/signin': 10000,
    'POST /api/auth/verify-pin': 8000,

    // Payment endpoints - longer (payment gateway processing)
    'POST /api/checkout': 25000,
    'POST /api/payment/initiate': 20000,
    'POST /api/payment/webhook': 15000,

    // Withdrawal endpoints
    'POST /api/withdraw': 20000,
    'GET /api/withdraw/history': 10000,

    // Dashboard data
    'GET /api/dashboard/stats': 10000,
    'GET /api/dashboard/nodes': 10000,
    'GET /api/dashboard/transactions': 12000,

    // User operations
    'POST /api/user/update-profile': 8000,
    'POST /api/user/change-password': 8000,
    'POST /api/user/setup-pin': 8000,
  } as Record<string, number>,

  // Retry configuration
  RETRIES: {
    MAX_ATTEMPTS: 3, // Total attempts (1 initial + 2 retries)
    INITIAL_BACKOFF: 500, // 500ms
    MAX_BACKOFF: 5000, // 5s
    BACKOFF_MULTIPLIER: 2, // Exponential: 500ms, 1s, 2s, 4s, etc.

    // Don't retry these status codes
    NO_RETRY_STATUSES: [400, 401, 403, 404, 409, 422],

    // Do retry these status codes
    RETRY_STATUSES: [408, 429, 500, 502, 503, 504],
  },

  // Rate limiting
  RATE_LIMIT: {
    ENABLED: true,
    REQUESTS_PER_MINUTE: 60,
    // Storage key for tracking in-flight requests
    STORAGE_KEY: 'api_rate_limit',
  },
};

/**
 * Get timeout for a specific endpoint
 */
export function getEndpointTimeout(method: string, path: string): number {
  const key = `${method} ${path}`;
  return API_CONFIG.ENDPOINTS[key] || API_CONFIG.GLOBAL_TIMEOUT;
}

/**
 * Calculate backoff time for retry
 */
export function calculateBackoff(attempt: number): number {
  const { INITIAL_BACKOFF, MAX_BACKOFF, BACKOFF_MULTIPLIER } = API_CONFIG.RETRIES;
  const backoff = INITIAL_BACKOFF * Math.pow(BACKOFF_MULTIPLIER, attempt);
  return Math.min(backoff, MAX_BACKOFF);
}

/**
 * Check if a status code should be retried
 */
export function shouldRetry(statusCode: number): boolean {
  const { NO_RETRY_STATUSES, RETRY_STATUSES } = API_CONFIG.RETRIES;
  
  if (NO_RETRY_STATUSES.includes(statusCode)) {
    return false;
  }
  
  if (RETRY_STATUSES.includes(statusCode)) {
    return true;
  }

  // Don't retry 2xx or 3xx
  if (statusCode >= 200 && statusCode < 400) {
    return false;
  }

  // Retry other 5xx errors
  return statusCode >= 500;
}
