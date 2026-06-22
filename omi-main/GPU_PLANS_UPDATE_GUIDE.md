# GPU Plans Page Update Guide - Mining System Overhaul

## Summary of Work Completed

The following have been successfully implemented:

### ✅ COMPLETED

1. **Database Migration** (`scripts/06-gpu-mining-roi-upgrade.sql`)
   - Added `profit_min`, `profit_max`, `base_roi_multiplier` to gpu_node_plans
   - Created `mining_sessions` table for single-payout tracking
   - Added KYC verification columns to users table

2. **Node Configuration** (`lib/nodeConfig.ts`)
   - Added `profitMin`, `profitMax`, `roiMultiplier` to all 12 node types
   - Foundation Node: ROI 1.0x
   - RTX 4090/A100: ROI 1.1x (+10%)
   - H100 variants: ROI 1.4x (+40%)

3. **Mining Calculations Utility** (`lib/mining-calculations.ts`)
   - `generateDailyProfit()` - Random $0.29-$0.40
   - `calculateHourlyProfit()` - Daily - 20%
   - `calculateWeeklyProfit()` - Daily × 7 + 10%
   - `calculateMonthlyProfit()` - Daily × 30 + 25%
   - `calculateMiningSession()` - Full calculation with multipliers
   - ROI percentage calculations

4. **Homepage Updates** (`app/page.tsx`)
   - Removed all "0.13%" and "guaranteed" references
   - Changed "Invest" → "Mine" terminology
   - Updated hero section, FAQ, stats, features, steps, pricing
   - Updated metadata

---

## Work Remaining

### ⚠️ CRITICAL - GPU Plans Page (`app/dashboard/gpu-plans/page.tsx`)

This is a 3,725-line file with complex state management. The following changes are required:

#### 1. **Terminology Changes** (Find & Replace)
```
"Invest" → "Mine"
"Investment" → "Mining"
"Capital Invested" → "Capital Committed"
"Invest $" → "Get Coin and Mine $" or "Start Mining $"
"onInvest" → "onStartMining"
```

#### 2. **Remove Contract Plans UI**
- Current code shows tabs for "flexible" vs "contract" payment models
- Remove all contract-related sections:
  - CONTRACT_TERMS array (around line 149)
  - Contract term selection UI
  - Contract ROI/return displays
  - Maturity date calculations
- Keep only "pay-as-you-go" option

#### 3. **Remove Expected ROI Display**
- Search for "Expected ROI" or "Expected Returns"
- Remove these displays from:
  - Plan cards
  - Mining details modal
  - Dashboard summaries
- Replace with: Real-time earned amount showing progress to target

#### 4. **Add Mining Progress UI**
Where current page shows ROI estimates, add:
```tsx
<div className="mining-progress">
  <p>Mining in progress...</p>
  <p>Earned: ${accumulatedProfit.toFixed(2)} of ${targetProfit.toFixed(2)}</p>
  <progress value={accumulatedProfit / targetProfit} max="1" />
</div>
```

#### 5. **Add KYC Gate for Withdrawals**
Around withdrawal buttons (lines ~1600-1750):
```tsx
if (!kyc_verified) {
  return <button disabled>Verify Identity to Withdraw</button>
}
// Show withdraw button only if KYC approved
```

#### 6. **Update Mining Session Logic**
When user starts mining:
1. Generate random profit using `calculateMiningSession()`
2. Create record in `mining_sessions` table
3. Animate accumulated profit from $0 to target over 30-60 seconds
4. When accumulated >= target: Mark complete, show profits
5. Add capital + profit to user wallet
6. Option to start new session or withdraw

#### 7. **Update Plan Card Displays**
Remove from each plan card:
- "0.13% / day" text
- "guaranteed" badges
- Contract term buttons

Add to each plan card:
- ROI multiplier badge (e.g., "1.1x")
- Profit range hint (e.g., "$0.32-$0.44/day" based on 1.1x multiplier)

---

## Detailed Implementation Steps

### Step 1: Replace invest → mine terminology
Use Find & Replace in your editor:
- `handleInvestClick` → `handleStartMining`
- `onInvest` → `onStartMining`
- `"Invest"` → `"Mine"`
- Any variable `isInvesting` → `isMining`

### Step 2: Restructure plan card rendering
Current line ~2400-2600 renders plan details. Need to:
1. Remove contract option UI
2. Add real ROI multiplier display
3. Show profit range based on node multiplier
4. Hide expected ROI sections

### Step 3: Update mining button handler
Current `handleInvestClick()` (line ~1887):
- Keep the checkout flow
- After successful payment:
  - Call `calculateMiningSession(amount, nodeMultiplier)`
  - Store `targetProfit` in UI state
  - Start 60-second animation to target
  - Poll backend for accumulated profit or simulate client-side
  - Once target reached, show completion with totals

