-- Add PIN column to users table
ALTER TABLE public.users ADD COLUMN pin_hash TEXT;
ALTER TABLE public.users ADD COLUMN pin_salt TEXT;

-- Create an index for faster lookups
CREATE INDEX IF NOT EXISTS idx_users_pin_hash ON public.users(pin_hash);

-- Add comment explaining PIN fields
COMMENT ON COLUMN public.users.pin_hash IS 'Hashed PIN for authentication';
COMMENT ON COLUMN public.users.pin_salt IS 'Salt used for PIN hashing';
