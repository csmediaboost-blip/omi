/**
 * Progressive PIN Rate Limiting
 * 
 * Implements exponential backoff for failed PIN attempts:
 * - Attempt 1-2: Allow immediate retry
 * - Attempt 3: 5 second delay
 * - Attempt 4: 30 second delay  
 * - Attempt 5+: 300 second (5 min) delay
 * - After 3 failed: Lock account
 * 
 * State persisted in database for multi-instance safety
 */

import { createClient } from "@supabase/supabase-js";

export interface PinAttemptRecord {
  id: string;
  user_id: string;
  endpoint: string; // "signin" | "withdrawal" | etc
  attempt_count: number;
  last_attempt_at: string;
  next_retry_at: string;
  locked: boolean;
  created_at: string;
}

export async function getProgressiveDelay(attemptCount: number): Promise<number> {
  if (attemptCount <= 2) return 0; // No delay for first 2 attempts
  if (attemptCount === 3) return 5000; // 5 seconds
  if (attemptCount === 4) return 30000; // 30 seconds
  return 300000; // 5 minutes for 5+
}

export async function checkPinRateLimit(
  userId: string,
  endpoint: string = "signin"
): Promise<{
  allowed: boolean;
  locked: boolean;
  remainingDelay: number;
  attemptsRemaining: number;
}> {
  const adminSupabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  try {
    // Get current attempt record
    const { data: record } = await adminSupabase
      .from("pin_attempt_history")
      .select("*")
      .eq("user_id", userId)
      .eq("endpoint", endpoint)
      .single();

    const now = Date.now();
    
    // No previous attempts
    if (!record) {
      return {
        allowed: true,
        locked: false,
        remainingDelay: 0,
        attemptsRemaining: 3, // Lock after 3 failed attempts
      };
    }

    // Account is locked
    if (record.locked) {
      return {
        allowed: false,
        locked: true,
        remainingDelay: 0,
        attemptsRemaining: 0,
      };
    }

    // Check if enough time has passed since last attempt
    const nextRetryTime = new Date(record.next_retry_at).getTime();
    const remainingDelay = Math.max(0, nextRetryTime - now);

    if (remainingDelay > 0) {
      return {
        allowed: false,
        locked: false,
        remainingDelay,
        attemptsRemaining: Math.max(0, 3 - record.attempt_count),
      };
    }

    // Allowed - return attempts remaining
    return {
      allowed: true,
      locked: false,
      remainingDelay: 0,
      attemptsRemaining: Math.max(0, 3 - record.attempt_count),
    };
  } catch (err) {
    console.error("[PIN_RATE_LIMIT] Check failed:", err);
    // Default to allowing if DB check fails
    return {
      allowed: true,
      locked: false,
      remainingDelay: 0,
      attemptsRemaining: 3,
    };
  }
}

export async function recordPinAttempt(
  userId: string,
  endpoint: string = "signin",
  success: boolean
): Promise<void> {
  const adminSupabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  try {
    const now = new Date();
    const { data: record } = await adminSupabase
      .from("pin_attempt_history")
      .select("*")
      .eq("user_id", userId)
      .eq("endpoint", endpoint)
      .single();

    if (success) {
      // Reset on success
      if (record) {
        await adminSupabase
          .from("pin_attempt_history")
          .delete()
          .eq("user_id", userId)
          .eq("endpoint", endpoint);
      }
      return;
    }

    // Record failed attempt
    const newAttemptCount = (record?.attempt_count || 0) + 1;
    const shouldLock = newAttemptCount >= 3;
    const delay = await getProgressiveDelay(newAttemptCount);
    const nextRetryAt = new Date(now.getTime() + delay).toISOString();

    if (record) {
      // Update existing
      await adminSupabase
        .from("pin_attempt_history")
        .update({
          attempt_count: newAttemptCount,
          last_attempt_at: now.toISOString(),
          next_retry_at: nextRetryAt,
          locked: shouldLock,
        })
        .eq("user_id", userId)
        .eq("endpoint", endpoint);
    } else {
      // Create new
      await adminSupabase.from("pin_attempt_history").insert({
        user_id: userId,
        endpoint,
        attempt_count: 1,
        last_attempt_at: now.toISOString(),
        next_retry_at: nextRetryAt,
        locked: false,
      });
    }

    // Also update users table for quick access
    if (shouldLock) {
      await adminSupabase
        .from("users")
        .update({ pin_locked: true })
        .eq("id", userId)
        .catch(err => console.error("Failed to lock account:", err));
    }
  } catch (err) {
    console.error("[PIN_RATE_LIMIT] Record attempt failed:", err);
  }
}
