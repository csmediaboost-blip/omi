// app/api/mining/calculate-profit/route.ts
// Calculate mining profit using dynamic ROI engine
// All backend - users only see the final earned amount

import { NextRequest, NextResponse } from "next/server";
import { getDynamicRoi, applyTimeVariations } from "@/lib/dynamic-roi-engine";

/**
 * POST /api/mining/calculate-profit
 * Calculate profit for a mining session with dynamic ROI
 *
 * Request body:
 * {
 *   investmentAmount: number,
 *   nodeKey: string,
 *   period?: "hourly" | "daily" | "weekly"
 * }
 *
 * Response: {
 *   dailyProfit: number,     // User-visible amount
 *   hourlyProfit: number,
 *   weeklyProfit: number,
 *   monthlyProfit: number,
 *   // NOT included: the ROI multiplier used (stays hidden)
 * }
 */
export async function POST(req: NextRequest) {
  try {
    const { investmentAmount, nodeKey, period = "daily" } = await req.json();

    if (!investmentAmount || !nodeKey) {
      return NextResponse.json(
        { error: "Missing investmentAmount or nodeKey" },
        { status: 400 }
      );
    }

    // Validate period
    if (!["hourly", "daily", "weekly"].includes(period)) {
      return NextResponse.json(
        { error: "Invalid period" },
        { status: 400 }
      );
    }

    // Get dynamic ROI for this node and time window (backend only)
    const dynamicRoi = await getDynamicRoi(nodeKey, period as any);

    // Generate base daily profit ($0.29-$0.40)
    const min = 0.29;
    const max = 0.4;
    const baseProfit = Math.random() * (max - min) + min;

    // Apply dynamic ROI (hidden from user - only final amount shown)
    const dailyProfit = Math.round((baseProfit * dynamicRoi) * 100) / 100;

    // Apply time-based variations
    const variations = applyTimeVariations(dailyProfit);

    // Format response - NO ROI percentage shown to user
    return NextResponse.json(
      {
        dailyProfit: variations.daily,
        hourlyProfit: Math.round(variations.hourly * 10000) / 10000,
        weeklyProfit: Math.round(variations.weekly * 100) / 100,
        monthlyProfit: Math.round(variations.monthly * 100) / 100,
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error("[v0] Mining profit calculation error:", error);
    return NextResponse.json(
      { error: "Failed to calculate mining profit" },
      { status: 500 }
    );
  }
}
