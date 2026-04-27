/**
 * Standardized API Response Handler
 * Ensures consistent error handling, logging, and response formatting across all API endpoints
 */

import { NextResponse } from 'next/server';

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: Record<string, any>;
    retryable?: boolean;
  };
  timestamp: string;
  requestId?: string;
}

export interface ApiErrorOptions {
  status?: number;
  code?: string;
  details?: Record<string, any>;
  retryable?: boolean;
  cause?: Error;
}

/**
 * Generate a unique request ID for tracking
 */
function generateRequestId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Successful response helper
 */
export function apiSuccess<T = any>(
  data: T,
  status: number = 200,
  requestId?: string
): NextResponse<ApiResponse<T>> {
  return NextResponse.json(
    {
      success: true,
      data,
      timestamp: new Date().toISOString(),
      requestId: requestId || generateRequestId(),
    },
    { status }
  );
}

/**
 * Error response helper with standardized format
 */
export function apiError(
  message: string,
  options: ApiErrorOptions = {}
): NextResponse<ApiResponse> {
  const {
    status = 500,
    code = 'INTERNAL_ERROR',
    details,
    retryable = false,
    cause,
  } = options;

  // Log the error with context
  console.error(`[API_ERROR] ${code}:`, {
    message,
    status,
    details,
    stack: cause?.stack,
    timestamp: new Date().toISOString(),
  });

  return NextResponse.json(
    {
      success: false,
      error: {
        code,
        message,
        details,
        retryable,
      },
      timestamp: new Date().toISOString(),
      requestId: generateRequestId(),
    },
    { status }
  );
}

/**
 * Validation error response (400)
 */
export function apiValidationError(
  message: string,
  details?: Record<string, any>
): NextResponse<ApiResponse> {
  return apiError(message, {
    status: 400,
    code: 'VALIDATION_ERROR',
    details,
    retryable: false,
  });
}

/**
 * Authentication error response (401)
 */
export function apiAuthError(message: string = 'Authentication required'): NextResponse<ApiResponse> {
  return apiError(message, {
    status: 401,
    code: 'AUTHENTICATION_ERROR',
    retryable: false,
  });
}

/**
 * Authorization error response (403)
 */
export function apiAuthorizationError(
  message: string = 'Insufficient permissions'
): NextResponse<ApiResponse> {
  return apiError(message, {
    status: 403,
    code: 'AUTHORIZATION_ERROR',
    retryable: false,
  });
}

/**
 * Not found error response (404)
 */
export function apiNotFoundError(resource: string): NextResponse<ApiResponse> {
  return apiError(`${resource} not found`, {
    status: 404,
    code: 'NOT_FOUND',
    retryable: false,
  });
}

/**
 * Conflict error response (409) - for duplicate entries, state conflicts
 */
export function apiConflictError(
  message: string,
  details?: Record<string, any>
): NextResponse<ApiResponse> {
  return apiError(message, {
    status: 409,
    code: 'CONFLICT',
    details,
    retryable: false,
  });
}

/**
 * Rate limit error response (429)
 */
export function apiRateLimitError(
  retryAfterSeconds: number = 60
): NextResponse<ApiResponse> {
  const response = apiError('Too many requests. Please try again later.', {
    status: 429,
    code: 'RATE_LIMITED',
    details: { retryAfterSeconds },
    retryable: true,
  });
  
  // Add Retry-After header for standard rate limit handling
  response.headers.set('Retry-After', String(retryAfterSeconds));
  return response;
}

/**
 * Server error response (500) with optional retry info
 */
export function apiServerError(
  message: string = 'Internal server error',
  options: Omit<ApiErrorOptions, 'status' | 'code'> = {}
): NextResponse<ApiResponse> {
  return apiError(message, {
    status: 500,
    code: 'SERVER_ERROR',
    retryable: true,
    ...options,
  });
}

/**
 * Service unavailable error response (503) - for timeouts, external API failures
 */
export function apiServiceUnavailableError(
  service: string,
  retryAfterSeconds: number = 30
): NextResponse<ApiResponse> {
  const response = apiError(`${service} service temporarily unavailable`, {
    status: 503,
    code: 'SERVICE_UNAVAILABLE',
    details: { service, retryAfterSeconds },
    retryable: true,
  });

  response.headers.set('Retry-After', String(retryAfterSeconds));
  return response;
}

/**
 * Request timeout error (504)
 */
export function apiTimeoutError(
  service: string = 'External service'
): NextResponse<ApiResponse> {
  return apiError(`${service} request timeout`, {
    status: 504,
    code: 'TIMEOUT',
    details: { service },
    retryable: true,
  });
}

/**
 * Wrap async function with automatic error handling
 */
export async function withErrorHandling<T>(
  handler: () => Promise<NextResponse<ApiResponse<T>>>,
  fallbackStatus: number = 500
): Promise<NextResponse<ApiResponse<T>>> {
  try {
    return await handler();
  } catch (error: any) {
    console.error('[UNHANDLED_ERROR]', error);
    return apiServerError(
      process.env.NODE_ENV === 'development' 
        ? error.message 
        : 'An unexpected error occurred',
      { cause: error }
    );
  }
}

/**
 * Create timeout promise for external API calls
 */
export function createTimeoutPromise<T>(
  timeoutMs: number,
  timeoutError: string = 'Operation timeout'
): Promise<T> {
  return new Promise((_, reject) =>
    setTimeout(() => reject(new Error(timeoutError)), timeoutMs)
  );
}

/**
 * Race a promise against a timeout
 */
export async function raceWithTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number
): Promise<T> {
  return Promise.race([
    promise,
    createTimeoutPromise<T>(timeoutMs),
  ]);
}
