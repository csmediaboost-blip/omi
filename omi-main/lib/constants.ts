export const TIER_FEATURES = {
  free: {
    name: 'Free',
    price: 0,
    monthlyTaskLimit: 5,
    maxWorkers: 1,
    features: [
      'Post up to 5 tasks per month',
      'Access to 1 worker',
      'Basic support',
      'No analytics',
    ],
  },
  pro: {
    name: 'Pro',
    price: 29,
    monthlyTaskLimit: 50,
    maxWorkers: 5,
    features: [
      'Post up to 50 tasks per month',
      'Access to 5 workers',
      'Priority support',
      'Basic analytics',
      'Custom branding',
    ],
  },
  premium: {
    name: 'Premium',
    price: 99,
    monthlyTaskLimit: 200,
    maxWorkers: 20,
    features: [
      'Post up to 200 tasks per month',
      'Access to 20 workers',
      'Premium support',
      'Advanced analytics',
      'Custom branding',
      'API access',
      'Bulk operations',
    ],
  },
  enterprise: {
    name: 'Enterprise',
    price: 299,
    monthlyTaskLimit: -1, // Unlimited
    maxWorkers: -1, // Unlimited
    features: [
      'Unlimited tasks',
      'Unlimited workers',
      'Dedicated support',
      'Advanced analytics',
      'Custom branding',
      'API access',
      'Bulk operations',
      'Custom integrations',
      'SLA guarantee',
    ],
  },
};

export const DIFFICULTY_LABELS = {
  easy: 'Easy',
  medium: 'Medium',
  hard: 'Hard',
};

export const TASK_CATEGORIES = [
  'Data Entry',
  'Content Writing',
  'Research',
  'Design',
  'Development',
  'Marketing',
  'Customer Service',
  'Translation',
  'Other',
];

export const REGIONS = {
  US: { name: 'United States', currency: 'USD' },
  EU: { name: 'European Union', currency: 'EUR' },
  NG: { name: 'Nigeria', currency: 'NGN' },
  KE: { name: 'Kenya', currency: 'KES' },
  ZA: { name: 'South Africa', currency: 'ZAR' },
  GB: { name: 'United Kingdom', currency: 'GBP' },
  CA: { name: 'Canada', currency: 'CAD' },
  AU: { name: 'Australia', currency: 'AUD' },
  GLOBAL: { name: 'Global', currency: 'USD' },
};

export const PAYMENT_METHODS = {
  stripe: 'Stripe',
  korapay: 'Direct Transfer',
  paypal: 'PayPal',
  crypto: 'Cryptocurrency',
};

export const REFERRAL_BONUS_TIERS = {
  tier1: { minReferrals: 0, bonus: 10 },
  tier2: { minReferrals: 5, bonus: 25 },
  tier3: { minReferrals: 10, bonus: 50 },
  tier4: { minReferrals: 25, bonus: 100 },
};
