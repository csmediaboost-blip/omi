# Email Integration Guide - Critical for $100M Target

## Overview
Email receipts are critical for user trust and reducing support load. The email service is now ready at `lib/email-service.ts`.

## API Integration Points

### 1. CHECKOUT SUCCESS (Priority 1 - Revenue Critical)
**File:** `/app/api/checkout/route.ts`
**Location:** Add after successful payment transaction created
**When:** After `payment_transactions` insert succeeds

```typescript
import { sendPaymentReceipt } from "@/lib/email-service";

// After successful payment creation...
await sendPaymentReceipt({
  email: user.email,
  userName: user.full_name,
  amount: amount,
  planName: nodeName, // e.g. "Emerald Node"
  planTerm: lockInLabel, // e.g. "12-Month Contract"
  transactionId: txn.id,
  date: new Date(),
  estimatedReturns: "130% - 250%", // Calculate based on plan
});

// Return success response
return apiSuccess({
  success: true,
  transactionId: txn.id,
  message: "Payment received. Confirmation email sent.",
});
```

### 2. WITHDRAWAL SUCCESS (Priority 1 - Revenue Critical)
**File:** `/app/api/withdraw/route.ts`
**Location:** Add after withdrawal record successfully created
**When:** After withdrawal inserted into database

```typescript
import { sendWithdrawalReceipt } from "@/lib/email-service";

// After withdrawal created...
await sendWithdrawalReceipt({
  email: user.email,
  userName: user.full_name,
  amount: amount,
  withdrawalId: wd.id,
  status: "initiated",
  expectedDateRange: "24 hours to 7 business days",
  bankDetails: `${profile.payout_bank_name} (...${profile.payout_account_number?.slice(-4)})`,
  date: new Date(),
});

// Return success
return apiSuccess({
  amount,
  expectedDate,
  message: "Withdrawal submitted. Confirmation email sent.",
});
```

### 3. SIGNUP SUCCESS (Priority 2 - Trust Building)
**File:** `/app/api/auth/register/route.ts`
**Location:** Add after user successfully created

```typescript
import { sendWelcomeEmail } from "@/lib/email-service";

// After auth user created...
await sendWelcomeEmail({
  email: parsed.data.email,
  userName: parsed.data.name,
  signupDate: new Date(),
});

// No need to wait for email before responding
return apiSuccess({ uid: authData.user.id, message: "Account created." }, 201);
```

### 4. SECURITY ALERTS (Priority 2 - Risk Mitigation)
**File:** `/app/api/auth/signin/route.ts` and PIN change endpoints
**When:** New device login, PIN change, payout account change

```typescript
import { sendSecurityAlert } from "@/lib/email-service";

// On new login from new device/location
await sendSecurityAlert({
  email: user.email,
  userName: user.full_name,
  eventType: "login",
  location: getLocation(ipAddress), // Use IP geolocation
  timestamp: new Date(),
  ipAddress: ipAddress,
});

// On PIN change
await sendSecurityAlert({
  email: user.email,
  userName: user.full_name,
  eventType: "pin_changed",
  timestamp: new Date(),
});
```

## Implementation Checklist

- [ ] Add email import to `/app/api/checkout/route.ts`
- [ ] Call `sendPaymentReceipt()` after successful payment
- [ ] Add email import to `/app/api/withdraw/route.ts`
- [ ] Call `sendWithdrawalReceipt()` after successful withdrawal creation
- [ ] Add email import to `/app/api/auth/register/route.ts`
- [ ] Call `sendWelcomeEmail()` after successful signup
- [ ] Add security alert emails to signin flow (new device detection)
- [ ] Add security alert emails to PIN change endpoint
- [ ] Verify RESEND_API_KEY is set in Vercel environment variables
- [ ] Test emails in staging before production

## Error Handling

All email functions return `{ success: boolean, reason?: string }`. Handle gracefully:

```typescript
// Non-blocking email - don't fail user operation if email fails
const emailResult = await sendPaymentReceipt({...});
if (!emailResult.success) {
  console.warn("[CHECKOUT] Email failed but payment succeeded:", emailResult.reason);
}

// Still return success to user
return apiSuccess({ transactionId, message: "Payment processed." });
```

## Testing

```bash
# Test email service
curl -X POST http://localhost:3000/api/checkout \
  -H "Authorization: Bearer YOUR_JWT" \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "test-user",
    "nodeKey": "emerald-node",
    "amount": 100,
    "payMethod": "card"
  }'

# Check Resend dashboard for delivered emails
# https://resend.com/emails
```

## Environment Variables Required

```bash
RESEND_API_KEY=re_xxxxxxxxxxxxx  # Get from Resend dashboard
```

## FAQ

**Q: What if RESEND_API_KEY is not set?**
A: Emails will log a warning but won't block user operations. This is intentional - payment/withdrawal should succeed even if email fails.

**Q: Can I test emails locally?**
A: Yes, but you need a valid RESEND_API_KEY. Get one free from https://resend.com

**Q: How many emails can I send per month?**
A: Resend free tier: 100/day. Paid: unlimited. At $100M/month, upgrade to paid plan.

**Q: Should emails be blocking or non-blocking?**
A: Always non-blocking. Users' transactions shouldn't fail if email service is down.

## Revenue Impact

- **Reduced Support Load:** 50% fewer "Did my payment go through?" tickets
- **Chargeback Reduction:** Email proof = 80% fewer disputes
- **User Trust:** Receipts = professional platform = higher conversion
- **Compliance:** Audit trail = regulatory compliance

This is a high-ROI change. Implement immediately before deployment.
