# Hidden ROI System - Architecture Diagram

## User Mining Flow (What Users Experience)

```
┌─────────────────────────────────────────────────────────────────┐
│                        USER INTERFACE                           │
│                                                                 │
│  User clicks: "Mine with Foundation Node - $5"                 │
│       ↓                                                         │
│  User sees: "Mining started..."                                │
│       ↓                                                         │
│  [Progress bar filling up]                                     │
│       ↓                                                         │
│  User sees: "Mining complete! You earned $0.35"               │
│       ↓                                                         │
│  Earnings added to wallet                                      │
│       ↓                                                         │
│  User can: Withdraw or start new session                       │
│                                                                 │
│  ❌ User NEVER sees:                                            │
│     - ROI percentage (1.05x)                                   │
│     - Base profit ($0.333)                                     │
│     - How $0.333 × 1.05 = $0.35                               │
│     - Multiplier value                                         │
│     - Market demand adjustment                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Backend Mining Flow (What System Does)

```
┌──────────────────────────────────────────────────────────────────────┐
│                      BACKEND PROCESSING                              │
│                                                                      │
│  1. User clicks "Start Mining"                                      │
│     ↓                                                                │
│  2. POST /api/mining/calculate-profit                               │
│     └─ Input: { investmentAmount: 5, nodeKey: "foundation" }       │
│     ↓                                                                │
│  3. lib/dynamic-roi-engine.ts:getDynamicRoi("foundation")          │
│     ├─ Get time window: "2024-01-15-14" (2 PM UTC)               │
│     ├─ Get investor volume: 1,247 active                           │
│     ├─ Calculate volume factor: 0.35 (toward min)                  │
│     ├─ ROI range for Foundation: 0.9x - 1.2x                      │
│     ├─ Calculate: 0.9 + (1.2-0.9) * 0.35 = 1.005x                │
│     └─ Return ROI: 1.005x [HIDDEN FROM USER]                      │
│     ↓                                                                │
│  4. Generate base daily profit:                                     │
│     └─ Random($0.29-$0.40) = $0.348 [HIDDEN FROM USER]            │
│     ↓                                                                │
│  5. Apply dynamic ROI (BACKEND ONLY):                               │
│     └─ $0.348 × 1.005 = $0.350 [THIS IS SHOWN TO USER]           │
│     ↓                                                                │
│  6. Calculate time variations:                                      │
│     ├─ Hourly: $0.350 / 24 * 0.8 = $0.0117                        │
│     ├─ Weekly: $0.350 * 7 * 1.1 = $2.695                          │
│     └─ Monthly: $0.350 * 30 * 1.25 = $13.125                      │
│     ↓                                                                │
│  7. Return to frontend (NO ROI DETAILS):                            │
│     ├─ dailyProfit: 0.35      ✅ User sees this                    │
│     ├─ hourlyProfit: 0.0117   ✅ User sees this                    │
│     ├─ weeklyProfit: 2.695    ✅ User sees this                    │
│     ├─ monthlyProfit: 13.125  ✅ User sees this                    │
│     └─ roiMultiplier: 1.005   ❌ NOT in response                   │
│     ↓                                                                │
│  8. Frontend displays:                                              │
│     └─ "You earned $0.35 today"                                    │
│                                                                      │
│  9. Store to database:                                              │
│     mining_sessions {                                               │
│       daily_profit: 0.35,   // Final amount only                   │
│       // No ROI stored!                                             │
│     }                                                                │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

## System Components

