import { supabase } from "@/lib/supabase";
import { requireAuth } from "@/lib/api-security";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

const MIN_WITHDRAWAL = 5; // Minimum $5 withdrawal

export async function POST(req: NextRequest) {
  try {
    // SECURITY: Verify user authentication
    const authResult = await requireAuth(req);
    if (authResult instanceof NextResponse) {
      return authResult;
    }
    const { userId: authenticatedUserId } = authResult;

    const { userId, amount } = await req.json();

    // Verify requesting user matches userId
    if (userId !== authenticatedUserId) {
      return NextResponse.json(
        { error: "Forbidden: Cannot create withdrawal for another user" },
        { status: 403 }
      );
    }

    // Validate amount
    if (!amount || amount < MIN_WITHDRAWAL) {
      return NextResponse.json(
        { error: `Minimum withdrawal amount is $${MIN_WITHDRAWAL}` },
        { status: 400 }
      );
    }

    // SECURITY 2.4: Verify user has sufficient balance
    const adminSupabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    const { data: user, error: userError } = await adminSupabase
      .from("users")
      .select("balance_available, withdrawals_frozen, kyc_status")
      .eq("id", userId)
      .single();

    if (userError || !user) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      );
    }

    // SECURITY FIX 6: Require KYC approval before any withdrawal
    if (user.kyc_status !== "approved") {
      return NextResponse.json(
        { 
          error: "KYC verification required. Please complete your verification before requesting withdrawal.",
          kycRequired: true,
          currentStatus: user.kyc_status
        },
        { status: 403 }
      );
    }

    // Check if withdrawals are frozen
    if (user.withdrawals_frozen) {
      return NextResponse.json(
        { error: "Your withdrawals have been frozen. Please contact support." },
        { status: 403 }
      );
    }

    // Check balance
    const availableBalance = parseFloat(user.balance_available) || 0;
    if (availableBalance < amount) {
      return NextResponse.json(
        { 
          error: `Insufficient balance. Available: $${availableBalance.toFixed(2)}, Requested: $${amount.toFixed(2)}`,
          available: availableBalance
        },
        { status: 400 }
      );
    }

    // Create withdrawal request
    const { error: insertError } = await supabase.from("withdrawal_requests").insert({
      user_id: userId,
      amount,
      status: "pending",
    });

    if (insertError) {
      return NextResponse.json(
        { error: insertError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("Withdrawal request error:", err);
    return NextResponse.json(
      { error: err.message || "Internal server error" },
      { status: 500 }
    );
  }
}
