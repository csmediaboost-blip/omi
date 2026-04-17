import { z } from 'zod';

// User Tier Schema
export const UserTierSchema = z.enum(['free', 'pro', 'premium', 'enterprise']);
export type UserTier = z.infer<typeof UserTierSchema>;

// User Role Schema
export const UserRoleSchema = z.enum(['user', 'worker', 'client', 'admin']);
export type UserRole = z.infer<typeof UserRoleSchema>;

// User Schema
export const UserSchema = z.object({
  uid: z.string(),
  email: z.string().email(),
  displayName: z.string().optional(),
  avatar: z.string().url().optional(),
  tier: UserTierSchema.default('free'),
  balance: z.number().default(0),
  totalEarnings: z.number().default(0),
  role: UserRoleSchema.default('user'),
  referredBy: z.string().optional(),
  referralCode: z.string().min(3).max(20),
  kycStatus: z.enum(['pending', 'verified', 'rejected']).default('pending'),
  createdAt: z.date(),
  lastLogin: z.date(),
});

export type User = z.infer<typeof UserSchema>;

// Task Status Schema
export const TaskStatusSchema = z.enum(['open', 'in_progress', 'completed', 'cancelled']);

// Task Schema
export const TaskSchema = z.object({
  id: z.string(),
  title: z.string().min(3).max(200),
  description: z.string().min(10).max(5000),
  category: z.string(),
  difficulty: z.enum(['easy', 'medium', 'hard']),
  paymentAmount: z.number().positive(),
  currency: z.string().default('USD'),
  status: TaskStatusSchema.default('open'),
  clientId: z.string(),
  assignedWorkerId: z.string().optional(),
  deadline: z.date(),
  requirements: z.array(z.string()),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type Task = z.infer<typeof TaskSchema>;

// Worker Schema
export const WorkerSchema = z.object({
  id: z.string(),
  userId: z.string(),
  skills: z.array(z.string()),
  hourlyRate: z.number().positive(),
  completedTasks: z.number().default(0),
  rating: z.number().min(0).max(5).default(0),
  bio: z.string().optional(),
  portfolio: z.array(z.string()).default([]),
});

export type Worker = z.infer<typeof WorkerSchema>;

// Client Schema
export const ClientSchema = z.object({
  id: z.string(),
  userId: z.string(),
  company: z.string().optional(),
  postedTasks: z.number().default(0),
  totalSpent: z.number().default(0),
  rating: z.number().min(0).max(5).default(0),
});

export type Client = z.infer<typeof ClientSchema>;

// Transaction Type Schema
export const TransactionTypeSchema = z.enum(['deposit', 'withdrawal', 'task_payment', 'referral_bonus']);

// Transaction Schema
export const TransactionSchema = z.object({
  id: z.string(),
  userId: z.string(),
  amount: z.number(),
  type: TransactionTypeSchema,
  status: z.enum(['pending', 'completed', 'failed']).default('pending'),
  paymentMethod: z.string(),
  description: z.string(),
  createdAt: z.date(),
});

export type Transaction = z.infer<typeof TransactionSchema>;

// Sign Up Form Validation (WITHOUT PIN)
export const SignUpFormSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  confirmPassword: z.string(),
  fullName: z.string().min(2, 'Full name must be at least 2 characters'),
  agreeToTerms: z.boolean().refine(val => val, 'You must agree to the terms'),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

export type SignUpFormData = z.infer<typeof SignUpFormSchema>;

// Set PIN Form Validation (after signup)
export const SetPinFormSchema = z.object({
  pin: z.string().regex(/^\d{4}$/, 'PIN must be exactly 4 digits'),
  confirmPin: z.string(),
}).refine((data) => data.pin === data.confirmPin, {
  message: "PINs don't match",
  path: ["confirmPin"],
});

export type SetPinFormData = z.infer<typeof SetPinFormSchema>;

// Sign In Form Validation (WITHOUT PIN)
export const SignInFormSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

export type SignInFormData = z.infer<typeof SignInFormSchema>;

// Verify PIN Form Validation (after signin)
export const VerifyPinFormSchema = z.object({
  pin: z.string().regex(/^\d{4}$/, 'PIN must be exactly 4 digits'),
});

export type VerifyPinFormData = z.infer<typeof VerifyPinFormSchema>;

// Password Reset Validation
export const PasswordResetSchema = z.object({
  email: z.string().email('Invalid email address'),
});

export type PasswordResetData = z.infer<typeof PasswordResetSchema>;
