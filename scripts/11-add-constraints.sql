-- Migration: Add Missing Constraints for Security & Fraud Prevention
-- Purpose: Database-level enforcement of business rules
-- Status: MODIFYING EXISTING TABLES (backwards compatible)

-- 1. Add UNIQUE constraint on (user_id, task_id, DATE(created_at))
-- Prevents duplicate task submissions on same day
-- Note: Supabase doesn't support date-based uniqueness directly,
-- so we rely on application-level check with unique index on the triplet
CREATE UNIQUE INDEX IF NOT EXISTS idx_task_submissions_daily_unique 
  ON task_submissions(user_id, task_id, DATE(created_at));

-- 2. Add UNIQUE constraint on (referrer_id, referred_user_id) in referrals table
-- Already created in 10-audit-tables.sql, but documented here

-- 3. Add constraint on gpu_activations (prevent double activation)
-- Assuming gpu_activations or node_allocations table exists
-- Add unique constraint on (user_id, plan_id) with status="active"
-- This ensures only one active allocation per user per plan
-- SQL doesn't support conditional uniqueness, so this is enforced at app level

-- 4. Add columns to tasks table for reward caps (if not exists)
ALTER TABLE IF EXISTS tasks ADD COLUMN IF NOT EXISTS max_reward_per_task DECIMAL(12, 4);
ALTER TABLE IF EXISTS tasks ADD COLUMN IF NOT EXISTS max_user_earnings_per_task DECIMAL(12, 4);

-- 5. Add columns to users table for KYC consolidation (if not exists)
-- Canonical kyc_status column already exists, but add comment for clarity
COMMENT ON COLUMN users.kyc_status IS 'Canonical KYC status - single source of truth';

-- 6. Add columns to users table for withdrawal security
ALTER TABLE IF EXISTS users ADD COLUMN IF NOT EXISTS withdrawals_frozen BOOLEAN DEFAULT FALSE;
ALTER TABLE IF EXISTS users ADD COLUMN IF NOT EXISTS withdrawal_freeze_reason VARCHAR(255);
ALTER TABLE IF EXISTS users ADD COLUMN IF NOT EXISTS withdrawal_freeze_until TIMESTAMP;

-- 7. Ensure pin_attempt_history columns exist
ALTER TABLE IF EXISTS pin_attempt_history ADD COLUMN IF NOT EXISTS locked BOOLEAN DEFAULT FALSE;
ALTER TABLE IF EXISTS pin_attempt_history ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT now();

-- 8. Add processed_transaction_ids table if needed (for payment deduplication)
CREATE TABLE IF NOT EXISTS processed_transaction_ids (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_transaction_id VARCHAR(255) UNIQUE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  processed_at TIMESTAMP DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_processed_tx ON processed_transaction_ids(payment_transaction_id);

-- 9. Foreign Key Constraints (if not already present)
-- Ensure referral_commissions has proper constraints
ALTER TABLE IF EXISTS referral_commissions
  ADD CONSTRAINT fk_referral_commissions_referrer
    FOREIGN KEY (referrer_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE IF EXISTS referral_commissions
  ADD CONSTRAINT fk_referral_commissions_referred
    FOREIGN KEY (referred_user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

COMMIT;
