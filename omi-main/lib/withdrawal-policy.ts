// lib/withdrawal-policy.ts
// ─────────────────────────────────────────────────────────────────────────────
// SINGLE SOURCE OF TRUTH for all withdrawal rules.
// Imports from holiday-calendar.ts for window logic.
// Used by: financials/page.tsx, gpu-plans/page.tsx, api/withdrawal-policy/route.ts
// ─────────────────────────────────────────────────────────────────────────────

import {
  getHolidaysSync,
  getTodayHolidayWAT,
  nextValidWithdrawalMonday,
  formatWithdrawalWindow,
  toWATDateString,
  nowInWAT,
  type Holiday,
} from "./holiday-calendar";

// ─── WAT WITHDRAWAL WINDOW ────────────────────────────────────────────────────
export const WITHDRAWAL_WINDOW_START_HOUR = 8;  // 08:00 WAT
export const WITHDRAWAL_WINDOW_END_HOUR   = 21; // 21:00 WAT
export const WITHDRAWAL_DAY_OF_WEEK       = 1;  // Monday (0=Sun…6=Sat)

// ─── WINDOW STATE ─────────────────────────────────────────────────────────────
export type WithdrawalWindowState =
  | "OPEN"
  | "CLOSED_WEEKEND"
  | "CLOSED_WEEKDAY"
  | "CLOSED_HOLIDAY"
  | "CLOSED_OUTSIDE_HOURS"
  | "PAUSED_ADMIN";

export type WithdrawalWindow = {
  state: WithdrawalWindowState;
  isOpen: boolean;
  todayHoliday: Holiday | null;
  nextWindowDate: Date;
  nextWindowLabel: string;
  currentWATHour: number;
  currentWATDay: number;
};

/** Returns the current withdrawal window status (WAT). Pure — no async. */
export function getWithdrawalWindow(
  adminPaused = false,
  holidays: Holiday[] = getHolidaysSync(),
): WithdrawalWindow {
  const now = nowInWAT();
  const day  = now.getDay();
  const hour = now.getHours();
  const todayHoliday = getTodayHolidayWAT(holidays);
  const nextWindowDate = nextValidWithdrawalMonday(holidays);
  const nextWindowLabel = formatWithdrawalWindow(nextWindowDate);

  if (adminPaused) {
    return { state: "PAUSED_ADMIN", isOpen: false, todayHoliday, nextWindowDate, nextWindowLabel, currentWATHour: hour, currentWATDay: day };
  }

  if (todayHoliday) {
    return { state: "CLOSED_HOLIDAY", isOpen: false, todayHoliday, nextWindowDate, nextWindowLabel, currentWATHour: hour, currentWATDay: day };
  }

  if (day !== WITHDRAWAL_DAY_OF_WEEK) {
    const state = (day === 0 || day === 6) ? "CLOSED_WEEKEND" : "CLOSED_WEEKDAY";
    return { state, isOpen: false, todayHoliday, nextWindowDate, nextWindowLabel, currentWATHour: hour, currentWATDay: day };
  }

  // It IS Monday and not a holiday — check time
  if (hour < WITHDRAWAL_WINDOW_START_HOUR || hour >= WITHDRAWAL_WINDOW_END_HOUR) {
    return { state: "CLOSED_OUTSIDE_HOURS", isOpen: false, todayHoliday, nextWindowDate, nextWindowLabel, currentWATHour: hour, currentWATDay: day };
  }

  return { state: "OPEN", isOpen: true, todayHoliday, nextWindowDate, nextWindowLabel, currentWATHour: hour, currentWATDay: day };
}

/** Human-readable explanation of why the window is closed. */
export function getWindowClosedReason(window: WithdrawalWindow): string {
  switch (window.state) {
    case "OPEN":
      return "";
    case "PAUSED_ADMIN":
      return "Withdrawals are temporarily paused. Please check back later.";
    case "CLOSED_HOLIDAY":
      return `Today is a public holiday (${window.todayHoliday?.name}). Next window: ${window.nextWindowLabel}.`;
    case "CLOSED_WEEKEND":
      return `Withdrawals are processed on Mondays only (08:00–16:00 WAT). Next: ${window.nextWindowLabel}.`;
    case "CLOSED_WEEKDAY":
      return `Withdrawals are processed on Mondays only (08:00–16:00 WAT). Next: ${window.nextWindowLabel}.`;
    case "CLOSED_OUTSIDE_HOURS": {
      const h = window.currentWATHour;
      if (h < WITHDRAWAL_WINDOW_START_HOUR) {
        return `Window opens at 08:00 WAT today. Current time: ${h.toString().padStart(2,"0")}:xx WAT.`;
      }
      return `Today's window closed at 21:00 WAT. Next: ${window.nextWindowLabel}.`;
    }
  }
}

