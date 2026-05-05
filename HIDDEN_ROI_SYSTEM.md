# Hidden Dynamic ROI System

## Overview

The ROI (Return on Investment) multiplier system is completely hidden from users. Users never see percentages, multipliers, or ROI calculations. They only see the final earned amounts in USD.

## How It Works

### User Experience
- User sees: "You earned $0.35 today"
- User does NOT see: "Your ROI multiplier was 1.05x"
- User does NOT see: "Base profit $0.333 × 1.05 = $0.35"

### Backend System

```
User mines → Backend generates random profit ($0.29-$0.40)
         ↓
Backend calculates dynamic ROI based on:
  - Node type (Foundation, RTX/A100, H100)
  - Time window (hourly/daily/weekly)
  - Investor volume (high volume = lower ROI, low volume = higher ROI)
         ↓
Final profit = Base profit × Dynamic ROI
         ↓
User sees final profit amount only (ROI hidden)
```

## Dynamic ROI Engine

File: `lib/dynamic-roi-engine.ts`

### Key Functions

1. **getDynamicRoi(nodeKey, period)**
   - Returns ROI multiplier (0.8x - 2.0x range)
   - Same ROI for all users on same plan in same time window
   - Changes hourly/daily/weekly based on period
   - Adjusted by investor volume

2. **calculateDynamicProfitForNode(amount, nodeKey, period)**
   - Returns final USD amount user sees
   - Already includes dynamic ROI (hidden)
   - No ROI details exposed

3. **applyTimeVariations(dailyProfit)**
   - Applies time-based modifiers:
     - Hourly: -20% from daily
     - Weekly: +10% bonus
     - Monthly: +25% bonus
   - Returns object with daily, hourly, weekly, monthly amounts

### Time Windows

All users on the same plan get the same ROI within a time window:

- **Hourly**: Changes every hour (2400 UTC)
  - `windowId = "2024-01-15-14"` (year-month-day-hour)
  - All users mining foundation nodes 2-3 PM get same ROI

- **Daily**: Changes every 24 hours at midnight UTC
  - `windowId = "2024-01-15"` (year-month-day)
  - All users mining RTX 4090 on Jan 15 get same ROI

- **Weekly**: Changes every Monday at 00:00 UTC
  - `windowId = "2024-01-08"` (Monday of that week)
  - All H100 miners that week get same ROI

- **Monthly**: Changes on 1st of month at 00:00 UTC
  - `windowId = "2024-01"` (year-month)
  - All miners in January get same ROI

### Investor Volume Impact

ROI adjusts based on active investor count:

```
If many investors active:
  - Supply is high
  - ROI decreased (min end of range)
  - Encourages new investors to join

If few investors active:
  - Supply is low
  - ROI increased (max end of range)
  - Rewards early movers

volumeFactor = 0.0 to 1.0
  0.0 = high investor count (use min ROI)
  0.5 = balanced (use mid ROI)
  1.0 = low investor count (use max ROI)
```

## ROI Ranges (Hidden)

These ranges are NEVER shown to users. Calculated internally only.

### Foundation Nodes
- Min: 0.9x
- Max: 1.2x
- Adjusted by volume: 0.9-1.2x

### Premium Nodes (RTX 4090, A100)
- Min: 1.0x
- Max: 1.4x
- Adjusted by volume: 1.0-1.4x

### Enterprise Nodes (H100, DGX)
- Min: 1.2x
- Max: 1.8x
- Adjusted by volume: 1.2-1.8x

## API Endpoints

### POST /api/mining/calculate-profit
Calculate profit with dynamic ROI already applied.

**Request:**
```json
{
  "investmentAmount": 100,
  "nodeKey": "foundation",
  "period": "daily"
}
```

**Response:**
```json
{
  "dailyProfit": 0.35,
  "hourlyProfit": 0.0117,
  "weeklyProfit": 2.695,
  "monthlyProfit": 13.125
}
```

**IMPORTANT**: Response contains only USD amounts. No ROI percentage, no multiplier, no calculation details.

## Frontend Usage

### Mining Calculations Library

File: `lib/mining-calculations.ts`

Used for progress animations and UI display:

