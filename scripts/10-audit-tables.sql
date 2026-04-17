-- Migration: Create Audit Tables for Phase 3
-- Purpose: Add transaction audit trail, rate limit history, admin audit log
-- Status: NEW TABLES (no data impact)

-- 1. Transaction Audit Trail
-- Logs every payment status change for compliance
CREATE TABLE IF NOT EXISTS transaction_audit_trail (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  transaction_id UUID,
  action VARCHAR(50), -- "created", "confirmed", "failed", "refunded"
  amount DECIMAL(12, 4),
  old_status VARCHAR(50),
  new_status VARCHAR(50),
  metadata JSONB,
  admin_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT now()
);

CREATE INDEX idx_transaction_audit_user ON transaction_audit_trail(user_id, created_at);
CREATE INDEX idx_transaction_audit_tx ON transaction_audit_trail(transaction_id);
CREATE INDEX idx_transaction_audit_action ON transaction_audit_trail(action, created_at);

-- 2. Rate Limit History
-- Persists rate limit state for PIN verification, payment attempts, etc.
CREATE TABLE IF NOT EXISTS rate_limit_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint VARCHAR(255),
  attempt_count INT DEFAULT 0,
  reset_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);

CREATE INDEX idx_rate_limit_user_endpoint ON rate_limit_history(user_id, endpoint);

-- 3. PIN Attempt History
-- Tracks progressive PIN failures with exponential backoff
CREATE TABLE IF NOT EXISTS pin_attempt_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint VARCHAR(50) DEFAULT 'signin', -- "signin", "withdrawal", etc
  attempt_count INT DEFAULT 0,
  last_attempt_at TIMESTAMP,
  next_retry_at TIMESTAMP,
  locked BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);

CREATE INDEX idx_pin_attempt_user_endpoint ON pin_attempt_history(user_id, endpoint);
CREATE INDEX idx_pin_attempt_locked ON pin_attempt_history(locked, user_id);

-- 4. Admin Audit Log
-- All admin approvals and user modifications logged here
CREATE TABLE IF NOT EXISTS admin_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action VARCHAR(100), -- "approve_payment", "update_kyc", "ban_user", etc
  resource_type VARCHAR(50), -- "payment", "user", "referral", etc
  resource_id VARCHAR(255),
  metadata JSONB,
  ip_address INET,
  created_at TIMESTAMP DEFAULT now()
);

CREATE INDEX idx_admin_audit_admin ON admin_audit_log(admin_id, created_at);
CREATE INDEX idx_admin_audit_action ON admin_audit_log(action, created_at);
CREATE INDEX idx_admin_audit_resource ON admin_audit_log(resource_type, resource_id);

-- 5. Processed Referral IDs
-- Prevents referral commission replay attacks
CREATE TABLE IF NOT EXISTS processed_referral_ids (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id VARCHAR(255) UNIQUE NOT NULL,
  processed_at TIMESTAMP DEFAULT now()
);

CREATE INDEX idx_processed_referral_tx ON processed_referral_ids(transaction_id);

-- 6. Referrals Table
-- Tracks who referred whom (prevents duplicate referrals)
CREATE TABLE IF NOT EXISTS referrals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  referred_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT now(),
  UNIQUE(referrer_id, referred_user_id)
);

CREATE INDEX idx_referral_referrer ON referrals(referrer_id);
CREATE INDEX idx_referral_referred ON referrals(referred_user_id);

COMMIT;
