import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

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

    const hashedPin = await hashPin(pin, user.id);

    // Update user PIN in database using service role for RLS bypass
    const serviceSupabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { error: updateError } = await serviceSupabase
      .from('users')
      .update({
        pin_hash: hashedPin,
        pin_attempts: 0,
        pin_locked: false,
        updated_at: new Date().toISOString(),
      })
      .eq('id', user.id);

    if (updateError) {
      console.error('[v0] PIN update error:', updateError);
      return NextResponse.json(
        { error: 'Failed to set PIN: ' + updateError.message },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { success: true, message: 'PIN set successfully' },
      { status: 200 }
    );
  } catch (error: any) {
    console.error('[v0] Set PIN error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