// ─── LOCK PERIODS (per tier) ──────────────────────────────────────────────────
export const LOCK_DAYS_BY_TIER: Record<number, number> = {
  0: 7,   // Lite Node
  1: 14,  // Foundation Node
  2: 21,  // RTX 4090 Node
  3: 30,  // A100 GPU Node
  4: 45,  // H100 PCIe Node
};
export const TASK_EARNINGS_LOCK_DAYS = 3;

/** Returns lock unlock date for a given allocation start date + tier. */
export function getLockUnlockDate(createdAt: string | Date, tier: number): Date {
  const days = LOCK_DAYS_BY_TIER[tier] ?? 7;
  const base = new Date(createdAt);
  return new Date(base.getTime() + days * 86_400_000);
}

/** Returns lock status for a given allocation. */
export type LockStatus = {
  isLocked: boolean;
  unlockDate: Date;
  daysRemaining: number;
  hoursRemaining: number;
  lockDays: number;
  tier: number;
};

export function getLockStatus(createdAt: string | Date, tier: number): LockStatus {
  const unlockDate = getLockUnlockDate(createdAt, tier);
  const now = Date.now();
  const remaining = unlockDate.getTime() - now;
  const isLocked = remaining > 0;
  const daysRemaining  = Math.max(0, Math.ceil(remaining / 86_400_000));
  const hoursRemaining = Math.max(0, Math.ceil(remaining / 3_600_000));
  return { isLocked, unlockDate, daysRemaining, hoursRemaining, lockDays: LOCK_DAYS_BY_TIER[tier] ?? 7, tier };
}

// ─── FEE SCHEDULE ─────────────────────────────────────────────────────────────
export type FeeResult = {
  grossAmount: number;
  feePercent: number;
  feeAmount: number;
  netAmount: number; // what user receives after fee
  label: string;
};

export function calcWithdrawalFee(
  gross: number,
  feeSchedule?: Array<{ maxAmount: number | null; pct: number }>,
): FeeResult {
  const schedule = feeSchedule ?? DEFAULT_FEE_SCHEDULE;
  const tier = schedule.find((t) => t.maxAmount === null || gross <= t.maxAmount);
  const pct = tier?.pct ?? 1;
  const feeAmount = parseFloat((gross * pct / 100).toFixed(4));
  const netAmount = parseFloat((gross - feeAmount).toFixed(4));
  return {
    grossAmount: gross,
    feePercent: pct,
    feeAmount,
    netAmount,
    label: `${pct}% fee ($${feeAmount.toFixed(2)})`,
  };
}

export const DEFAULT_FEE_SCHEDULE: Array<{ maxAmount: number | null; pct: number }> = [
  { maxAmount: 10,   pct: 5 },
  { maxAmount: 100,  pct: 2 },
  { maxAmount: null, pct: 1 },
];

// ─── WEEKLY LIMITS & QUICK AMOUNTS ────────────────────────────────────────────
export type TierWithdrawalPolicy = {
  tier: number;
  tierName: string;
  weeklyMaxUSD: number;
  quickAmounts: number[];
  minWithdrawal: number;
};

export const TIER_WITHDRAWAL_POLICIES: TierWithdrawalPolicy[] = [
  {
    tier: 0,
    tierName: "Lite Node",
    weeklyMaxUSD: 10,
    quickAmounts: [1, 2, 5],
    minWithdrawal: 1,
  },
  {
    tier: 1,
    tierName: "Foundation Node",
    weeklyMaxUSD: 50,
    quickAmounts: [5, 10, 20],
    minWithdrawal: 5,
  },
  {
    tier: 2,
    tierName: "RTX 4090 Node",
    weeklyMaxUSD: 200,
    quickAmounts: [10, 25, 50],
    minWithdrawal: 10,
  },
  {
    tier: 3,
    tierName: "A100 GPU Node",
    weeklyMaxUSD: 500,
    quickAmounts: [25, 50, 100],
    minWithdrawal: 25,
  },
  {
    tier: 4,
    tierName: "H100 PCIe",
    weeklyMaxUSD: 2000,
    quickAmounts: [50, 100, 250],
    minWithdrawal: 50,
  },
];

