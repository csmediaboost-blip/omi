import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { checkPinRateLimit, recordPinAttempt } from '@/lib/pin-rate-limit';

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(request: NextRequest) {
  try {
    const { pin } = await request.json();

    // Validate PIN format - allow 4-6 digits
    if (!pin || !/^\d{4,6}$/.test(pin)) {
      return NextResponse.json(
        { error: 'PIN must be 4-6 digits' },
        { status: 400 }
      );
    }

    // Get the authorization header with the session token
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'Missing or invalid authorization header' },
        { status: 401 }
      );
    }

    const token = authHeader.slice(7); // Remove 'Bearer ' prefix

    // Create Supabase client with the user's token
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        global: {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      }
    );

    // Get the authenticated user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    
    if (userError || !user) {
      console.error('[v0] User fetch error:', userError);
      return NextResponse.json(
        { error: 'Session expired. Please sign in again.' },
        { status: 401 }
      );
    }

    // Hash PIN using SHA-256 (matches SetPinForm implementation)
    async function hashPin(pinValue: string, userId: string): Promise<string> {
      const encoder = new TextEncoder();
      const data = encoder.encode(pinValue + userId);
      const hashBuffer = await crypto.subtle.digest('SHA-256', data);
      return Array.from(new Uint8Array(hashBuffer))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
    }

    // Get user's stored PIN hash using service role
    const serviceSupabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // SECURITY: Check progressive rate limiting
    const endpoint = request.headers.get('x-pin-endpoint') || 'signin';
    const rateLimit = await checkPinRateLimit(user.id, endpoint);

    if (rateLimit.locked) {
      return NextResponse.json(
        { error: 'Account locked due to too many failed attempts. Please reset your PIN.' },
        { status: 429 }
      );
    }

    if (!rateLimit.allowed) {
      const delaySeconds = Math.ceil(rateLimit.remainingDelay / 1000);
      return NextResponse.json(
        { 
          error: `Too many attempts. Please try again in ${delaySeconds} seconds.`,
          retryAfter: delaySeconds
        },
        { 
          status: 429,
          headers: { 'Retry-After': String(delaySeconds) }
        }
      );
    }

    const { data: userData, error: userFetchError } = await serviceSupabase
      .from('users')
      .select('pin_hash, pin_attempts, pin_locked')
      .eq('id', user.id)
      .single();

    if (userFetchError || !userData) {
      console.error('[v0] User fetch error:', userFetchError);
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    // Hash provided PIN and compare
    const providedHash = await hashPin(pin, user.id);
    const isValidPin = providedHash === userData.pin_hash;

    if (!isValidPin) {
      // Record failed attempt with progressive rate limiting
      await recordPinAttempt(user.id, endpoint, false);

      // Get updated rate limit status
      const updatedLimit = await checkPinRateLimit(user.id, endpoint);
      
      console.warn(`[v0] Invalid PIN attempt for user ${user.id}`);
      
      if (updatedLimit.locked) {
        return NextResponse.json(
          { error: 'Too many failed attempts. Account locked. Please reset your PIN.' },
          { status: 429 }
        );
      }

      return NextResponse.json(
        { 
          error: `Invalid PIN. ${updatedLimit.attemptsRemaining} attempts remaining before lockout.`,
          attemptsRemaining: updatedLimit.attemptsRemaining
        },
        { status: 401 }
      );
    }

    // Record successful attempt (resets counter)
    await recordPinAttempt(user.id, endpoint, true);

    // Update last verified timestamp
    await serviceSupabase
      .from('users')
      .update({
        last_pin_verified_at: new Date().toISOString(),
      })
      .eq('id', user.id)
      .catch(err => console.error('[v0] Failed to update verification time:', err));

    return NextResponse.json(
      { success: true, message: 'PIN verified successfully' },
      { status: 200 }
    );
  } catch (error: any) {
    console.error('[v0] Verify PIN error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
