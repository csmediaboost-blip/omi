// // app/api/admin/gpu-tasks/route.ts
// import { createSupabaseServer } from "@/lib/supabase-server";
// import { NextRequest, NextResponse } from "next/server";

// export async function GET(req: NextRequest) {
//   const supabase = await createSupabaseServer();
//   const resource = req.nextUrl.searchParams.get("resource");

//   if (resource === "gpu_clients") {
//     const { data, error } = await supabase
//       .from("gpu_clients")
//       .select("*")
//       .order("created_at", { ascending: false });
//     if (error)
//       return NextResponse.json({ error: error.message }, { status: 500 });
//     return NextResponse.json(data);
//   }

//   if (resource === "allocations") {
//     const { data, error } = await supabase
//       .from("user_allocations")
//       .select("*, users(email, full_name, tier), gpu_clients(name, workload)")
//       .order("allocated_at", { ascending: false })
//       .limit(100);
//     if (error)
//       return NextResponse.json({ error: error.message }, { status: 500 });
//     return NextResponse.json(data);
//   }

//   if (resource === "licenses") {
//     const { data, error } = await supabase
//       .from("operator_licenses")
//       .select("*, users(email, full_name, tier)")
//       .order("purchased_at", { ascending: false });
//     if (error)
//       return NextResponse.json({ error: error.message }, { status: 500 });
//     return NextResponse.json(data);
//   }

//   if (resource === "surcharge_stats") {
//     const today = new Date();
//     today.setHours(0, 0, 0, 0);
//     const { data: charges } = await supabase
//       .from("monthly_surcharges")
//       .select("id, user_id, amount, charged_at, cycle_number")
//       .gte("charged_at", today.toISOString());
//     const { data: due } = await supabase
//       .from("operator_licenses")
//       .select("id, user_id, next_surcharge_at")
//       .lte("next_surcharge_at", new Date().toISOString())
//       .eq("status", "active");
//     return NextResponse.json({
//       charged_today: charges?.length || 0,
//       due_now: due?.length || 0,
//       due_list: due || [],
//     });
//   }

//   if (resource === "inactivity_stats") {
//     const cutoff = new Date(Date.now() - 3 * 86400000).toISOString();
//     const { data } = await supabase
//       .from("users")
//       .select(
//         "id, email, full_name, last_active_at, balance_available, balance_pending",
//       )
//       .lt("last_active_at", cutoff);
//     return NextResponse.json({ inactive_users: data || [] });
//   }

//   return NextResponse.json({ error: "Unknown resource" }, { status: 400 });
// }

// export async function POST(req: NextRequest) {
//   const supabase = await createSupabaseServer();
//   const body = await req.json();
//   const { action } = body;

//   if (action === "create_gpu_client") {
//     const {
//       name,
//       workload,
//       description,
//       base_payout,
//       risk_level,
//       risk_description,
//       failure_chance,
//       bonus_multiplier,
//       min_tier,
//       requires_license,
//       slots_total,
//     } = body;
//     if (!name || !workload) {
//       return NextResponse.json(
//         { error: "name and workload required" },
//         { status: 400 },
//       );
//     }
//     const { error } = await supabase.from("gpu_clients").insert({
//       name,
//       workload,
//       description: description || null,
//       base_payout: parseFloat(base_payout) || 0.05,
//       risk_level: risk_level || "low",
//       risk_description: risk_description || null,
//       failure_chance: parseInt(failure_chance) || 0,
//       bonus_multiplier: parseFloat(bonus_multiplier) || 1.0,
//       min_tier: min_tier || "observer",
//       requires_license: Boolean(requires_license),
//       slots_total: parseInt(slots_total) || 100,
//     });
//     if (error)
//       return NextResponse.json({ error: error.message }, { status: 500 });
//     return NextResponse.json({ success: true });
//   }

//   if (action === "update_gpu_client") {
//     const { id, ...fields } = body;
//     const { error } = await supabase
//       .from("gpu_clients")
//       .update(fields)
//       .eq("id", id);
//     if (error)
//       return NextResponse.json({ error: error.message }, { status: 500 });
//     return NextResponse.json({ success: true });
//   }

//   if (action === "toggle_gpu_client") {
//     const { id, status } = body;
//     const { error } = await supabase
//       .from("gpu_clients")
//       .update({ status })
//       .eq("id", id);
//     if (error)
//       return NextResponse.json({ error: error.message }, { status: 500 });
//     return NextResponse.json({ success: true });
//   }

//   if (action === "delete_gpu_client") {
//     const { error } = await supabase
//       .from("gpu_clients")
//       .delete()
//       .eq("id", body.id);
//     if (error)
//       return NextResponse.json({ error: error.message }, { status: 500 });
//     return NextResponse.json({ success: true });
//   }

//   if (action === "charge_surcharge_all") {
//     const { data: due } = await supabase
//       .from("operator_licenses")
//       .select("user_id")
//       .lte("next_surcharge_at", new Date().toISOString())
//       .eq("status", "active");
//     let charged = 0,
//       skipped = 0;
//     for (const row of due || []) {
//       const { data } = await supabase.rpc("charge_surcharge_if_due", {
//         p_user_id: row.user_id,
//       });
//       const r = data as any;
//       if (r?.success) charged++;
//       else skipped++;
//     }
//     return NextResponse.json({ charged, skipped });
//   }

//   if (action === "charge_surcharge_user") {
//     const { data, error } = await supabase.rpc("charge_surcharge_if_due", {
//       p_user_id: body.user_id,
//     });
//     if (error)
//       return NextResponse.json({ error: error.message }, { status: 500 });
//     return NextResponse.json(data);
//   }

//   if (action === "apply_inactivity_tax_all") {
//     const cutoff = new Date(Date.now() - 3 * 86400000).toISOString();
//     const { data: users } = await supabase
//       .from("users")
//       .select("id")
//       .lt("last_active_at", cutoff);
//     let slashed = 0,
//       skipped = 0;
//     for (const u of users || []) {
//       const { data } = await supabase.rpc("apply_inactivity_tax", {
//         p_user_id: u.id,
//       });
//       const r = data as any;
//       if (r?.success) slashed++;
//       else skipped++;
//     }
//     return NextResponse.json({ slashed, skipped });
//   }

//   if (action === "apply_inactivity_tax_user") {
//     const { data, error } = await supabase.rpc("apply_inactivity_tax", {
//       p_user_id: body.user_id,
//     });
//     if (error)
//       return NextResponse.json({ error: error.message }, { status: 500 });
//     return NextResponse.json(data);
//   }

//   if (action === "revoke_license") {
//     await supabase
//       .from("operator_licenses")
//       .update({ status: "revoked" })
//       .eq("user_id", body.user_id);
//     await supabase
//       .from("users")
//       .update({ has_operator_license: false })
//       .eq("id", body.user_id);
//     return NextResponse.json({ success: true });
//   }

//   if (action === "credit_user") {
//     const { user_id, amount, reason } = body;
//     const amt = parseFloat(amount);
//     await supabase
//       .from("users")
//       .update({
//         balance_available: supabase.rpc("increment", { x: amt }) as any,
//       })
//       .eq("id", user_id);
//     await supabase.from("transaction_ledger").insert({
//       user_id,
//       type: "bonus",
//       amount: amt,
//       description: reason || "Admin credit adjustment",
//     });
//     return NextResponse.json({ success: true });
//   }

//   return NextResponse.json({ error: "Unknown action" }, { status: 400 });
// }
