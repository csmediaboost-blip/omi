import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServiceClient } from '@/lib/supabase';

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(req: NextRequest) {
  try {
    const { email, password, name, role } = await req.json();

    if (!email || !password || !name) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Get service role client for server-side operations
    const supabase = getSupabaseServiceClient();

    // Create user in Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      user_metadata: {
        name,
      },
    });

    if (authError) {
      console.error('Auth creation error:', authError);
      if (authError.message.includes('already exists')) {
        return NextResponse.json(
          { error: 'Email already in use' },
          { status: 400 }
        );
      }
      throw authError;
    }

    // User profile is created automatically by database trigger
    // Just return success
    return NextResponse.json(
      {
        success: true,
        uid: authData.user?.id,
        message: 'User created successfully',
      },
      { status: 201 }
    );
  } catch (error: any) {
    console.error('Registration error:', error);
    return NextResponse.json(
      { error: error.message || 'Registration failed' },
      { status: 500 }
    );
  }
}
