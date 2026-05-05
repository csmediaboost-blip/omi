// lib/dynamic-roi-engine.ts
// Dynamic ROI system - generates random ROI percentages based on time windows
// and investor volume. All users on same plan at same time get same ROI.
// Users never see these percentages - only their earned amounts.

/**
 * ROI multiplier ranges (hidden from users)
 * Foundation Node baseline: 0.9x - 1.2x
 * Values vary by time window and investor demand
 */
const ROI_RANGES = {
  foundation: { min: 0.9, max: 1.2 },
  premium: { min: 1.0, max: 1.4 }, // RTX/A100
  enterprise: { min: 1.2, max: 1.8 }, // H100
};

/**
 * Get time window ID for consistent ROI across same window
 * Hourly: changes every hour
 * Daily: changes every 24 hours at midnight UTC
 * Weekly: changes every Monday UTC
 * Monthly: changes every 1st of month UTC
 */
function getTimeWindowId(period: "hourly" | "daily" | "weekly" | "monthly"): string {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth()).padStart(2, "0");
  const date = String(now.getUTCDate()).padStart(2, "0");
  const hours = String(now.getUTCHours()).padStart(2, "0");

  switch (period) {
    case "hourly":
      return `${year}-${month}-${date}-${hours}`;
    case "daily":
      return `${year}-${month}-${date}`;
    case "weekly": {
      // Get Monday of current week
      const d = new Date(now);
      const day = d.getUTCDay();
      const diff = d.getUTCDate() - day + (day === 0 ? -6 : 1);
      const monday = new Date(d.setUTCDate(diff));
      const weekYear = monday.getUTCFullYear();
      const weekMonth = String(monday.getUTCMonth()).padStart(2, "0");
      const weekDate = String(monday.getUTCDate()).padStart(2, "0");
      return `${weekYear}-${weekMonth}-${weekDate}`;
    }
    case "monthly":
      return `${year}-${month}`;
    default:
      return `${year}-${month}-${date}`;
  }
}

/**
 * Seeded random number generator for consistent values
 * Same seed always produces same sequence
 */
function seededRandom(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    const char = seed.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash % 10000) / 10000;
}

/**
 * Calculate investor volume impact on ROI
 * More investors = lower ROI (reduce supply)
 * Fewer investors = higher ROI (attract more)
 *
 * Volume impact: 0.0 - 1.0
 * 0.0 = many investors (use min ROI)
 * 1.0 = few investors (use max ROI)
 */
async function getInvestorVolumeFactor(nodeKey: string): Promise<number> {
  try {
    // In production, fetch actual investor count from database
    // For now, use a placeholder that would be implemented with real data
    // const { data: count } = await supabaseAdmin
    //   .from("node_allocations")
    //   .select("count()", { count: "exact" })
    //   .eq("node_key", nodeKey)
    //   .eq("active", true);
    //
    // const maxInvestors = 1000; // Threshold for "many"
    // return Math.max(0, Math.min(1, (maxInvestors - (count || 0)) / maxInvestors));

    // Placeholder: returns 0.5 for balanced ROI
    // Should be replaced with real investor count logic
    return 0.5;
  } catch (err) {
    console.error("[v0] Error calculating investor volume:", err);
    return 0.5; // Default to middle value on error
  }
}

/**
 * Generate dynamic ROI for a specific plan and time window
 * All users on same plan at same time window get same ROI
 *
 * ROI changes:
 * - Hourly: generates new ROI every hour
 * - Daily: generates new ROI every 24 hours
 * - Weekly: generates new ROI every Monday
 * - Monthly: generates new ROI every month 1st
 */
export async function getDynamicRoi(
  nodeKey: string,
  period: "hourly" | "daily" | "weekly" = "daily"
): Promise<number> {
  // Get time window ID (all users in same window get same ROI)
  const windowId = getTimeWindowId(period);

  // Create cache key
  const cacheKey = `roi:${nodeKey}:${windowId}`;

  // In production, check Redis cache first
  // For now, calculate deterministically
  const seed = cacheKey;
  const randomFactor = seededRandom(seed);

  // Get investor volume impact
  const volumeFactor = await getInvestorVolumeFactor(nodeKey);

  // Determine ROI range based on node tier
  let roiRange = ROI_RANGES.foundation;
  if (nodeKey.includes("a100") || nodeKey.includes("rtx4090")) {
    roiRange = ROI_RANGES.premium;
  } else if (nodeKey.includes("h100") || nodeKey.includes("dgx")) {
    roiRange = ROI_RANGES.enterprise;
  }

  // Apply volume factor to determine actual ROI within range
  // volumeFactor: 0 = use min (many investors), 1 = use max (few investors)
  const roiMultiplier =
    roiRange.min + (roiRange.max - roiRange.min) * volumeFactor;

  // Add randomness within range (±5% variation)
  const randomVariation = -0.05 + randomFactor * 0.1;
  const finalRoi = roiMultiplier * (1 + randomVariation);

  // Clamp to valid range
  return Math.max(0.8, Math.min(2.0, finalRoi));
}

/**
 * Calculate daily profit with dynamic ROI (backend only)
 * This profit is what users see, but the ROI multiplier used is hidden
 *
 * Example:
 * - User invests $100
 * - Base daily profit: $0.35
 * - Dynamic ROI: 1.05x (hidden)
 * - Final profit shown: $0.35 * 1.05 = $0.3675 (shown as earned amount)
 *
 * User never sees the "1.05x" multiplier
 */
export async function calculateDynamicProfitForNode(
  investmentAmount: number,
  nodeKey: string,
  period: "hourly" | "daily" | "weekly" = "daily"
): Promise<number> {
  // Base profit generation (stays same)
  const min = 0.29;
  const max = 0.4;
  const baseProfit = Math.random() * (max - min) + min;

  // Get dynamic ROI multiplier (backend only)
  const roiMultiplier = await getDynamicRoi(nodeKey, period);

  // Apply to base profit
  const finalProfit = baseProfit * roiMultiplier;

  return Math.round(finalProfit * 100) / 100; // Return as dollars, not percent
}

/**
 * Apply time-based variations to profit (same as before)
 * These are user-visible, but the underlying ROI is still hidden
 */
export function applyTimeVariations(dailyProfit: number) {
  return {
    daily: dailyProfit,
    hourly: dailyProfit / 24 * 0.8, // -20%
    weekly: dailyProfit * 7 * 1.1, // +10%
    monthly: dailyProfit * 30 * 1.25, // +25%
  };
}

/**
 * Validate that ROI is not too extreme
 * (safety check to prevent miscalculations)
 */
export function isValidRoi(roi: number): boolean {
  // ROI should stay between 0.5x (50% of base) and 2.0x (200% of base)
  return roi >= 0.5 && roi <= 2.0;
}

/**
 * Get ROI description for logging (no user-visible output)
 */
export function getRoiDescription(roi: number): string {
  if (roi < 1.0) return "conservative";
  if (roi < 1.2) return "standard";
  if (roi < 1.5) return "premium";
  return "exceptional";
}

export default {
  getDynamicRoi,
  calculateDynamicProfitForNode,
  applyTimeVariations,
  isValidRoi,
  getRoiDescription,
};
