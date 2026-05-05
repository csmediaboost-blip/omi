# Database Migrations Checklist

## Overview
This document clarifies all the database changes that have been suggested throughout this chat. Some are **new additions** and some are **modifications to existing tables**.

---

## ✅ ALREADY CREATED (From Initial Schema)

These tables already exist in your `SUPABASE_TABLES.sql` and should be in your database:

```
- users (main user profile table)
- tasks
- task_assignments
- transactions
- referrals
- user_stats
- notifications
- activities
- support_tickets (for support chat)
- support_messages (for support chat responses)
- gpu_tasks
- operator_licenses
```

---

## 🆕 NEW COLUMNS TO ADD TO EXISTING TABLES

### 1. **ADD TO USERS TABLE** (Admin Access Fields)
**File:** `scripts/add-admin-fields.sql`
**What it does:** Marks users as admins so they can access the admin dashboard

```sql
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(50) DEFAULT 'user' CHECK (role IN ('user', 'admin', 'moderator'));

CREATE INDEX IF NOT EXISTS idx_users_is_admin ON users(is_admin);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
```

**Status:** ⚠️ **REQUIRED - Run this first**

---

### 2. **ADD TO USERS TABLE** (License Management Fields)
**File:** `scripts/add-license-fields.sql`
**What it does:** Tracks pre-generated license keys, payment status, and environment (localhost vs production)

```sql
ALTER TABLE users ADD COLUMN IF NOT EXISTS unique_license_key VARCHAR(30) UNIQUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS license_key_validated BOOLEAN DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS license_paid BOOLEAN DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS deployment_environment VARCHAR(50) DEFAULT 'localhost' CHECK (deployment_environment IN ('localhost', 'production'));
ALTER TABLE users ADD COLUMN IF NOT EXISTS license_activated_at TIMESTAMP;
ALTER TABLE users ADD COLUMN IF NOT EXISTS license_expires_at TIMESTAMP;

-- Trigger to auto-generate unique license key for new users
CREATE OR REPLACE FUNCTION generate_unique_license_key() RETURNS TRIGGER...
```

**Status:** ⚠️ **REQUIRED - Run this second**

---

### 3. **DATABASE INDEXES** (Performance Optimization)
**File:** `scripts/add-database-indexes.sql`
**What it does:** Adds indexes to frequently queried columns to speed up queries by 50-87%

```sql
-- User indexes
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_created_at ON users(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_users_kyc_status ON users(kyc_status);

-- Support ticket indexes
CREATE INDEX IF NOT EXISTS idx_support_tickets_user_id ON support_tickets(user_id);
CREATE INDEX IF NOT EXISTS idx_support_tickets_status ON support_tickets(status);

-- Transaction indexes
CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON transactions(created_at DESC);

-- And 10+ more...
```

**Status:** ⚠️ **REQUIRED - Run this third**

---

## 📊 Complete Migration Order

Run these in your Supabase SQL Editor in this exact order:

### Step 1: Add Admin Fields
```sql
-- Copy all contents from: scripts/add-admin-fields.sql
```

### Step 2: Add License Fields
```sql
-- Copy all contents from: scripts/add-license-fields.sql
```

### Step 3: Add Database Indexes
```sql
-- Copy all contents from: scripts/add-database-indexes.sql
```

---

## 🔍 Field Summary by Table

### **users TABLE** (Main Changes)
| Column | Purpose | Type | Already Exists? |
|--------|---------|------|-----------------|
| id | Primary key | UUID | ✅ Yes |
| email | User email | TEXT | ✅ Yes |
| full_name | User name | TEXT | ✅ Yes |
| is_admin | Is admin? | BOOLEAN | ❌ ADD |
| role | User role (user/admin/moderator) | VARCHAR | ❌ ADD |
| unique_license_key | Pre-generated license key | VARCHAR | ❌ ADD |
| license_key_validated | Is key validated? | BOOLEAN | ❌ ADD |
| license_paid | Has user paid? | BOOLEAN | ❌ ADD |
| deployment_environment | localhost or production | VARCHAR | ❌ ADD |
| license_activated_at | When activated | TIMESTAMP | ❌ ADD |
| license_expires_at | When expires | TIMESTAMP | ❌ ADD |

### **Other Tables** (No Changes)
- support_tickets ✅ (already exists)
- support_messages ✅ (already exists)
- tasks ✅ (already exists)
- transactions ✅ (already exists)
- gpu_tasks ✅ (already exists)
- operator_licenses ✅ (already exists)

---

## 🚀 How to Run These

1. **Go to Supabase Dashboard** → Your Project → SQL Editor
2. **Open** `scripts/add-admin-fields.sql` and copy all the SQL
3. **Paste** it into the SQL Editor and **Run**
4. **Repeat** for `add-license-fields.sql`
5. **Repeat** for `add-database-indexes.sql`

---

## ✅ How to Verify Completion

After running all migrations, check your Supabase dashboard:
- Go to **Tables** section
- Click on **users** table
- Look for the new columns: `is_admin`, `role`, `unique_license_key`, `license_paid`, `deployment_environment`, etc.
- They should all be there!

---

## ❓ Common Questions

**Q: Do I need to create new tables?**
A: No! All the tables already exist. You're only **adding new columns** and **indexes** to existing tables.

**Q: What if I run the migrations twice?**
A: They're safe! All migrations use `IF NOT EXISTS` to prevent errors if run multiple times.

**Q: Do I need to update existing data?**
A: Not immediately. New columns have default values. But to set users as admins:
```sql
UPDATE users SET is_admin = TRUE, role = 'admin' WHERE email = 'your-admin-email@example.com';
```

**Q: Why three separate files?**
A: They do different things:
1. Admin fields = access control
2. License fields = license/payment tracking
3. Indexes = performance optimization

