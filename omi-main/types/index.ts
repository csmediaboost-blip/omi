// User-related types
export interface UserProfile {
  uid: string;
  email: string;
  displayName?: string;
  avatar?: string;
  tier: 'free' | 'pro' | 'premium' | 'enterprise';
  balance: number;
  totalEarnings: number;
  role: 'user' | 'worker' | 'client' | 'admin';
  referredBy?: string;
  referralCode: string;
  kycStatus: 'pending' | 'verified' | 'rejected';
  createdAt: Date;
  lastLogin: Date;
}

// Task-related types
export interface Task {
  id: string;
  title: string;
  description: string;
  category: string;
  difficulty: 'easy' | 'medium' | 'hard';
  paymentAmount: number;
  currency: string;
  status: 'open' | 'in_progress' | 'completed' | 'cancelled';
  clientId: string;
  assignedWorkerId?: string;
  deadline: Date;
  requirements: string[];
  createdAt: Date;
  updatedAt: Date;
}

// Worker profile
export interface WorkerProfile {
  id: string;
  userId: string;
  skills: string[];
  hourlyRate: number;
  completedTasks: number;
  rating: number;
  bio?: string;
  portfolio: string[];
}

// Client profile
export interface ClientProfile {
  id: string;
  userId: string;
  company?: string;
  postedTasks: number;
  totalSpent: number;
  rating: number;
}

// Transaction
export interface Transaction {
  id: string;
  userId: string;
  amount: number;
  type: 'deposit' | 'withdrawal' | 'task_payment' | 'referral_bonus';
  status: 'pending' | 'completed' | 'failed';
  paymentMethod: string;
  description: string;
  createdAt: Date;
}

// Payment
export interface Payment {
  id: string;
  userId: string;
  amount: number;
  currency: string;
  provider: 'stripe' | 'korapay' | 'paypal' | 'crypto';
  status: 'pending' | 'succeeded' | 'failed';
  transactionId: string;
  createdAt: Date;
}

// Referral
export interface Referral {
  id: string;
  referrerId: string;
  referredUserId: string;
  bonusAmount: number;
  status: 'pending' | 'completed' | 'withdrawn';
  createdAt: Date;
}

// Subscription
export interface Subscription {
  id: string;
  userId: string;
  tier: 'free' | 'pro' | 'premium' | 'enterprise';
  startDate: Date;
  endDate: Date;
  autoRenew: boolean;
  paymentMethodId?: string;
}

// Leaderboard entry
export interface LeaderboardEntry {
  id: string;
  userId: string;
  rank: number;
  score: number;
  category: string;
  period: 'weekly' | 'monthly' | 'alltime';
  updatedAt: Date;
}

// Support ticket
export interface SupportTicket {
  id: string;
  userId: string;
  subject: string;
  description: string;
  status: 'open' | 'in_progress' | 'resolved' | 'closed';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  createdAt: Date;
  updatedAt: Date;
}
