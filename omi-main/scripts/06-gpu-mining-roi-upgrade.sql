-- Migration: GPU Mining ROI System Upgrade
-- Date: May 5, 2026
-- Purpose: Add new profit-based mining system with node-specific ROI multipliers

-- Step 1: Add new columns to gpu_node_plans table (backward compatible)
-- These columns support the new dynamic profit mining system
ALTER TABLE IF EXISTS gpu_node_plans
ADD COLUMN IF NOT EXISTS profit_min DECIMAL(8, 2) DEFAULT 0.29,
ADD COLUMN IF NOT EXISTS profit_max DECIMAL(8, 2) DEFAULT 0.40,
ADD COLUMN IF NOT EXISTS base_roi_multiplier DECIMAL(3, 2) DEFAULT 1.0,
ADD COLUMN IF NOT EXISTS payment_model_type VARCHAR(50) DEFAULT 'pay_as_you_go' CHECK (payment_model_type IN ('pay_as_you_go'));

-- Step 2: Update existing GPU node plans with ROI multipliers
-- Foundation Node (lowest ROI = 1.0x)
UPDATE gpu_node_plans SET base_roi_multiplier = 1.0 WHERE name LIKE '%Foundation%' OR short_name LIKE '%Foundation%';

-- RTX 4090, A100 (middle tier = 1.1x)
UPDATE gpu_node_plans SET base_roi_multiplier = 1.1 WHERE name LIKE '%RTX 4090%' OR short_name LIKE '%RTX 4090%';
UPDATE gpu_node_plans SET base_roi_multiplier = 1.1 WHERE name LIKE '%A100%' OR short_name LIKE '%A100%';

-- H100 (highest tier = 1.4x)
UPDATE gpu_node_plans SET base_roi_multiplier = 1.4 WHERE name LIKE '%H100%' OR short_name LIKE '%H100%';

-- Step 3: Ensure all plans are set to pay_as_you_go only
UPDATE gpu_node_plans SET payment_model_type = 'pay_as_you_go';

-- Step 4: Create mining_sessions table to track single-payout mining
CREATE TABLE IF NOT EXISTS mining_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan_id UUID NOT NULL REFERENCES gpu_node_plans(id) ON DELETE CASCADE,
  amount_invested DECIMAL(12, 2) NOT NULL,
  target_profit DECIMAL(8, 2) NOT NULL,
  accumulated_profit DECIMAL(8, 2) DEFAULT 0,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'completed', 'cancelled')),
  started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Step 5: Create indexes for mining_sessions
CREATE INDEX IF NOT EXISTS idx_mining_sessions_user_id ON mining_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_mining_sessions_plan_id ON mining_sessions(plan_id);
CREATE INDEX IF NOT EXISTS idx_mining_sessions_status ON mining_sessions(status);
CREATE INDEX IF NOT EXISTS idx_mining_sessions_created_at ON mining_sessions(created_at);

-- Step 6: Enable RLS on mining_sessions
ALTER TABLE mining_sessions ENABLE ROW LEVEL SECURITY;

-- Step 7: RLS Policies for mining_sessions
CREATE POLICY "Users can view their own mining sessions" ON mining_sessions
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can create mining sessions" ON mining_sessions
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own sessions" ON mining_sessions
  FOR UPDATE USING (user_id = auth.uid());

-- Step 8: Add kyc_verified column to users table if it doesn't exist
ALTER TABLE users
ADD COLUMN IF NOT EXISTS kyc_verified BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS kyc_status TEXT DEFAULT 'not_started' CHECK (kyc_status IN ('not_started', 'pending', 'approved', 'rejected'));

-- Commit completed
COMMIT;
