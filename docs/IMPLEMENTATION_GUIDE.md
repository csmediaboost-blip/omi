# Implementation Guide - New Audit Utilities

This guide shows how to use the new utilities created during the system audit.

---

## 1. API Error Handling

### In API Routes

```typescript
// app/api/example/route.ts
import { apiSuccess, apiValidationError, apiServerError } from '@/lib/api-response';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    
    // Validation
    if (!body.email) {
      return apiValidationError('Email is required');
    }
    
    // Success
    return apiSuccess({ userId: '123' }, 201);
  } catch (error) {
    return apiServerError('Operation failed', { cause: error });
  }
}
```

### In Components

```typescript
// components/MyForm.tsx
'use client';
import { useRequestError } from '@/lib/use-request-error';

export function MyForm() {
  const { makeRequest } = useRequestError();
  
  async function handleSubmit() {
    const result = await makeRequest('/api/example', {
      method: 'POST',
      body: JSON.stringify({ email: 'user@example.com' }),
    });
    
    if (!result.success) {
      console.error(result.error); // User-friendly error
    }
  }
  
  return <button onClick={handleSubmit}>Submit</button>;
}
```

---

## 2. Real-time Data Updates

### Subscribe to User Balance

```typescript
// components/BalanceDisplay.tsx
'use client';
import { useRealtimeBalance } from '@/lib/use-realtime-subscription';
import { useUser } from '@/lib/auth-context';

export function BalanceDisplay() {
  const { user } = useUser();
  const balance = useRealtimeBalance(user?.id || null);
  
  return <div>Balance: ${balance?.toFixed(2)}</div>;
}
```

### Subscribe to Transactions

```typescript
// components/TransactionList.tsx
'use client';
import { useRealtimeTransactions } from '@/lib/use-realtime-subscription';
import { useUser } from '@/lib/auth-context';

export function TransactionList() {
  const { user } = useUser();
  const { data: transactions, isLoading } = useRealtimeTransactions(user?.id || null);
  
  if (isLoading) return <p>Loading...</p>;
  
  return (
    <ul>
      {transactions?.map(tx => (
        <li key={tx.id}>{tx.amount} - {tx.status}</li>
      ))}
    </ul>
  );
}
```

---

## 3. Form Validation

### Validate Input

```typescript
// components/SignupForm.tsx
'use client';
import { FormValidation } from '@/lib/form-validation';
import { useState } from 'react';

export function SignupForm() {
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState('');
  
  function handleEmailChange(value: string) {
    setEmail(value);
    const validation = FormValidation.email(value);
    setEmailError(validation.error || '');
  }
  
  return (
    <input
      type="email"
      value={email}
      onChange={e => handleEmailChange(e.target.value)}
      aria-invalid={!!emailError}
      aria-describedby={emailError ? 'email-error' : undefined}
    />
  );
}
```

---

## 4. Mobile-Optimized Input

### Use in Forms

```typescript
// components/MyForm.tsx
'use client';
import { MobileOptimizedInput } from '@/components/forms/MobileOptimizedInput';
import { Mail } from 'lucide-react';

export function MyForm() {
  return (
    <MobileOptimizedInput
      label="Email Address"
      icon={Mail}
      type="email"
      placeholder="you@example.com"
      required
      error={emailError}
      helper="We'll never share your email"
    />
  );
}
```

---

## 5. Error Alerts

### Display Errors

```typescript
// components/PaymentForm.tsx
'use client';
import { ErrorAlert } from '@/components/ErrorAlert';
import { useState } from 'react';

export function PaymentForm() {
  const [error, setError] = useState<{ title: string; message: string } | null>(null);
  
  async function handlePayment() {
    try {
      // Process payment
    } catch (err) {
      setError({
        title: 'Payment Failed',
        message: 'Your card was declined. Please try another.',
      });
    }
  }
  
  return (
    <>
      {error && (
        <ErrorAlert
          type="error"
          title={error.title}
          message={error.message}
          onClose={() => setError(null)}
          autoClose={0}
        />
      )}
    </>
  );
}
```

---

## 6. API Timeouts

### Configure Endpoint Timeouts

```typescript
// app/api/checkout/route.ts
import { API_CONFIG } from '@/lib/api-config';

export const maxDuration = 25; // 25 seconds

// Or use the config
const timeout = API_CONFIG.ENDPOINTS['POST /api/checkout']; // 25000ms
```

