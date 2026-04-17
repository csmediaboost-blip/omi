/**
 * User-friendly error message mapping
 * Converts technical errors to helpful user messages
 */

export interface UserFacingError {
  message: string;
  code: string;
  retryable: boolean;
  action?: string;
}

/**
 * Maps API errors to user-friendly messages
 */
export function getUserFacingError(error: any): UserFacingError {
  // Network errors
  if (!navigator.onLine || error.message?.includes("Network")) {
    return {
      message: "No internet connection. Please check your network and try again.",
      code: "NETWORK_ERROR",
      retryable: true,
      action: "Check your connection and retry",
    };
  }

  // 401 Unauthorized
  if (error.status === 401) {
    return {
      message: "Your session has expired. Please sign in again.",
      code: "UNAUTHORIZED",
      retryable: true,
      action: "Sign in again",
    };
  }

  // 403 Forbidden
  if (error.status === 403) {
    return {
      message: "You don't have permission to perform this action.",
      code: "FORBIDDEN",
      retryable: false,
      action: "Contact support if you believe this is an error",
    };
  }

  // 404 Not Found
  if (error.status === 404) {
    return {
      message: "The requested resource was not found.",
      code: "NOT_FOUND",
      retryable: false,
    };
  }

  // 429 Rate Limited
  if (error.status === 429) {
    return {
      message: "Too many requests. Please wait a moment and try again.",
      code: "RATE_LIMITED",
      retryable: true,
      action: "Wait and retry in a moment",
    };
  }

  // 500+ Server errors
  if (error.status && error.status >= 500) {
    return {
      message: "Server error. Our team has been notified. Please try again in a moment.",
      code: "SERVER_ERROR",
      retryable: true,
      action: "Retry after a moment",
    };
  }

  // Missing fields
  if (error.message?.includes("required")) {
    return {
      message: error.message || "Please fill in all required fields.",
      code: "VALIDATION_ERROR",
      retryable: false,
      action: "Review and fill in all required fields",
    };
  }

  // Default fallback
  return {
    message: error.message || "An unexpected error occurred. Please try again.",
    code: "UNKNOWN_ERROR",
    retryable: true,
    action: "Please try again",
  };
}

/**
 * Extract specific field error from validation response
 */
export function extractFieldError(error: any): Record<string, string> {
  const fieldErrors: Record<string, string> = {};

  if (error.response?.data?.errors) {
    // Handle validation errors from APIs
    Object.entries(error.response.data.errors).forEach(([field, messages]: [string, any]) => {
      fieldErrors[field] = Array.isArray(messages) ? messages[0] : messages;
    });
  }

  return fieldErrors;
}

/**
 * Check if error is retryable
 */
export function isRetryableError(error: any): boolean {
  const retryableCodes = [408, 429, 500, 502, 503, 504];
  return retryableCodes.includes(error.status);
}

/**
 * Format error for logging
 */
export function formatErrorForLogging(error: any): {
  message: string;
  stack?: string;
  context?: Record<string, any>;
} {
  return {
    message: error.message || String(error),
    stack: error.stack,
    context: {
      status: error.status,
      code: error.code,
      details: error.details,
    },
  };
}
