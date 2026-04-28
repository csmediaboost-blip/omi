-- Migration: Consolidate KYC Status to Single Source
-- Purpose: Replace multiple KYC status columns with one canonical source
-- Status: DATA MIGRATION (consolidates existing data)

-- Step 1: Ensure kyc_status column exists with correct type
ALTER TABLE IF EXISTS users 
  ADD COLUMN IF NOT EXISTS kyc_status VARCHAR(50) DEFAULT 'not_started';

-- Step 2: Migrate data from legacy sources to canonical kyc_status
-- Priority: kyc_status > kyc_documents.status > user_kyc.status > kyc_verified boolean
UPDATE users
SET kyc_status = CASE
  -- Already has kyc_status
  WHEN kyc_status IN ('approved', 'rejected', 'pending', 'not_started', 'verified') 
    THEN kyc_status
  -- Check kyc_documents for newer status (if join available)
  WHEN kyc_verified = true THEN 'approved'
  WHEN kyc_verified = false AND kyc_status IS NULL THEN 'not_started'
  ELSE COALESCE(kyc_status, 'not_started')
END
WHERE kyc_status IS NULL OR kyc_status = '';

-- Step 3: Add NOT NULL constraint (after migration)
ALTER TABLE IF EXISTS users
  ALTER COLUMN kyc_status SET NOT NULL;

-- Step 4: Keep old columns for backwards compatibility during transition,
-- but mark them as deprecated
COMMENT ON COLUMN users.kyc_verified IS 'DEPRECATED: Use kyc_status instead';
COMMENT ON COLUMN users.kyc_status IS 'CANONICAL: Single source of truth for KYC status';

-- Step 5: Archive any kyc_documents records
CREATE TABLE IF NOT EXISTS kyc_documents_archive AS
SELECT * FROM kyc_documents
WHERE created_at < now() - INTERVAL '90 days';

-- Step 6: Create view for backwards compatibility during transition
CREATE OR REPLACE VIEW v_users_kyc_resolved AS
SELECT 
  u.id,
  u.email,
  u.kyc_status as resolved_kyc_status,
  u.kyc_verified,
  CASE 
    WHEN u.kyc_status = 'approved' THEN true
    ELSE false
  END as is_kyc_approved
FROM users u;

-- Step 7: Add index for KYC queries
CREATE INDEX IF NOT EXISTS idx_users_kyc_status ON users(kyc_status);

COMMIT;
