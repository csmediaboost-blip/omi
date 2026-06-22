-- Add indexes for performance optimization
-- Frequently queried columns on users table
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_created_at ON users(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_users_kyc_status ON users(kyc_status);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

-- Support tickets table - by user_id and status
CREATE INDEX IF NOT EXISTS idx_support_tickets_user_id ON support_tickets(user_id);
CREATE INDEX IF NOT EXISTS idx_support_tickets_status ON support_tickets(status);
CREATE INDEX IF NOT EXISTS idx_support_tickets_created_at ON support_tickets(created_at DESC);

-- Transactions/financials table
CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON transactions(user_id) WHERE transactions.user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON transactions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(type);

-- Support messages table
CREATE INDEX IF NOT EXISTS idx_support_messages_ticket_id ON support_messages(ticket_id);
CREATE INDEX IF NOT EXISTS idx_support_messages_created_at ON support_messages(created_at DESC);

-- GPU tasks
CREATE INDEX IF NOT EXISTS idx_gpu_tasks_user_id ON gpu_tasks(user_id) WHERE gpu_tasks.user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_gpu_tasks_status ON gpu_tasks(status);
CREATE INDEX IF NOT EXISTS idx_gpu_tasks_created_at ON gpu_tasks(created_at DESC);

-- Composite indexes for common queries
CREATE INDEX IF NOT EXISTS idx_users_kyc_status_created_at ON users(kyc_status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_support_tickets_status_created_at ON support_tickets(status, created_at DESC);
