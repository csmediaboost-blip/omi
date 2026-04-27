import { useEffect, useState, useCallback } from 'react';
import { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from './supabase';

export interface SubscriptionOptions {
  enabled?: boolean;
  onError?: (error: Error) => void;
  onLoadingChange?: (loading: boolean) => void;
}

/**
 * Hook for real-time Supabase subscriptions
 * Automatically handles cleanup and reconnection
 */
export function useRealtimeSubscription<T>(
  tableName: string,
  userId: string | null,
  options: SubscriptionOptions = {}
) {
  const { enabled = true, onError, onLoadingChange } = options;

  const [data, setData] = useState<T[] | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [channel, setChannel] = useState<RealtimeChannel | null>(null);

  const subscribe = useCallback(async () => {
    if (!enabled || !userId) {
      setIsLoading(false);
      return;
    }

    try {
      setError(null);
      onLoadingChange?.(true);

      // Create subscription channel
      const newChannel = supabase
        .channel(`${tableName}_${userId}`)
        .on(
          'postgres_changes',
          {
            event: '*', // Listen to all events (INSERT, UPDATE, DELETE)
            schema: 'public',
            table: tableName,
            filter: `user_id=eq.${userId}`, // Only user's data
          },
          (payload) => {
            console.log(`[Realtime] ${tableName} update:`, payload);

            // Handle INSERT
            if (payload.eventType === 'INSERT') {
              setData((prev) => {
                if (!prev) return [payload.new as T];
                return [...prev, payload.new as T];
              });
            }

            // Handle UPDATE
            if (payload.eventType === 'UPDATE') {
              setData((prev) => {
                if (!prev) return [payload.new as T];
                return prev.map((item: any) =>
                  item.id === payload.new.id ? (payload.new as T) : item
                );
              });
            }

            // Handle DELETE
            if (payload.eventType === 'DELETE') {
              setData((prev) => {
                if (!prev) return null;
                const filtered = prev.filter(
                  (item: any) => item.id !== payload.old.id
                );
                return filtered.length === 0 ? null : filtered;
              });
            }
          }
        )
        .on('system', { event: 'join' }, () => {
          console.log(`[Realtime] Connected to ${tableName}`);
          setIsLoading(false);
          onLoadingChange?.(false);
        })
        .on('system', { event: 'error' }, (e) => {
          const err = new Error(`Real-time connection error: ${e}`);
          console.error(`[Realtime] Error on ${tableName}:`, err);
          setError(err);
          onError?.(err);
        })
        .subscribe();

      setChannel(newChannel);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      console.error(`[Realtime] Subscription error:`, error);
      setError(error);
      onError?.(error);
      setIsLoading(false);
      onLoadingChange?.(false);
    }
  }, [tableName, userId, enabled, onError, onLoadingChange]);

  // Subscribe on mount and cleanup on unmount
  useEffect(() => {
    subscribe();

    return () => {
      if (channel) {
        supabase.removeChannel(channel);
      }
    };
  }, [subscribe, channel]);

  return { data, isLoading, error };
}

/**
 * Hook to subscribe to a single user record
 */
export function useRealtimeUser(userId: string | null) {
  const [user, setUser] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel(`user_${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'users',
          filter: `id=eq.${userId}`,
        },
        (payload) => {
          console.log('[Realtime] User updated:', payload.new);
          setUser(payload.new);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId]);

  return { user, isLoading };
}

/**
 * Hook to subscribe to balance updates
 */
export function useRealtimeBalance(userId: string | null) {
  const [balance, setBalance] = useState<number | null>(null);

  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel(`balance_${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'users',
          filter: `id=eq.${userId}`,
        },
        (payload) => {
          const newBalance = payload.new?.balance_available;
          if (newBalance !== undefined) {
            setBalance(newBalance);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId]);

  return balance;
}

/**
 * Hook to subscribe to transaction list
 */
export function useRealtimeTransactions(userId: string | null) {
  return useRealtimeSubscription('transactions', userId, {
    enabled: !!userId,
  });
}
