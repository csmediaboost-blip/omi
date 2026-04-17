import { supabase } from './supabase';
import { User, Worker, Client, UserTier } from './validators';

// User operations
export async function createUserProfile(userId: string, userData: Partial<User>) {
  try {
    const { error } = await supabase
      .from('users')
      .insert([{
        id: userId,
        ...userData,
        created_at: new Date().toISOString(),
        last_login: new Date().toISOString(),
      }]);
    
    if (error) throw error;
  } catch (error) {
    console.error('Error creating user profile:', error);
    throw error;
  }
}

export async function getUserProfile(userId: string): Promise<User | null> {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .single();
    
    if (error && error.code === 'PGRST116') {
      return null;
    }
    if (error) throw error;
    
    return data as User;
  } catch (error) {
    console.error('Error fetching user profile:', error);
    throw error;
  }
}

export async function updateUserProfile(userId: string, updates: Partial<User>) {
  try {
    const { error } = await supabase
      .from('users')
      .update(updates)
      .eq('id', userId);
    
    if (error) throw error;
  } catch (error) {
    console.error('Error updating user profile:', error);
    throw error;
  }
}

// Worker operations
export async function createWorkerProfile(workerId: string, workerData: Partial<Worker>) {
  try {
    const { error } = await supabase
      .from('users')
      .insert([{
        id: workerId,
        role: 'worker',
        ...workerData,
        created_at: new Date().toISOString(),
      }]);
    
    if (error) throw error;
  } catch (error) {
    console.error('Error creating worker profile:', error);
    throw error;
  }
}

export async function getWorkerProfile(workerId: string): Promise<Worker | null> {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', workerId)
      .eq('role', 'worker')
      .single();
    
    if (error && error.code === 'PGRST116') {
      return null;
    }
    if (error) throw error;
    
    return data as Worker;
  } catch (error) {
    console.error('Error fetching worker profile:', error);
    throw error;
  }
}

// Client operations
export async function createClientProfile(clientId: string, clientData: Partial<Client>) {
  try {
    const { error } = await supabase
      .from('users')
      .insert([{
        id: clientId,
        role: 'client',
        ...clientData,
        created_at: new Date().toISOString(),
      }]);
    
    if (error) throw error;
  } catch (error) {
    console.error('Error creating client profile:', error);
    throw error;
  }
}

export async function getClientProfile(clientId: string): Promise<Client | null> {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', clientId)
      .eq('role', 'client')
      .single();
    
    if (error && error.code === 'PGRST116') {
      return null;
    }
    if (error) throw error;
    
    return data as Client;
  } catch (error) {
    console.error('Error fetching client profile:', error);
    throw error;
  }
}

// Tier upgrade logic
export async function checkAndUpgradeTier(userId: string): Promise<UserTier> {
  try {
    const user = await getUserProfile(userId);
    if (!user) throw new Error('User not found');

    let newTier: UserTier = user.tier;

    // Auto-upgrade logic based on total_earnings
    if (user.total_earnings >= 50000) {
      newTier = 'enterprise';
    } else if (user.total_earnings >= 10000) {
      newTier = 'premium';
    } else if (user.total_earnings >= 1000) {
      newTier = 'pro';
    }

    if (newTier !== user.tier) {
      await updateUserProfile(userId, { tier: newTier });
    }

    return newTier;
  } catch (error) {
    console.error('Error checking tier upgrade:', error);
    throw error;
  }
}

// Generate unique referral code
export function generateReferralCode(): string {
  return Math.random().toString(36).substring(2, 15).toUpperCase();
}