```
┌──────────────────────────────────────────────────────────────────────┐
│                    DYNAMIC ROI ENGINE                                 │
│               (lib/dynamic-roi-engine.ts)                             │
│                                                                      │
│  Input: nodeKey, period                                             │
│     ↓                                                                │
│  ┌─────────────────────────────────────────┐                       │
│  │ 1. Get Time Window ID                   │                       │
│  │    "2024-01-15-14" (hourly)             │                       │
│  │    "2024-01-15" (daily)                 │                       │
│  │    "2024-01-08" (weekly Monday)         │                       │
│  │    "2024-01" (monthly)                  │                       │
│  └─────────────────────────────────────────┘                       │
│     ↓                                                                │
│  ┌─────────────────────────────────────────┐                       │
│  │ 2. Seeded Random Generation             │                       │
│  │    seed = "roi:foundation:2024-01-15-14"│                       │
│  │    Same seed → Same ROI for all users   │                       │
│  └─────────────────────────────────────────┘                       │
│     ↓                                                                │
│  ┌─────────────────────────────────────────┐                       │
│  │ 3. Get Investor Volume Factor           │                       │
│  │    Count: 1,247 active investors        │                       │
│  │    Factor: 0.0 (many) to 1.0 (few)    │                       │
│  │    Impact: Affects ROI range position   │                       │
│  └─────────────────────────────────────────┘                       │
│     ↓                                                                │
│  ┌─────────────────────────────────────────┐                       │
│  │ 4. Select ROI Range                     │                       │
│  │    Foundation: 0.9x - 1.2x              │                       │
│  │    Premium (RTX/A100): 1.0x - 1.4x     │                       │
│  │    Enterprise (H100): 1.2x - 1.8x      │                       │
│  └─────────────────────────────────────────┘                       │
│     ↓                                                                │
│  ┌─────────────────────────────────────────┐                       │
│  │ 5. Calculate ROI Within Range            │                       │
│  │    ROI = min + (max-min) * volumeFactor │                       │
│  │    1.0x + (0.2) * 0.35 = 1.07x         │                       │
│  └─────────────────────────────────────────┘                       │
│     ↓                                                                │
│  ┌─────────────────────────────────────────┐                       │
│  │ 6. Add Random Variation (±5%)            │                       │
│  │    1.07x * (1 ± 0.05)                   │                       │
│  │    = 1.005x to 1.124x range             │                       │
│  └─────────────────────────────────────────┘                       │
│     ↓                                                                │
│  Output: ROI multiplier (0.5x - 2.0x)                              │
│  [BACKEND ONLY - NEVER EXPOSED]                                    │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

## Time Window Consistency

```
┌────────────────────────────────────────────────────────────────┐
│  HOURLY: 2 PM UTC on Jan 15                                   │
│                                                                │
│  Window ID: "2024-01-15-14"                                   │
│  Duration: 14:00 - 14:59 UTC                                  │
│                                                                │
│  Miners Active in This Window:                                │
│  - User A (Foundation Node)     → ROI = 1.005x               │
│  - User B (Foundation Node)     → ROI = 1.005x ← SAME!       │
│  - User C (RTX 4090)            → ROI = 1.125x               │
│  - User D (RTX 4090)            → ROI = 1.125x ← SAME!       │
│  - User E (H100)                → ROI = 1.405x               │
│  - User F (H100)                → ROI = 1.405x ← SAME!       │
│                                                                │
│  At 15:00 UTC (next hour):                                    │
│  New window ID: "2024-01-15-15"                               │
│  All ROIs recalculated from seed                              │
│  All users get NEW ROI values                                 │
│                                                                │
│  Example:                                                     │
│  Window 14: ROI = 1.005x                                      │
│  Window 15: ROI = 1.025x  ← Different!                        │
│  Window 16: ROI = 0.995x  ← Different again!                  │
│                                                                │
│  Result: ROI naturally varies over time                        │
│  Benefit: Can't predict or game the system                    │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

## Data Flow: User → API → Database

```
┌─────────────┐
│    USER     │
│             │
│ Click       │
│ "Mine Now"  │
└──────┬──────┘
       │
       │ POST /api/mining/calculate-profit
       │ { investmentAmount: 5, nodeKey: "foundation" }
       ↓
┌─────────────────────────────────────────┐
│       API ENDPOINT                      │
│  /api/mining/calculate-profit           │
│                                         │
│ Receives request                        │
│ Calls: getDynamicRoi()                  │
│ Generates base profit                   │
│ Applies ROI (hidden)                    │
│                                         │
│ Returns: {                              │
│   dailyProfit: 0.35,                    │
│   hourlyProfit: 0.0117,                 │
│   ...                                   │
│ }                                       │
│ [NO ROI in response]                    │
└──────┬──────────────────────────────────┘
       │
       │ JSON response
       ↓
┌─────────────────────────────────┐
│   FRONTEND (React)              │
│                                 │
│ Receives earnings amounts       │
│ Displays to user:               │
│ "You earned $0.35 today"       │
│                                 │
│ Updates wallet:                 │
│ Calls POST /api/mining/save     │
└──────┬──────────────────────────┘
       │
       │ Save mining session
       │ { earned: 0.35, ... }
       ↓
┌──────────────────────────────────────┐
│      DATABASE                        │
│                                      │
│  INSERT INTO mining_sessions (       │
│    user_id: uuid,                    │
│    node_key: "foundation",           │
│    daily_profit: 0.35,  ← ONLY THIS │
│    status: "earned",                 │
│    created_at: now()                 │
│  );                                  │
│                                      │
│  [NO ROI column in table]            │
│  [ROI never stored, always           │
│   calculated fresh on demand]        │
│                                      │
└──────────────────────────────────────┘
```

## Investor Volume Impact

