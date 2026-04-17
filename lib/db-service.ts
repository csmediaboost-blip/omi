import { supabase, getSupabaseServiceClient } from './supabase';
import { User } from './validators';
import bcrypt from 'bcrypt';

// User creation and management
export async function createUserProfile(uid: string, userData: Partial<User>) {
  try {
    const userDocument = {
      id: uid,
      email: userData.email,
      name: userData.name || '',
      role: userData.role || 'user',
      tier: 'free',
      balance: 0,
      total_earnings: 0,
      profile_image: '',
      bio: '',
      kyc_status: 'pending',
      referral_code: generateReferralCode(),
      referred_by: userData.referred_by || null,
      tasks_completed: 0,
      rating: 5,
      created_at: new Date().toISOString(),
      last_login: new Date().toISOString(),
      is_active: true,
      country_code: userData.country_code || 'US',
      currency: userData.currency || 'USD',
    };

    const { error } = await supabase
      .from('users')
      .insert([userDocument]);

    if (error) throw error;
    return userDocument;
  } catch (error) {
    console.error('Error creating user profile:', error);
    throw error;
  }
}

export async function getUserProfile(uid: string) {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', uid)
      .single();

    if (error) throw error;
    if (!data) throw new Error('User not found');
    
    return data as User;
  } catch (error) {
    console.error('Error fetching user profile:', error);
    throw error;
  }
}

export async function updateUserProfile(uid: string, data: Partial<User>) {
  try {
    const { error } = await supabase
      .from('users')
      .update({
        ...data,
        updated_at: new Date().toISOString(),
      })
      .eq('id', uid);

    if (error) throw error;
  } catch (error) {
    console.error('Error updating user profile:', error);
    throw error;
  }
}

export async function getUserByEmail(email: string) {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('email', email)
      .single();

    if (error && error.code === 'PGRST116') {
      return null; // No rows found
    }
    if (error) throw error;
    
    return data as User;
  } catch (error) {
    console.error('Error fetching user by email:', error);
    throw error;
  }
}

// Task management
export async function createTask(taskData: any) {
  try {
    const task = {
      ...taskData,
      status: 'open',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      bids: [],
      applicants: 0,
    };

    const { data, error } = await supabase
      .from('tasks')
      .insert([task])
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error creating task:', error);
    throw error;
  }
}

export async function getTask(taskId: string) {
  try {
    const { data, error } = await supabase
      .from('tasks')
      .select('*')
      .eq('id', taskId)
      .single();

    if (error) throw error;
    if (!data) throw new Error('Task not found');
    
    return data;
  } catch (error) {
    console.error('Error fetching task:', error);
    throw error;
  }
}

export async function listTasks(filters?: { category?: string; difficulty?: string; status?: string }) {
  try {
    let query = supabase.from('tasks').select('*');
    
    if (filters?.status) {
      query = query.eq('status', filters.status);
    }
    if (filters?.category) {
      query = query.eq('category', filters.category);
    }
    if (filters?.difficulty) {
      query = query.eq('difficulty', filters.difficulty);
    }

    const { data, error } = await query;

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error listing tasks:', error);
    throw error;
  }
}

// Wallet and payments
export async function createTransaction(transactionData: any) {
  try {
    const transaction = {
      ...transactionData,
      status: 'pending',
      created_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from('transactions')
      .insert([transaction])
      .select()
      .single();

    if (error) throw error;

    // Update user balance
    if (transactionData.user_id) {
      const userSupabase = getSupabaseServiceClient();
      if (transactionData.type === 'credit') {
        await userSupabase.rpc('increment_user_balance', {
          user_id_param: transactionData.user_id,
          amount_param: transactionData.amount,
        });
      } else if (transactionData.type === 'debit') {
        await userSupabase.rpc('increment_user_balance', {
          user_id_param: transactionData.user_id,
          amount_param: -transactionData.amount,
        });
      }
    }

    return data;
  } catch (error) {
    console.error('Error creating transaction:', error);
    throw error;
  }
}

export async function getUserTransactions(userId: string, limit = 50) {
  try {
    const { data, error } = await supabase
      .from('transactions')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error fetching transactions:', error);
    throw error;
  }
}

// Referral management
export async function createReferral(referrerUid: string, referredUid: string) {
  try {
    const referral = {
      referrer_id: referrerUid,
      referred_id: referredUid,
      bonus_amount: 100,
      bonus_status: 'pending',
      created_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from('referrals')
      .insert([referral])
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error creating referral:', error);
    throw error;
  }
}

export async function getUserReferrals(userId: string) {
  try {
    const { data, error } = await supabase
      .from('referrals')
      .select('*')
      .eq('referrer_id', userId);

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error fetching referrals:', error);
    throw error;
  }
}

// Helper functions
export function generateReferralCode(): string {
  return 'REF' + Math.random().toString(36).substring(2, 15).toUpperCase();
}

export async function hashPassword(password: string): Promise<string> {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(password, salt);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

// Subscription tier management
export async function updateUserTier(userId: string, tier: 'free' | 'pro' | 'premium' | 'enterprise') {
  try {
    const { error } = await supabase
      .from('users')
      .update({
        tier,
        tier_updated_at: new Date().toISOString(),
      })
      .eq('id', userId);

    if (error) throw error;
  } catch (error) {
    console.error('Error updating user tier:', error);
    throw error;
  }
}
