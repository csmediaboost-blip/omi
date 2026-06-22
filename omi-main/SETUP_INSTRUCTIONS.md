# OmniTask Pro - Setup Instructions

## Firebase Configuration Required

The application is now production-ready but requires Firebase credentials to be configured. Follow these steps:

### 1. Add Firebase Environment Variables

Add the following variables to your Vercel project settings (Settings → Environment Variables):

**Firebase Public Variables:**
```
NEXT_PUBLIC_FIREBASE_API_KEY=your_api_key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_auth_domain
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_storage_bucket
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_messaging_sender_id
NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id
```

You can find these values in your Firebase project settings (Project Settings → General tab).

### 2. Optional: Server-side Firebase Admin

If you need server-side operations, add:
```
FIREBASE_PRIVATE_KEY=your_private_key
FIREBASE_CLIENT_EMAIL=your_client_email
```

### 3. Payment Gateway Credentials (Optional)

For payment processing:
```
STRIPE_SECRET_KEY=your_stripe_secret
STRIPE_PUBLISHABLE_KEY=your_stripe_publishable
STRIPE_WEBHOOK_SECRET=your_stripe_webhook_secret
KORAPAY_SECRET_KEY=your_korapay_key
PAYPAL_CLIENT_ID=your_paypal_client_id
PAYPAL_SECRET=your_paypal_secret
```

## Application Status

### Currently Enabled Without Firebase
- All pages load and render properly
- Navigation and UI are fully functional
- Forms validate correctly

### Will Work Once Firebase is Configured
- User authentication (sign up, sign in, logout)
- User profile creation and management
- Task creation and management
- Wallet and transaction tracking
- Leaderboard data storage
- All real-time features

## Local Development

To test locally without Firebase credentials:

```bash
npm install
npm run dev
```

The app will display a warning about missing Firebase config but will still run. Add env variables to `.env.local` to enable Firebase features.

## Production Deployment

1. Deploy to Vercel normally: `git push`
2. Add Firebase credentials via Vercel Dashboard
3. All backend features will activate automatically

## Support

All payment APIs are scaffolded and ready. Once credentials are added, the system will:
- Process Stripe payments with real webhooks
- Support Korapay for African users
- Enable PayPal integration
- Handle refunds automatically
- Track all transactions in Firestore
