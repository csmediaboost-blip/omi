// lib/usePageCache.ts — Universal hook for cached page data fetching

import { useEffect, useState, useCallback } from 'react';
import { cacheService } from './cache-service';

/**
 * Hook for fetching and caching page data with automatic instant loading
 * @param key Cache key (e.g., "user-profile-123")
 * @param fetcher Async function to fetch data
 * @param options Configuration options
 */
export function usePageCache<T>(
  key: string,
  fetcher: () => Promise<T>,
  options?: {
    ttl?: number; // Cache time-to-live in ms (default: 5 mins)
    immediate?: boolean; // Start fetching immediately (default: true)
  }
) {
  const [data, setData] = useState<T | null>(() => {
    // Immediately return cached data if available
    return cacheService.getImmediate(key);
  });
  const [loading, setLoading] = useState(data === null);
  const [error, setError] = useState<Error | null>(null);
  const [isStale, setIsStale] = useState(false);

  const refetch = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      setIsStale(false);
      const result = await cacheService.get(key, fetcher, options?.ttl);
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
      setIsStale(true);
    } finally {
      setLoading(false);
    }
  }, [key, fetcher, options?.ttl]);

  // Fetch data on mount if immediate option is true
  useEffect(() => {
    if (options?.immediate !== false) {
      refetch();
    }
  }, [refetch, options?.immediate]);

  return { data, loading, error, isStale, refetch };
}

/**
 * Invalidate cache for a specific key
 */
export function invalidatePageCache(key: string) {
  cacheService.invalidate(key);
}

/**
 * Invalidate all cache matching a pattern
 */
export function invalidatePageCachePattern(pattern: string) {
  cacheService.invalidatePattern(pattern);
}
