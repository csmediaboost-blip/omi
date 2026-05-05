// lib/mining-calculations.ts
// Mining profit calculation system for dynamic ROI-based earnings
// Replaces fixed 0.13% daily system with random $0.29-$0.40 daily profit

/**
 * Mining calculation results for a single mining session
 * NOTE: ROI multipliers are calculated backend-only and never shown to users
 * Users only see the final earned amounts in USD
 */
export interface MiningCalculation {
  targetProfit: number; // Daily target profit in USD (user-visible)
  hourlyProfit: number; // Hourly target in USD with -20% reduction (user-visible)
  weeklyProfit: number; // Weekly target in USD with +10% bonus (user-visible)
  monthlyProfit: number; // Monthly target in USD with +25% bonus (user-visible)
  // NOTE: NO roiPercentageDaily, roiPercentageHourly, etc. - ROI stays hidden
}

/**
 * Generate random daily profit between $0.29-$0.40
 * This replaces the fixed 0.13% daily guarantee
 */
export function generateDailyProfit(): number {
  const min = 0.29;
  const max = 0.40;
  return Math.random() * (max - min) + min;
}

/**
 * Apply node-specific ROI multiplier to profit
 * Foundation Node: 1.0x (baseline)
 * RTX 4090/A100: 1.1x (+10%)
 * H100/Others: 1.4x (+40%)
 */
export function applyRoiMultiplier(profit: number, roiMultiplier: number): number {
  return Math.round((profit * roiMultiplier) * 100) / 100; // Round to 2 decimals
}

/**
 * Calculate hourly profit with -20% reduction from daily
 * Daily: $0.35 → Hourly before reduction: $0.35/24 = $0.0146
 * Hourly after -20%: $0.0146 * 0.8 = $0.0117
 */
export function calculateHourlyProfit(dailyProfit: number): number {
  const hourlyBeforeReduction = dailyProfit / 24;
  const hourlyWithReduction = hourlyBeforeReduction * 0.8; // -20%
  return Math.round(hourlyWithReduction * 10000) / 10000; // Round to 4 decimals
}

/**
 * Calculate weekly profit with +10% bonus from daily
 * Daily: $0.35 → Weekly: $0.35 * 7 = $2.45
 * Weekly with +10%: $2.45 * 1.1 = $2.695
 */
export function calculateWeeklyProfit(dailyProfit: number): number {
  const weeklyBeforeBonus = dailyProfit * 7;
  const weeklyWithBonus = weeklyBeforeBonus * 1.1; // +10%
  return Math.round(weeklyWithBonus * 100) / 100; // Round to 2 decimals
}

/**
 * Calculate monthly profit with +25% bonus from daily
 * Daily: $0.35 → Monthly: $0.35 * 30 = $10.50
 * Monthly with +25%: $10.50 * 1.25 = $13.125
 */
export function calculateMonthlyProfit(dailyProfit: number): number {
  const monthlyBeforeBonus = dailyProfit * 30;
  const monthlyWithBonus = monthlyBeforeBonus * 1.25; // +25%
  return Math.round(monthlyWithBonus * 100) / 100; // Round to 2 decimals
}

// ROI percentage calculations removed - ROI stays hidden from users
// Only final earned amounts are shown to users
// Backend dynamic-roi-engine.ts handles all ROI calculations internally

/**
 * Calculate mining profits for a session (frontend use only)
 * NOTE: Dynamic ROI is calculated backend-only via dynamic-roi-engine.ts
 * This function is used for progress simulation on the frontend
 * All ROI multiplier logic is hidden from users
 */
export function calculateMiningSession(
  investmentAmount: number
): MiningCalculation {
  // Generate random daily profit ($0.29-$0.40)
  // Backend dynamic ROI will be applied server-side before user sees the amount
  const targetProfit = generateDailyProfit();
  
  // Calculate time-based variations
  const hourlyProfit = calculateHourlyProfit(targetProfit);
  const weeklyProfit = calculateWeeklyProfit(targetProfit);
  const monthlyProfit = calculateMonthlyProfit(targetProfit);
  
  // Return only USD amounts - no ROI percentages shown
  return {
    targetProfit,
    hourlyProfit,
    weeklyProfit,
    monthlyProfit,
  };
}

/**
 * Simulate mining progress (used for frontend animation)
 * Returns accumulated profit from start to current time
 */
export function simulateMiningProgress(
  targetProfit: number,
  elapsedSeconds: number,
  totalDurationSeconds: number = 60 // Default 60-second mining animation
): number {
  // Linear progress: profit accumulates proportionally to elapsed time
  const progress = Math.min(elapsedSeconds / totalDurationSeconds, 1);
  const accumulated = targetProfit * progress;
  return Math.round(accumulated * 100) / 100;
}

/**
 * Check if mining session should be completed
 * Returns true when accumulated profit >= target profit
 */
export function shouldCompleteMining(
  accumulatedProfit: number,
  targetProfit: number
): boolean {
  return accumulatedProfit >= targetProfit;
}