/** Policy for task-only earnings (no node investment). */
export const TASK_WITHDRAWAL_POLICY: TierWithdrawalPolicy = {
  tier: -1,
  tierName: "Task Earnings",
  weeklyMaxUSD: 25,
  quickAmounts: [1, 5, 10],
  minWithdrawal: 1,
};

/** Returns the highest-tier withdrawal policy for a user based on their allocations. */
export function getUserWithdrawalPolicy(
  allocTiers: number[],
): TierWithdrawalPolicy {
  if (!allocTiers.length) return TASK_WITHDRAWAL_POLICY;
  const maxTier = Math.max(...allocTiers);
  return TIER_WITHDRAWAL_POLICIES[maxTier] ?? TIER_WITHDRAWAL_POLICIES[0];
}

// ─── WEEKLY USAGE ─────────────────────────────────────────────────────────────
/** Returns ISO date string for the start of the current week (Monday 00:00 WAT). */
export function currentWeekStart(): string {
  const now = nowInWAT();
  const day = now.getDay();
  const daysBack = day === 0 ? 6 : day - 1; // days since Monday
  const monday = new Date(now);
  monday.setDate(monday.getDate() - daysBack);
  monday.setHours(0, 0, 0, 0);
  return toWATDateString(monday);
}

// ─── SUSPICIOUS ACTIVITY FLAGS ────────────────────────────────────────────────
export type SuspiciousFlag =
  | "new_account_under_7_days"
  | "rapid_attempts"
  | "amount_spike"
  | "duplicate_payout_account";

export type RiskAssessment = {
  flagged: boolean;
  flags: SuspiciousFlag[];
  riskScore: number; // 0–100
};

export function assessWithdrawalRisk(params: {
  accountAgedays: number;
  attemptsLastHour: number;
  currentAmount: number;
  previousAmount: number | null;
  duplicatePayoutAccount: boolean;
}): RiskAssessment {
  const flags: SuspiciousFlag[] = [];

  if (params.accountAgedays < 7)        flags.push("new_account_under_7_days");
  if (params.attemptsLastHour > 3)       flags.push("rapid_attempts");
  if (params.previousAmount && params.currentAmount > params.previousAmount * 3)
                                          flags.push("amount_spike");
  if (params.duplicatePayoutAccount)      flags.push("duplicate_payout_account");

  const riskScore = Math.min(100, flags.length * 30);
  return { flagged: flags.length > 0, flags, riskScore };
}

// ─── FULL ELIGIBILITY CHECK ───────────────────────────────────────────────────
export type WithdrawalEligibility = {
  eligible: boolean;
  reasons: string[];
  window: WithdrawalWindow;
  fee: FeeResult | null;
  policy: TierWithdrawalPolicy;
  weeklyRemainingUSD: number;
};

export function checkWithdrawalEligibility(params: {
  amount: number;
  availableBalance: number;
  kycVerified: boolean;
  payoutRegistered: boolean;
  pinSet: boolean;
  frozen: boolean;
  adminPaused: boolean;
  allocTiers: number[];
  weeklyWithdrawnUSD: number;
  lockStatuses: LockStatus[];
  holidays?: Holiday[];
}): WithdrawalEligibility {
  const window = getWithdrawalWindow(params.adminPaused, params.holidays);
  const policy = getUserWithdrawalPolicy(params.allocTiers);
  const weeklyRemainingUSD = Math.max(0, policy.weeklyMaxUSD - params.weeklyWithdrawnUSD);
  const reasons: string[] = [];

  if (!window.isOpen)               reasons.push(getWindowClosedReason(window));
  if (params.frozen)                reasons.push("Your withdrawals are currently frozen. Contact support.");
  if (!params.kycVerified)          reasons.push("KYC verification required.");
  if (!params.payoutRegistered)     reasons.push("No payout account registered.");
  if (!params.pinSet)               reasons.push("Security PIN not set.");
  if (params.amount < policy.minWithdrawal)
                                    reasons.push(`Minimum withdrawal is $${policy.minWithdrawal}.`);
  if (params.amount > params.availableBalance)
                                    reasons.push(`Amount exceeds available balance ($${params.availableBalance.toFixed(2)}).`);
  if (params.amount > weeklyRemainingUSD)
                                    reasons.push(`Exceeds weekly limit. Remaining this week: $${weeklyRemainingUSD.toFixed(2)} of $${policy.weeklyMaxUSD}.`);



  const fee = params.amount > 0 ? calcWithdrawalFee(params.amount) : null;

  return {
    eligible: reasons.length === 0,
    reasons,
    window,
    fee,
    policy,
    weeklyRemainingUSD,
  };
}
