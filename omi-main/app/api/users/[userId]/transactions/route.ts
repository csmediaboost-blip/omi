// app/api/users/[userId]/transactions/route.ts
import { getSupabaseServiceClient } from "@/lib/supabase";
import { NextRequest, NextResponse } from "next/server";

type RouteContext = { params: Promise<{ userId: string }> };

// ── GET /api/users/[userId]/transactions ──────────────────────────────────────
// Returns paginated transaction history for a user.
// Query params:
//   limit  — number of rows (default 50, max 100)
//   offset — pagination offset (default 0)
//   type   — filter by transaction type (e.g. "credit" | "debit")
export async function GET(req: NextRequest, { params }: RouteContext) {
  const { userId } = await params;

  if (!userId) {
    return NextResponse.json({ error: "Missing userId." }, { status: 400 });
  }

  const { searchParams } = req.nextUrl;
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "50"), 100);
  const offset = Math.max(parseInt(searchParams.get("offset") ?? "0"), 0);
  const type = searchParams.get("type"); // optional filter

  try {
    const supabase = getSupabaseServiceClient();

    let query = supabase
      .from("transactions")
      .select("*", { count: "exact" })
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (type) {
      query = query.eq("type", type);
    }

    const { data, error, count } = await query;

    if (error) {
      console.error("[transactions/GET] DB error:", error.code);
      return NextResponse.json(
        { error: "Failed to fetch transactions." },
        { status: 500 },
      );
    }

    return NextResponse.json(
      {
        data: data ?? [],
        total: count ?? 0,
        limit,
        offset,
      },
      { status: 200 },
    );
  } catch (err: any) {
    console.error(
      "[transactions/GET] Unexpected error:",
      err.code ?? "unknown",
    );
    return NextResponse.json(
      { error: "Internal server error." },
      { status: 500 },
    );
  }
}

// ── POST /api/users/[userId]/transactions ─────────────────────────────────────
// Creates a new transaction record and updates the user's balance via RPC.
// Body: { type: "credit" | "debit", amount: number, description?: string }
export async function POST(req: NextRequest, { params }: RouteContext) {
  const { userId } = await params;

  if (!userId) {
    return NextResponse.json({ error: "Missing userId." }, { status: 400 });
  }

  const body = await req.json().catch(() => null);
  if (!body) {
    return NextResponse.json(
      { error: "Invalid request body." },
      { status: 400 },
    );
  }

  const { type, amount, description } = body;

  if (!type || !["credit", "debit"].includes(type)) {
    return NextResponse.json(
      { error: "type must be 'credit' or 'debit'." },
      { status: 400 },
    );
  }

  const parsedAmount = parseFloat(amount);
  if (isNaN(parsedAmount) || parsedAmount <= 0) {
    return NextResponse.json(
      { error: "amount must be a positive number." },
      { status: 400 },
    );
  }

  try {
    const supabase = getSupabaseServiceClient();

    // Insert the transaction record
    const { data, error: insertError } = await supabase
      .from("transactions")
      .insert({
        user_id: userId,
        type,
        amount: parsedAmount,
        description: description ?? null,
        status: "completed",
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (insertError) {
      console.error("[transactions/POST] Insert error:", insertError.code);
      return NextResponse.json(
        { error: "Failed to create transaction." },
        { status: 500 },
      );
    }

    // Update user balance via RPC (credit adds, debit subtracts)
    const { error: rpcError } = await supabase.rpc("increment_user_balance", {
      user_id_param: userId,
      amount_param: type === "debit" ? -parsedAmount : parsedAmount,
    });

    if (rpcError) {
      // Transaction was recorded but balance update failed — log for manual review
      console.error("[transactions/POST] Balance RPC error:", rpcError.code);
    }

    return NextResponse.json(data, { status: 201 });
  } catch (err: any) {
    console.error(
      "[transactions/POST] Unexpected error:",
      err.code ?? "unknown",
    );
    return NextResponse.json(
      { error: "Internal server error." },
      { status: 500 },
    );
  }
}
