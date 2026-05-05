-- Migration: Add license fields to users table
-- This adds the necessary columns for license key management and payment tracking

-- Add unique_license_key column (pre-generated unique key for each user)
ALTER TABLE users ADD COLUMN IF NOT EXISTS unique_license_key VARCHAR(30) UNIQUE;

-- Add license validation tracking
ALTER TABLE users ADD COLUMN IF NOT EXISTS license_key_validated BOOLEAN DEFAULT FALSE;

-- Add payment status tracking
ALTER TABLE users ADD COLUMN IF NOT EXISTS license_paid BOOLEAN DEFAULT FALSE;

-- Add deployment environment tracking
ALTER TABLE users ADD COLUMN IF NOT EXISTS deployment_environment VARCHAR(50) DEFAULT 'localhost' CHECK (deployment_environment IN ('localhost', 'production'));

-- Add license activation date
ALTER TABLE users ADD COLUMN IF NOT EXISTS license_activated_at TIMESTAMP;

-- Add license expiry date
ALTER TABLE users ADD COLUMN IF NOT EXISTS license_expires_at TIMESTAMP;

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_users_license_paid ON users(license_paid);
CREATE INDEX IF NOT EXISTS idx_users_deployment_environment ON users(deployment_environment);
CREATE INDEX IF NOT EXISTS idx_users_unique_license_key ON users(unique_license_key);

-- Add a trigger to generate unique license key for new users
CREATE OR REPLACE FUNCTION generate_unique_license_key()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.unique_license_key IS NULL THEN
    -- Generate key format: OMNI-XXXX-XXXX-XXXX-XXXX
    NEW.unique_license_key := 'OMNI-' ||
      SUBSTR('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ', floor(random() * 36)::int + 1, 1) ||
      SUBSTR('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ', floor(random() * 36)::int + 1, 1) ||
      SUBSTR('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ', floor(random() * 36)::int + 1, 1) ||
      SUBSTR('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ', floor(random() * 36)::int + 1, 1) || '-' ||
      SUBSTR('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ', floor(random() * 36)::int + 1, 1) ||
      SUBSTR('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ', floor(random() * 36)::int + 1, 1) ||
      SUBSTR('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ', floor(random() * 36)::int + 1, 1) ||
      SUBSTR('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ', floor(random() * 36)::int + 1, 1) || '-' ||
      SUBSTR('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ', floor(random() * 36)::int + 1, 1) ||
      SUBSTR('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ', floor(random() * 36)::int + 1, 1) ||
      SUBSTR('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ', floor(random() * 36)::int + 1, 1) ||
      SUBSTR('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ', floor(random() * 36)::int + 1, 1) || '-' ||
      SUBSTR('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ', floor(random() * 36)::int + 1, 1) ||
      SUBSTR('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ', floor(random() * 36)::int + 1, 1) ||
      SUBSTR('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ', floor(random() * 36)::int + 1, 1) ||
      SUBSTR('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ', floor(random() * 36)::int + 1, 1);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop old trigger if exists and create new one
DROP TRIGGER IF EXISTS before_insert_users_license_key ON users;
CREATE TRIGGER before_insert_users_license_key
  BEFORE INSERT ON users
  FOR EACH ROW
  EXECUTE FUNCTION generate_unique_license_key();
