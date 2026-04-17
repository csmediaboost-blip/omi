import { supabase } from "@/lib/supabase";
import { requireAuth } from "@/lib/api-security";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    // SECURITY: Verify user authentication
    const authResult = await requireAuth(req);
    if (authResult instanceof NextResponse) {
      return authResult;
    }
    const { userId: authenticatedUserId } = authResult;

    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("userId");

    if (!userId) {
      return NextResponse.json(
        { error: "userId required" },
        { status: 400 }
      );
    }

    // SECURITY: Users can only view their own network
    if (userId !== authenticatedUserId) {
      return NextResponse.json(
        { error: "Forbidden: Cannot view another user's network" },
        { status: 403 }
      );
    }

    const { data, error } = await supabase
      .from("referrals")
      .select("*")
      .eq("referrer_id", userId);

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json(data || []);
  } catch (err: any) {
    console.error("Network route error:", err);
    return NextResponse.json(
      { error: err.message || "Failed to fetch network data" },
      { status: 500 }
    );
  }
}
