// lib/cache-service.ts — Client-side data caching for instant loads

import React from 'react';

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number; // Time to live in milliseconds
}

class CacheService {
  private cache = new Map<string, CacheEntry<any>>();
  private pendingRequests = new Map<string, Promise<any>>();

  /**
   * Get cached data or fetch if expired
   * @param key Cache key
   * @param fetcher Function to fetch data
   * @param ttl Time to live in milliseconds (default: 5 minutes)
   */
  async get<T>(
    key: string,
    fetcher: () => Promise<T>,
    ttl: number = 5 * 60 * 1000,
  ): Promise<T> {
    // If request is in progress, return the pending promise (dedup)
    if (this.pendingRequests.has(key)) {
      return this.pendingRequests.get(key)!;
    }

    // Check if cache is valid
    const entry = this.cache.get(key);
    if (entry && Date.now() - entry.timestamp < entry.ttl) {
      return entry.data;
    }

    // Fetch new data
    const promise = fetcher().then((data) => {
      this.cache.set(key, { data, timestamp: Date.now(), ttl });
      this.pendingRequests.delete(key);
      return data;
    }).catch((error) => {
      this.pendingRequests.delete(key);
      // Return stale cache on error if available
      if (entry) {
        console.warn(`[v0] Cache fetch failed for ${key}, using stale data:`, error);
        return entry.data;
      }
      throw error;
    });

    this.pendingRequests.set(key, promise);
    return promise;
  }

  /**
   * Get cached data immediately without fetching
   */
  getImmediate<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (entry && Date.now() - entry.timestamp < entry.ttl) {
      return entry.data;
    }
    return null;
  }

  /**
   * Set cache manually
   */
  set<T>(key: string, data: T, ttl: number = 5 * 60 * 1000): void {
    this.cache.set(key, { data, timestamp: Date.now(), ttl });
  }

  /**
   * Invalidate cache entry
   */
  invalidate(key: string): void {
    this.cache.delete(key);
  }

  /**
   * Invalidate all cache entries matching a pattern
   */
  invalidatePattern(pattern: string): void {
    for (const key of this.cache.keys()) {
      if (key.includes(pattern)) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Clear all cache
   */
  clear(): void {
    this.cache.clear();
    this.pendingRequests.clear();
  }
}

// Singleton instance
export const cacheService = new CacheService();

/**
 * Hook for using cache in React components
 */
export function useCachedData<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttl?: number,
) {
  const [data, setData] = React.useState<T | null>(
    () => cacheService.getImmediate(key),
  );
  const [loading, setLoading] = React.useState(data === null);
  const [error, setError] = React.useState<Error | null>(null);

  React.useEffect(() => {
    let mounted = true;

    cacheService
      .get(key, fetcher, ttl)
      .then((result) => {
        if (mounted) {
          setData(result);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (mounted) {
          setError(err);
          setLoading(false);
        }
      });

    return () => {
      mounted = false;
    };
  }, [key, fetcher, ttl]);

  return { data, loading, error };
}