### Step 4: Update withdrawal modal
Around line 1600 (WithdrawModal):
```tsx
// Add KYC check
const canWithdraw = kyc_verified && kyc_status === 'approved';
if (!canWithdraw) {
  return <WithdrawalBlockedMessage kyc_status={kyc_status} />;
}
```

### Step 5: Remove contract elements
Search and remove:
- CONTRACT_TERMS constant
- `contractMonths`, `contractLabel`, `contractMinPct`, `contractMaxPct` state
- All contract term selection UI
- All contract-related calculations

### Step 6: Update database queries
When fetching plan allocations:
- Filter by `payment_model_type = 'pay_as_you_go'`
- Only show active mining sessions (not historical contracts)

---

## Testing Checklist

After GPU Plans page updates:

- [ ] Page loads without errors
- [ ] All contract UI is hidden
- [ ] "Mine" button is visible and clickable (not "Invest")
- [ ] No "Expected ROI" or "0.13%" text visible
- [ ] Clicking mine → checkout flow works
- [ ] After successful payment, mining progress animation plays
- [ ] Mining progress shows: "Earned: $X.XX of $Y.YY"
- [ ] When progress reaches target, completion screen shows
- [ ] Withdraw button is disabled if KYC not verified
- [ ] Withdraw button is enabled if KYC approved
- [ ] Portfolio shows capital and profit correctly
- [ ] No console errors

---

## Additional Files to Update

### 1. Admin GPU Plans Page (`app/admin/gpu-node-plans/page.tsx`)
- Add fields to edit `profit_min`, `profit_max`, `base_roi_multiplier`
- Remove contract term fields
- Update table display

### 2. Checkout/Payment Flow
- Ensure mining calculation is called AFTER payment
- Store `targetProfit` in mining_sessions table
- API should return target profit to frontend

### 3. Financials Page
- Update "Mining Earnings" section to show real-time session earnings
- Remove "Expected Returns" calculations
- Show actual profit earned vs target

---

## Code Examples

### Mining Calculation Example
```typescript
import { calculateMiningSession } from '@/lib/mining-calculations';

// When user starts mining
const sessionCalc = calculateMiningSession(investAmount, nodeMultiplier);
console.log('Target daily profit:', sessionCalc.targetProfit); // e.g., 0.35
console.log('ROI today:', sessionCalc.roiPercentageDaily); // e.g., 7%
console.log('ROI weekly:', sessionCalc.roiPercentageWeekly); // e.g., 48.57%
```

### Mining Progress Example
```typescript
import { simulateMiningProgress } from '@/lib/mining-calculations';

// In animation loop (every 100ms)
const elapsedSeconds = (Date.now() - sessionStartTime) / 1000;
const accumulated = simulateMiningProgress(targetProfit, elapsedSeconds, 60);

if (simulateMiningProgress(accumulated, targetProfit)) {
  // Mining complete
  console.log('Session complete!');
}
```

### KYC Gate Example
```typescript
function WithdrawButton() {
  const { kyc_verified, kyc_status } = useUser();
  
  if (!kyc_verified) {
    return (
      <button disabled className="opacity-50">
        Complete KYC Verification to Withdraw
      </button>
    );
  }
  
  if (kyc_status === 'pending') {
    return (
      <button disabled className="opacity-50">
        KYC Under Review (24-48 hours)
      </button>
    );
  }
  
  return <button>Withdraw Profits</button>;
}
```

---

## Notes for Developer

1. **Token Constraint**: The GPU plans page is 3,725 lines. Due to API token limits, it should be refactored in smaller sections
2. **Testing**: Each change should be tested immediately to avoid cascade errors
3. **Backward Compatibility**: Old contract data in database won't break if you keep the columns but just filter them out
4. **API Updates**: Ensure `/api/mining/start` endpoint creates records in `mining_sessions` table
5. **Real-time Sync**: Consider using Supabase subscriptions to sync accumulated profit in real-time

---

## Summary of Changes by Lines (Approximate)

| Section | Lines | Change |
|---------|-------|--------|
| Plan cards | 2400-2600 | Remove contract, add multiplier display |
| Mining button | 1887-1950 | Update handler, add mining logic |
| Withdrawal modal | 1600-1750 | Add KYC gate |
| State definitions | 100-300 | Remove contract states, add mining session state |
| Render output | 3500-3725 | Update UI text "Invest" → "Mine" |

This guide should be completed in 2-3 focused sessions. Start with terminology changes, then UI restructuring, then KYC implementation.
