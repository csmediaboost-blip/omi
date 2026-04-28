
# OmniTask Pro - Production Deployment Guide

## Environment Variables Setup

Add the following to your Vercel project settings (Settings → Environment Variables):

### Firebase Configuration
```
NEXT_PUBLIC_FIREBASE_API_KEY=AIzaSyAbcDefGhIjKlMnOpQrStUvWxYzA1b2cDe
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=ai-task-c394c.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=ai-task-c394c
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=ai-task-c394c.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=123456789012
NEXT_PUBLIC_FIREBASE_APP_ID=1:123456789012:web:abcdefghijklmnop
FIREBASE_PRIVATE_KEY=-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-fbsvc@ai-task-c394c.iam.gserviceaccount.com
```

### Payment Gateway Keys
```
STRIPE_SECRET_KEY=sk_live_51KzYxABzZvD...
STRIPE_PUBLISHABLE_KEY=pk_live_51KzYxABzZvD...
STRIPE_WEBHOOK_SECRET=whsec_1234567890abcdef
KORAPAY_SECRET_KEY=sk_live_xxxxxxxxxxxxx
PAYPAL_CLIENT_ID=xxxxxxxxxxxxxxxxxxxxxx
PAYPAL_SECRET=xxxxxxxxxxxxxxxxxxxxxx
PAYPAL_MODE=live
```

### Application Configuration
```
NEXT_PUBLIC_APP_URL=https://omnittaskpro.com
```

## Database Schema Setup

All collections are automatically created in Firestore when users interact with the app. Collections include:

- `users` - User profiles and account data
- `tasks` - Task listings and details
- `transactions` - Payment and wallet transactions
- `referrals` - Referral tracking
- `subscriptions` - Tier subscriptions
- `leaderboard_data` - Performance rankings

## Payment Webhooks Configuration

### Stripe
1. Go to Stripe Dashboard → Webhooks
2. Add endpoint: `https://yourdomain.com/api/webhooks/stripe`
3. Select events: `payment_intent.succeeded`, `payment_intent.payment_failed`, `charge.refunded`
4. Copy webhook secret to `STRIPE_WEBHOOK_SECRET` env var

### Korapay
1. Configure webhook URL in Korapay dashboard: `https://yourdomain.com/api/webhooks/korapay`
2. Secret key should be in `KORAPAY_SECRET_KEY`

## Firestore Security Rules

Enable Row-Level Security in Firestore Console:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // User profiles - only accessible by owner
    match /users/{userId} {
      allow read, write: if request.auth.uid == userId;
      allow read: if request.auth.uid != null; // Public profile viewing
    }

    // Tasks - readable by all, writable by creator
    match /tasks/{taskId} {
      allow read: if request.auth.uid != null;
      allow create, update, delete: if request.auth.uid == resource.data.clientId;
    }

    // Transactions - only accessible by owner
    match /transactions/{transId} {
      allow read: if request.auth.uid == resource.data.userId;
      allow create: if request.auth.uid == request.resource.data.userId;
    }

    // Referrals - readable by referrer
    match /referrals/{refId} {
      allow read: if request.auth.uid == resource.data.referrerUid;
    }

    // Leaderboard - publicly readable
    match /leaderboard_data/{docId} {
      allow read: if request.auth.uid != null;
      allow write: if false;
    }
  }
}
```

## API Endpoints Overview

### Authentication
- `POST /api/auth/register` - Create new user account
- `POST /api/auth/login` - Sign in user

### Tasks
- `GET /api/tasks` - List tasks with filters
- `POST /api/tasks` - Create new task
- `GET /api/tasks/[id]` - Get task details

### Users
- `GET /api/users/[userId]` - Get user profile
- `PUT /api/users/[userId]` - Update user profile
- `GET /api/users/[userId]/transactions` - Get transaction history

### Payments
- `POST /api/payments/stripe/intent` - Create Stripe payment intent
- `POST /api/payments/korapay/initialize` - Initialize Korapay payment
- `POST /api/payments/paypal/create-order` - Create PayPal order
- `POST /api/webhooks/stripe` - Stripe webhook handler
- `POST /api/webhooks/korapay` - Korapay webhook handler

## Deployment Steps

1. **Push to GitHub**
   ```bash
   git add .
   git commit -m "Production deployment"
   git push origin main
   ```

2. **Deploy to Vercel**
   - Connect GitHub repository to Vercel
   - Add all environment variables in Settings → Environment Variables
   - Trigger deployment

3. **Update Stripe/Korapay Webhooks**
   - Update webhook URLs to your production domain
   - Test webhooks with test payments

4. **Enable Firebase Firestore**
   - Go to Firebase Console
   - Enable Firestore Database
   - Apply security rules from above

5. **Test Production**
   - Create test account
   - Test payment flows for all providers
   - Verify webhook handlers receive events
   - Test referral system
   - Verify transaction logging

## Performance Optimization

- All database queries use proper indexing (auto-created by Firebase)
- Images stored in Firebase Storage with CDN
- Firestore automatically scales
- Next.js 16 provides optimal SSR/SSG

## Monitoring & Logging

- Check Vercel logs: `vercel logs --tail`
- Firebase Console for Firestore activity
- Stripe Dashboard for payment issues
- Korapay Dashboard for African payment processing

## Scaling Considerations

- Firebase handles auto-scaling
- Add caching layer (Redis) for frequently accessed data if needed
- Implement rate limiting on API endpoints
- Monitor Firestore read/write usage

## Support & Maintenance

- Regular backup Firebase data
- Monitor API error rates
- Keep dependencies updated
- Review security rules quarterly
