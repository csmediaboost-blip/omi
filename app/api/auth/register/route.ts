import { NextRequest } from 'next/server';
import { getSupabaseServiceClient } from '@/lib/supabase';
import {
  apiSuccess,
  apiValidationError,
  apiConflictError,
  apiServerError,
} from '@/lib/api-response';
import { z } from 'zod';

export const dynamic = "force-dynamic";
export const revalidate = 0;

// Validation schema
const RegisterSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  name: z.string().min(2, 'Name must be at least 2 characters').max(100),
  role: z.enum(['investor', 'worker', 'contributor']).optional().default('investor'),
});

export async function POST(req: NextRequest) {
  try {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return apiValidationError('Invalid request body');
    }

    // Validate input
    const parsed = RegisterSchema.safeParse(body);
    if (!parsed.success) {
      return apiValidationError(
        'Validation failed',
        { errors: parsed.error.flatten() }
      );
    }

    const { email, password, name, role } = parsed.data;

    // Get service role client for server-side operations
    const supabase = getSupabaseServiceClient();

    // Create user in Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      user_metadata: { name, role },
    });

    if (authError) {
      console.error('[AUTH] Creation error:', authError);
      
      if (authError.message.includes('already exists')) {
        return apiConflictError('Email already registered', { email });
      }
      
      return apiServerError(
        'Failed to create user account',
        { details: { authError: authError.message } }
      );
    }

    if (!authData.user?.id) {
      return apiServerError('User creation returned no ID');
    }

    // User profile is created automatically by database trigger
    return apiSuccess(
      {
        success: true,
        uid: authData.user.id,
        email,
        message: 'Account created successfully',
      },
      201
    );
  } catch (error: any) {
    console.error('[REGISTER_API] Unhandled error:', error);
    return apiServerError(
      'Registration failed. Please try again.',
      { cause: error }
    );
  }
}