---

## 7. Network Error Boundary

### Wrap Pages/Sections

```typescript
// app/dashboard/layout.tsx
import { NetworkErrorBoundary } from '@/components/NetworkErrorBoundary';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <NetworkErrorBoundary>
      {children}
    </NetworkErrorBoundary>
  );
}
```

---

## Complete Example: Withdrawal Form

```typescript
// components/WithdrawalForm.tsx
'use client';

import { useState } from 'react';
import { useRequestError } from '@/lib/use-request-error';
import { useUser } from '@/lib/auth-context';
import { MobileOptimizedInput } from '@/components/forms/MobileOptimizedInput';
import { ErrorAlert } from '@/components/ErrorAlert';
import { FormValidation } from '@/lib/form-validation';
import { DollarSign, Lock } from 'lucide-react';

export function WithdrawalForm() {
  const { user } = useUser();
  const { makeRequest } = useRequestError();
  
  const [amount, setAmount] = useState('');
  const [amountError, setAmountError] = useState('');
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  function validateAmount(value: string) {
    const validation = FormValidation.amount(value, { min: 10, max: 100000 });
    setAmountError(validation.error || '');
    return !validation.error;
  }
  
  function validatePin(value: string) {
    const validation = FormValidation.pin(value);
    setPinError(validation.error || '');
    return !validation.error;
  }
  
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    
    if (!validateAmount(amount) || !validatePin(pin)) {
      return;
    }
    
    setLoading(true);
    
    const result = await makeRequest('/api/withdraw', {
      method: 'POST',
      body: JSON.stringify({ amount: parseFloat(amount), pin }),
      timeout: 20000,
    });
    
    setLoading(false);
    
    if (!result.success) {
      setError(result.error);
      return;
    }
    
    // Success
    console.log('Withdrawal successful!');
    setAmount('');
    setPin('');
  }
  
  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <ErrorAlert
          type="error"
          title="Withdrawal Failed"
          message={error}
          onClose={() => setError(null)}
        />
      )}
      
      <MobileOptimizedInput
        label="Amount"
        icon={DollarSign}
        type="number"
        placeholder="100.00"
        value={amount}
        onChange={e => {
          setAmount(e.target.value);
          validateAmount(e.target.value);
        }}
        error={amountError}
        required
      />
      
      <MobileOptimizedInput
        label="PIN"
        icon={Lock}
        type="password"
        placeholder="••••"
        value={pin}
        onChange={e => {
          setPin(e.target.value);
          validatePin(e.target.value);
        }}
        error={pinError}
        required
      />
      
      <button
        type="submit"
        disabled={loading}
        className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3 rounded-xl transition-all disabled:opacity-50"
      >
        {loading ? 'Processing...' : 'Withdraw'}
      </button>
    </form>
  );
}
```

---

## Deployment Checklist

Before pushing to production:

- [ ] Test all forms on mobile (375px, 768px, desktop)
- [ ] Verify API timeouts work (simulate slow network)
- [ ] Check error messages are user-friendly
- [ ] Test network recovery (toggle WiFi on/off)
- [ ] Verify real-time updates sync correctly
- [ ] Review security checklist
- [ ] Run `npm audit` - no vulnerabilities
- [ ] Test payment flow end-to-end
- [ ] Monitor Vercel logs for 24 hours post-deploy

---

## Troubleshooting

### Real-time Updates Not Working
```typescript
// Check if user is authenticated
const { data: { user } } = await supabase.auth.getUser();
if (!user) {
  console.error('User not authenticated');
  return;
}

// Check RLS policies are enabled
// SELECT * FROM users WHERE id = auth.uid();
```

### API Timeouts
```typescript
// Increase timeout for slow endpoints
export const maxDuration = 30; // Max allowed on Vercel

// Or use makeRequest with custom timeout
const result = await makeRequest('/api/slow-endpoint', {
  timeout: 28000, // 28 seconds
});
```

### Form Validation Not Triggering
```typescript
// Make sure to call validation on change AND blur
<input
  onChange={e => validateEmail(e.target.value)}
  onBlur={e => validateEmail(e.target.value)}
/>
```

---

## Support

For questions on implementation:
1. Check `docs/SECURITY_CHECKLIST.md` for security concerns
2. Check `docs/AUDIT_SUMMARY.md` for system overview
3. Review example files in `components/` folder
