-- Add guest support functionality to support_tickets table
-- This allows guests without accounts to submit support tickets

-- 1. Allow NULL user_id (for guest tickets)
ALTER TABLE support_tickets 
DROP CONSTRAINT IF EXISTS support_tickets_user_id_fkey;

ALTER TABLE support_tickets 
ADD CONSTRAINT support_tickets_user_id_fkey 
FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- 2. Add guest_email column for guest support
ALTER TABLE support_tickets 
ADD COLUMN IF NOT EXISTS guest_email VARCHAR(255);

-- 3. Add guest_name column for guest support
ALTER TABLE support_tickets 
ADD COLUMN IF NOT EXISTS guest_name VARCHAR(255);

-- 4. Update support_messages table to handle NULL sender_id (for guest messages)
ALTER TABLE support_messages 
DROP CONSTRAINT IF EXISTS support_messages_sender_id_fkey;

ALTER TABLE support_messages 
ADD CONSTRAINT support_messages_sender_id_fkey 
FOREIGN KEY (sender_id) REFERENCES auth.users(id) ON DELETE SET NULL;

-- 5. Add indexes for guest email lookups
CREATE INDEX IF NOT EXISTS idx_support_tickets_guest_email ON support_tickets(guest_email);
CREATE INDEX IF NOT EXISTS idx_support_tickets_user_id_guest_email ON support_tickets(user_id, guest_email);

-- 6. Add constraint to ensure either user_id or guest_email is provided
ALTER TABLE support_tickets 
ADD CONSTRAINT support_tickets_requires_user_or_guest 
CHECK (user_id IS NOT NULL OR guest_email IS NOT NULL);

-- Verify the changes
SELECT column_name, is_nullable, data_type 
FROM information_schema.columns 
WHERE table_name = 'support_tickets' 
ORDER BY ordinal_position;
