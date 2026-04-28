import { supabase } from "@/lib/supabase";
import { requireAuth } from "@/lib/api-security";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    // SECURITY: Verify user authentication
    const authResult = await requireAuth(req);
    if (authResult instanceof NextResponse) {
      return authResult;
    }
    const { userId: authenticatedUserId } = authResult;

    const { userId, full_name, wallet_address } = await req.json();

    // SECURITY: Verify requesting user matches userId
    if (userId !== authenticatedUserId) {
      return NextResponse.json(
        { error: "Forbidden: Cannot update settings for another user" },
        { status: 403 }
      );
    }

    // Validation
    if (!full_name || !full_name.trim()) {
      return NextResponse.json(
        { error: "Full name is required" },
        { status: 400 }
      );
    }

    if (wallet_address && !/^0x[a-fA-F0-9]{40}$/.test(wallet_address)) {
      return NextResponse.json(
        { error: "Invalid wallet address format" },
        { status: 400 }
      );
    }

    const { error } = await supabase
      .from("users")
      .update({
        full_name: full_name.trim(),
        wallet_address: wallet_address || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", userId);

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ 
      success: true,
      message: "Settings updated successfully"
    });
  } catch (err: any) {
    console.error("Settings update error:", err);
    return NextResponse.json(
      { error: err.message || "Failed to update settings" },
      { status: 500 }
    );
  }
}