```
┌─────────────────────────────────────────────────────────────┐
│       INVESTOR COUNT IMPACT ON ROI                          │
│                                                             │
│  investorCount = query DB for active users                │
│  maxThreshold = 1000                                        │
│  volumeFactor = (maxThreshold - investorCount) / maxThreshold
│                                                             │
│  ┌─────────────┬──────────────┬──────────────────────────┐ │
│  │ Investors   │ Volume Fac.  │ Foundation ROI           │ │
│  ├─────────────┼──────────────┼──────────────────────────┤ │
│  │    < 100    │    0.9       │ 0.9 + 0.3*0.9 = 1.17x  │ │
│  │    200      │    0.8       │ 0.9 + 0.3*0.8 = 1.14x  │ │
│  │    500      │    0.5       │ 0.9 + 0.3*0.5 = 1.05x  │ │
│  │   1000      │    0.0       │ 0.9 + 0.3*0.0 = 0.90x  │ │
│  │   > 1000    │    0.0       │ 0.9 (min)              │ │
│  └─────────────┴──────────────┴──────────────────────────┘ │
│                                                             │
│  More investors    → Lower ROI (↓ to min)                  │
│  Fewer investors   → Higher ROI (↑ to max)                │
│                                                             │
│  Effect:                                                   │
│  - When system full (1000+ users): ROI = 0.9x            │
│    Users earn less, growth slows                           │
│  - When system empty (< 100 users): ROI = 1.17x          │
│    Users earn more, growth accelerates                     │
│  - Self-balancing system!                                 │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## Security Boundary

```
┌─────────────────────────────────────────────────────────────┐
│  SECURITY BOUNDARY                                          │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ FRONTEND (User-Facing)                               │  │
│  │                                                      │  │
│  │ ✅ See: Earnings amounts ($0.35)                    │  │
│  │ ✅ See: Time variations (hourly, weekly, monthly)   │  │
│  │ ✅ See: Node selection, mining status              │  │
│  │ ✅ See: Wallet balance, withdrawal options          │  │
│  │                                                      │  │
│  │ ❌ Can't see: ROI multiplier (1.005x)              │  │
│  │ ❌ Can't see: Base profit ($0.348)                 │  │
│  │ ❌ Can't see: Investor volume (1,247)              │  │
│  │ ❌ Can't see: Time window ID                        │  │
│  │ ❌ Can't see: ROI calculation formula               │  │
│  │                                                      │  │
│  │ Network Traffic:                                     │  │
│  │   → API returns only USD amounts                    │  │
│  │   → No ROI in JSON response                         │  │
│  │   → Console logs don't expose ROI                   │  │
│  │                                                      │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                             │
│  ════════════════════════════════════════════════════════  │
│          🔒 SECURITY BOUNDARY 🔒                           │
│  ════════════════════════════════════════════════════════  │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ BACKEND (Hidden Calculations)                        │  │
│  │                                                      │  │
│  │ dynamic-roi-engine.ts:                               │  │
│  │   • getDynamicRoi() → 1.005x multiplier             │  │
│  │   • getInvestorVolumeFactor() → 0.35                │  │
│  │   • seededRandom() → 0.456823...                    │  │
│  │   • getTimeWindowId() → "2024-01-15-14"             │  │
│  │                                                      │  │
│  │ Only logged to backend console                       │  │
│  │ Never sent to client                                 │  │
│  │ Never stored with user data                         │  │
│  │ Always recalculated from seed                        │  │
│  │                                                      │  │
│  │ Database:                                            │  │
│  │   • Stores only final amounts                        │  │
│  │   • No ROI column in mining_sessions                 │  │
│  │   • No investor volume data in user tables           │  │
│  │   • No time window tracking                          │  │
│  │                                                      │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                             │
│  Protection:                                                │
│  ✓ Frontend can't compute ROI (needs backend volume data)  │
│  ✓ Backend never exposes ROI in responses                  │
│  ✓ Database doesn't store ROI calculation inputs           │
│  ✓ API responses contain only final USD amounts            │
│  ✓ No formula for users to reverse-engineer               │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## Monitoring & Analytics (Internal Only)

```
┌────────────────────────────────────────────────────────────┐
│  ADMIN DASHBOARD (Internal Only)                           │
│  Never shown to users                                      │
│                                                            │
│  Metrics Tracked:                                          │
│  • Average daily ROI by node: 1.05x                        │
│  • ROI range (min/max): 0.95x - 1.15x                     │
│  • Active investor count: 1,247                            │
│  • Volume factor: 0.35                                     │
│  • Average earnings shown: $0.35                           │
│  • Time window: 2024-01-15-14                              │
│  • Next ROI change: 2024-01-15 15:00 UTC                  │
│                                                            │
│  Alerts (Internal):                                        │
│  ⚠ ROI going below 0.5x → Investigate                     │
│  ⚠ ROI going above 2.0x → Investigate                     │
│  ⚠ Investor count spike → Monitor volume factor           │
│  ⚠ Time window desync → Check calculation                │
│                                                            │
│  What's Public:                                            │
│  • Total miners active: 9,800+                             │
│  • Enterprise clients: 180+                                │
│  • Average earnings: $0.35 per session                     │
│                                                            │
│  What Stays Internal:                                      │
│  • ROI multiplier values                                   │
│  • Volume calculation details                              │
│  • Time window algorithm                                   │
│  • Investor demand metrics                                 │
│                                                            │
└────────────────────────────────────────────────────────────┘
```

---

**Key Principle**: Users see a simple, transparent system (earnings in dollars). Backend complexity (ROI, volume, timing) is completely hidden. This creates a fair, market-driven system without confusing users with percentages or multipliers.
