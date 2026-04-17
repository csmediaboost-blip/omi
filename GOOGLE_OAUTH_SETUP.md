# Google OAuth Setup Guide for Supabase

## Problem Fixed
The "Sign up/Sign in with Google" button now properly:
1. Redirects to Google OAuth
2. Handles OAuth callback correctly
3. Creates user profile if new
4. Prompts for PIN setup after successful authentication

## Required Setup in Supabase

### 1. Enable Google OAuth in Supabase Dashboard

1. Go to **supabase.com** → Your Project → **Authentication** → **Providers**
2. Find **Google** and click **Enable**
3. You'll need Google OAuth credentials:
   - **Client ID** and **Client Secret** from Google Cloud Console

### 2. Get Google OAuth Credentials

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or use existing
3. Enable **Google+ API**
4. Go to **Credentials** → **Create OAuth 2.0 Client ID**
5. Choose **Web application**
6. Add Authorized redirect URIs:
   - `https://YOUR_SUPABASE_URL/auth/v1/callback?provider=google`
   - `http://localhost:3000/auth/callback` (for local development)
7. Copy **Client ID** and **Client Secret**

### 3. Add Credentials to Supabase

1. In Supabase Dashboard → **Authentication** → **Providers** → **Google**
2. Paste your **Client ID** and **Client Secret**
3. Under **Authorized redirect URIs**, add:
   - `https://YOUR_PROJECT.vercel.app/auth/callback`
   - `http://localhost:3000/auth/callback`
4. Save settings

### 4. Environment Variables

Ensure your `.env.local` has:
```
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

## Authentication Flow

### Email/Password Signup
1. User enters email, password, name
2. Account created via Supabase Auth
3. Redirects to **Set PIN page**
4. After PIN setup → Dashboard

### Email/Password Signin
1. User enters email, password
2. Signs in via Supabase Auth
3. Redirects to **Verify PIN page**
4. After PIN verification → Dashboard

### Google OAuth
1. User clicks "Sign in with Google"
2. Redirected to Google login
3. After auth, redirected to `/auth/callback`
4. Callback handler checks:
   - If new user → Creates profile + redirects to **Set PIN**
   - If user exists without PIN → Redirects to **Set PIN**
   - If user exists with PIN → Redirects to **Verify PIN**

## Testing

### Local Development
```bash
npm run dev
# Visit http://localhost:3000
# Test signup/signin with Google
```

### Vercel Deployment
1. Add environment variables to Vercel project settings
2. Add redirect URI to Google Console: `https://your-project.vercel.app/auth/callback`
3. Deploy and test

## Troubleshooting

### "Sign up with Google" shows error
- Check Google OAuth is enabled in Supabase
- Verify Client ID and Secret are correct
- Check Authorized redirect URIs in both Supabase and Google Console

### Redirects to crash page
- Ensure `/auth/callback` route exists (it does - we fixed it)
- Check browser console for error logs
- Verify Supabase URL and keys are correct

### PIN page not showing
- Ensure users table has `pin_hash` column
- Check callback route is creating user profile correctly
- Verify database connection

## Database Requirements

The `users` table must have:
- `id` (UUID, primary key)
- `email` (text)
- `full_name` (text)
- `pin_hash` (text, nullable)
- `tier` (text, default: 'bronze')
- `created_at` (timestamp)

See SUPABASE_TABLES.sql for complete schema.