```typescript
import { calculateMiningSession, simulateMiningProgress } from '@/lib/mining-calculations';

// Get profit targets (base amounts without ROI applied yet)
const mining = calculateMiningSession(investmentAmount);

// Simulate progress animation (0% to 100%)
const elapsed = 5; // 5 seconds
const progress = simulateMiningProgress(mining.targetProfit, elapsed, 60);
// Returns accumulated profit as time progresses

// Check if mining complete
const isComplete = shouldCompleteMining(accumulatedProfit, mining.targetProfit);
```

**Note**: These functions work with base amounts. Backend applies the hidden dynamic ROI before amounts are committed to the database.

## Database Schema

### mining_sessions Table

```sql
CREATE TABLE mining_sessions (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  node_key VARCHAR,
  investment_amount DECIMAL,
  daily_profit DECIMAL,      -- Final amount (ROI included, hidden)
  hourly_profit DECIMAL,
  weekly_profit DECIMAL,
  monthly_profit DECIMAL,
  status VARCHAR,             -- 'mining', 'completed', 'earned'
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  created_at TIMESTAMP
);
```

**Important**: `daily_profit` field stores the final amount shown to user. The ROI multiplier used is never stored - it's recalculated fresh each time from the time window seed.

## Seeded Random Generation

The dynamic ROI system uses seeded randomness so the same user gets the same ROI across multiple calculations in the same time window:

```typescript
function seededRandom(seed: string): number {
  // seed = "roi:foundation:2024-01-15-14"
  // Returns consistent value 0.0-1.0
  // Same seed = same value, always
}
```

This ensures:
- All foundation node miners 2-3 PM get same ROI
- Users can't game the system by mining multiple times
- Fair distribution across all users on same plan

## Testing the System

### Verify ROI is Hidden

1. Start a mining session
2. Check user profile/earnings page
3. You should see ONLY: `$0.35 earned today`
4. You should NOT see: `1.05x ROI multiplier` or `$0.333 base`

### Verify Consistency

1. Two users start mining same plan at same time
2. Both should see similar earnings
3. Confirm via database that dynamic ROI was applied
4. Verify ROI value is NOT exposed in API responses

### Verify Volume Impact

1. Check investor count in database
2. When high: ROI should trend lower (at min end of range)
3. When low: ROI should trend higher (at max end of range)
4. Monitor earnings reports to verify impact over time

## Security Notes

1. **Never expose ROI in API responses** - Always return only USD amounts
2. **Never log ROI to frontend** - Log only to backend console
3. **Cache ROI in Redis** - Reduce recalculation on every request
4. **Validate ROI bounds** - Ensure ROI stays 0.5x - 2.0x
5. **Audit investor volume** - Regular checks that volume calculations are correct

## Migration from Old System

Old system showed:
- "0.13% daily guaranteed"
- Node-specific multipliers (1.0x, 1.1x, 1.4x)
- Expected ROI percentages

New system shows:
- "Earn real-time profits from enterprise demand"
- No percentages, multipliers, or ROI data
- Only final earned amounts

### Code Changes Required

1. ✅ Removed ROI display from homepage
2. ✅ Removed ROI display from GPU plans page
3. ✅ Updated mining-calculations.ts (removed ROI functions)
4. ✅ Created dynamic-roi-engine.ts (backend only)
5. ✅ Created /api/mining/calculate-profit endpoint
6. TODO: Update any GPU plans page UI showing ROI (if exists)
7. TODO: Update any admin dashboards showing ROI (if exists)

## Monitoring & Analytics

Track ROI impact without exposing details:

```typescript
// Admin analytics (internal only)
{
  date: "2024-01-15",
  foundationNodeAverageEarnings: 0.34,  // Don't expose ROI
  rtxNodeAverageEarnings: 0.38,
  h100NodeAverageEarnings: 0.42,
  investorCount: 1250,
  systemHealth: "optimal"
}
```

All ROI metrics stay internal. Only earnings metrics are visible.

## Future Enhancements

1. Machine learning to adjust ROI based on market demand
2. Real-time ROI optimization per node type
3. Seasonal adjustments for compute cycles
4. Integration with actual enterprise workload data
5. Predictive ROI modeling based on historical patterns

All enhancements remain backend-only. User interface shows only earnings.
