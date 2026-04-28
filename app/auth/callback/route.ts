import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const error = searchParams.get('error');
  const error_description = searchParams.get('error_description');

  // Handle OAuth errors
  if (error) {
    console.error('OAuth error:', error, error_description);
    return NextResponse.redirect(
      new URL(`/auth/signin?error=${encodeURIComponent(error)}`, request.url)
    );
  }

  // If no code, redirect to signin
  if (!code) {
    return NextResponse.redirect(new URL('/auth/signin', request.url));
  }

  // Exchange code for session
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    const { data, error: sessionError } = await supabase.auth.exchangeCodeForSession(code);

    if (sessionError) {
      console.error('Session exchange error:', sessionError);
      return NextResponse.redirect(
        new URL('/auth/signin?error=session_exchange_failed', request.url)
      );
    }

    if (data.user) {
      // Check if user exists in our users table and has PIN
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('pin_hash')
        .eq('id', data.user.id)
        .single();

      // User doesn't exist in our table (new OAuth user)
      if (userError?.code === 'PGRST116') {
        try {
          // Create user profile from OAuth data
          await supabase
            .from('users')
            .insert({
              id: data.user.id,
              email: data.user.email,
              full_name: data.user.user_metadata?.full_name || data.user.email?.split('@')[0],
              pin_hash: null,
              tier: 'bronze',
              created_at: new Date().toISOString(),
            });
        } catch (err) {
          console.error('Create user error:', err);
        }

        // New user - redirect to set PIN
        return NextResponse.redirect(new URL('/auth/set-pin', request.url));
      }

      if (userError && userError.code !== 'PGRST116') {
        console.error('User fetch error:', userError);
        return NextResponse.redirect(new URL('/auth/signin?error=user_fetch_failed', request.url));
      }

      // User exists - check if they have PIN
      if (!userData?.pin_hash) {
        // No PIN set - redirect to set PIN
        return NextResponse.redirect(new URL('/auth/set-pin', request.url));
      }

      // User has PIN - redirect to verify PIN
      return NextResponse.redirect(new URL('/auth/verify-pin', request.url));
    }

    // Fallback redirect
    return NextResponse.redirect(new URL('/auth/signin', request.url));
  } catch (error: any) {
    console.error('Auth callback error:', error);
    return NextResponse.redirect(
      new URL('/auth/signin?error=callback_error', request.url)
    );
  }
}

