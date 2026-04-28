// app/api/admin/route.ts
// FRESH BUILD — reads users table directly for core data
// All optional tables degrade gracefully with try/catch

import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { requireAdminAuth, checkAdminRateLimit, getClientIp, logAdminAction } from "@/lib/api-security";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function getDb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

const safe = async <T>(fn: () => Promise<T>, fallback: T): Promise<T> => {
  try {
    return await fn();
  } catch {
    return fallback;
  }
};

const updateUser = async (uid: string, fields: Record<string, any>) => {
  const db = getDb();
  const { error } = await db.from("users").update(fields).eq("id", uid);
  if (error) throw new Error(error.message);
};

const tryInsert = async (table: string, data: any) => {
  try {
    const db = getDb();
    await db.from(table).insert(data);
  } catch {}
};

export async function GET(req: NextRequest) {
  // ── SECURITY: Check admin auth ──────────────────────────────
  const authResult = await requireAdminAuth(req);
  if (authResult instanceof Response) return authResult;
  const { userId } = authResult;

  // ── SECURITY: Rate limiting ─────────────────────────────────
  const clientIp = getClientIp(req);
  if (!checkAdminRateLimit(clientIp, 100, 60)) {
    return NextResponse.json(
      { error: "Rate limit exceeded" },
      { status: 429 }
    );
  }

  const resource = new URL(req.url).searchParams.get("resource");
  
  // Log the request
  await logAdminAction(userId, "GET_ADMIN_STATS", resource || "unknown", { 
    ip: clientIp,
    resource 
  });

  try {
    switch (resource) {
      case "stats": {
        const { data: users } = await db
          .from("users")
          .select(
            "id, balance_available, wallet_balance, account_flagged, kyc_status, withdwals_fronzen, node_expiry_date",
          );
        const u = users || [];
        const totalBalance = u.reduce(
          (s: number, x: any) =>
            s +
            (parseFloat(x.balance_available) ||
              parseFloat(x.wallet_balance) ||
              0),
          0,
        );
        let pendingSubs = 0,
          pendingWiths = 0;
        try {
          const { count: c } = await db
            .from("task_submissions")
            .select("id", { count: "exact", head: true })
            .eq("status", "pending");
          pendingSubs = c || 0;
        } catch {}
        try {
          const { count: c } = await db
            .from("withdrawals")
            .select("id", { count: "exact", head: true })
            .in("status", ["queued", "processing"]);
          pendingWiths = c || 0;
        } catch {}
        return NextResponse.json({
          totalUsers: u.length,
          totalBalance,
          pendingSubmissions: pendingSubs,
          pendingWithdrawals: pendingWiths,
          flaggedAccounts: u.filter((x: any) => x.account_flagged).length,
          frozenAccounts: u.filter((x: any) => x.withdwals_fronzen).length,
          pendingKyc: u.filter((x: any) => x.kyc_status === "pending").length,
          licensesExpired: u.filter(
            (x: any) =>
              x.node_expiry_date && new Date(x.node_expiry_date) < new Date(),
          ).length,
        });
      }

      case "users": {
        const { data, error } = await db
          .from("users")
          .select(
            `
          id, email, full_name, tier, role, is_admin,
          wallet_balance, pending_balance, balance_available, balance_pending, balance_locked,
          total_earned, earnings, total_withrawn, earning_withrawn, weekly_withdrawn, last_withhrawal_at,
          kyc_verified, kyc_status, kyc_fulll_name, kyc_verified_at, country, phone,
          payout_registered, cla_signed, terms_signed,
          payout_account_name, payout_account_number, payout_bank_name, payout_account_type,
          payout_kyc_match, payout_locked, payout_change_request, payout_gateway, payout_currency,
          withdwals_fronzen, account_flagged, fraud_score, fraud_flags,
          has_opertor_license, license_expires_at, node_expiry_date, node_activated_at,
          total_task_completed, total_submissions, approved_count, rejected_countb, qaulity_score,
          streak_count, weekly_task_count, consecutive_inactive_days, last_active_at,
          referral_code, referral_earnings, withdrawal_compliance_status, api_key, created_at
        `,
          )
          .order("created_at", { ascending: false });
        if (error) throw error;
        return NextResponse.json(
          (data || []).map((u: any) => ({
            ...u,
            withdrawals_frozen: u.withdwals_fronzen ?? false,
            kyc_full_name: u.kyc_fulll_name,
            total_withdrawn:
              parseFloat(u.total_withrawn) ||
              parseFloat(u.earning_withrawn) ||
              0,
            rejected_count: u.rejected_countb ?? 0,
            quality_score: u.qaulity_score ?? 0,
            has_operator_license: u.has_opertor_license ?? false,
            balance_available:
              parseFloat(u.balance_available) ||
              parseFloat(u.wallet_balance) ||
              0,
            balance_pending:
              parseFloat(u.balance_pending) ||
              parseFloat(u.pending_balance) ||
              0,
          })),
        );
      }

      case "kyc_submissions": {
        const { data: usersKyc } = await db
          .from("users")
          .select(
            "id, email, full_name, kyc_status, kyc_fulll_name, kyc_verified, kyc_verified_at, country, phone, created_at, compliance_doc_url",
          )
          .not("kyc_status", "is", null)
          .neq("kyc_status", "not_started")
          .order("created_at", { ascending: false });

        const fromUsers = (usersKyc || []).map((u: any) => ({
          id: u.id,
          user_id: u.id,
          source: "users_table",
          status:
            u.kyc_status === "approved"
              ? "approved"
              : u.kyc_status === "rejected"
                ? "rejected"
                : "pending",
          full_name: u.kyc_fulll_name || u.full_name,
          country: u.country,
          phone: u.phone,
          document_url: u.compliance_doc_url,
          created_at: u.created_at,
          users: {
            email: u.email,
            full_name: u.full_name,
            kyc_verified: u.kyc_verified,
          },
        }));

        let kycDocs: any[] = [];
        try {
          const { data: docs } = await db
            .from("kyc_documents")
            .select(
              "id, user_id, document_type, document_number, document_url, full_name, country, phone, status, admin_note, created_at",
            )
            .order("created_at", { ascending: false });
          if (docs?.length) {
            const ids = [...new Set(docs.map((d: any) => d.user_id))];
            const { data: rel } = await db
              .from("users")
              .select("id, email, full_name, kyc_verified")
              .in("id", ids);
            const um = Object.fromEntries(
              (rel || []).map((u: any) => [u.id, u]),
            );
            kycDocs = docs.map((d: any) => ({
              ...d,
              source: "kyc_documents",
              users: um[d.user_id] || {
                email: "—",
                full_name: d.full_name,
                kyc_verified: false,
              },
            }));
          }
        } catch {}

        const seen = new Set(kycDocs.map((d: any) => d.user_id));
        return NextResponse.json([
          ...kycDocs,
          ...fromUsers.filter((u: any) => !seen.has(u.user_id)),
        ]);
      }

      case "investments": {
        try {
          const { data: allocs } = await db
            .from("node_allocations")
            .select(
              "id, user_id, plan_id, amount_invested, status, lock_in_months, lock_in_label, lock_in_multiplier, maturity_date, total_earned, total_withdrawn, created_at",
            )
            .order("created_at", { ascending: false });
          if (!allocs?.length) return NextResponse.json([]);
          const uids = [...new Set(allocs.map((a: any) => a.user_id))];
          const pids = [...new Set(allocs.map((a: any) => a.plan_id))];
          const { data: users } = await db
            .from("users")
            .select("id, email, full_name")
            .in("id", uids);
          const um = Object.fromEntries(
            (users || []).map((u: any) => [u.id, u]),
          );
          let pm: Record<string, any> = {};
          try {
            const { data: plans } = await db
              .from("gpu_node_plans")
              .select("id, name, gpu_model, daily_pct")
              .in("id", pids);
            pm = Object.fromEntries((plans || []).map((p: any) => [p.id, p]));
          } catch {}
          return NextResponse.json(
            allocs.map((a: any) => ({
              ...a,
              users: um[a.user_id] || { email: "—" },
              gpu_node_plans: pm[a.plan_id] || {
                name: "—",
                gpu_model: "—",
                daily_pct: 0,
              },
            })),
          );
        } catch {
          return NextResponse.json([]);
        }
      }

      case "api_keys": {
        try {
          const { data } = await db
            .from("developer_api_keys")
            .select(
              "id, user_id, key_name, api_key, status, permissions, rate_limit, requests_today, description, created_at",
            )
            .order("created_at", { ascending: false });
          if (!data?.length) return NextResponse.json([]);
          const uids = [...new Set(data.map((k: any) => k.user_id))];
          const { data: users } = await db
            .from("users")
            .select("id, email, full_name")
            .in("id", uids);
          const um = Object.fromEntries(
            (users || []).map((u: any) => [u.id, u]),
          );
          return NextResponse.json(
            data.map((k: any) => ({
              ...k,
              users: um[k.user_id] || { email: "—" },
            })),
          );
        } catch {
          return NextResponse.json([]);
        }
      }

      case "submissions": {
        try {
          const { data: subs } = await db
            .from("task_submissions")
            .select(
              "id, user_id, task_id, status, proof_url, notes, reward_amount, rejection_reason, created_at",
            )
            .order("created_at", { ascending: false })
            .limit(200);
          if (!subs?.length) return NextResponse.json([]);
          const uids = [...new Set(subs.map((s: any) => s.user_id))];
          const tids = [...new Set(subs.map((s: any) => s.task_id))];
          const { data: users } = await db
            .from("users")
            .select("id, email, full_name, tier")
            .in("id", uids);
          const um = Object.fromEntries(
            (users || []).map((u: any) => [u.id, u]),
          );
          let tm: Record<string, any> = {};
          try {
            const { data: tasks } = await db
              .from("tasks")
              .select("id, title, payout_amount")
              .in("id", tids);
            tm = Object.fromEntries((tasks || []).map((t: any) => [t.id, t]));
          } catch {}
          return NextResponse.json(
            subs.map((s: any) => ({
              ...s,
              users: um[s.user_id] || { email: "—" },
              tasks: tm[s.task_id] || { title: "Task", payout_amount: 0 },
            })),
          );
        } catch {
          return NextResponse.json([]);
        }
      }

      case "withdrawals": {
        try {
          const { data: withs } = await db
            .from("withdrawals")
            .select(
              "id, user_id, amount, wallet_address, status, gateway, failure_reason, paid_at, created_at",
            )
            .order("created_at", { ascending: false })
            .limit(200);
          if (!withs?.length) return NextResponse.json([]);
          const uids = [...new Set(withs.map((w: any) => w.user_id))];
          const { data: users } = await db
            .from("users")
            .select("id, email, full_name")
            .in("id", uids);
          const um = Object.fromEntries(
            (users || []).map((u: any) => [u.id, u]),
          );
          return NextResponse.json(
            withs.map((w: any) => ({
              ...w,
              users: um[w.user_id] || { email: "—" },
            })),
          );
        } catch {
          return NextResponse.json([]);
        }
      }

      case "tasks": {
        try {
          const { data } = await db
            .from("tasks")
            .select("*")
            .order("created_at", { ascending: false });
          return NextResponse.json(data || []);
        } catch {
          return NextResponse.json([]);
        }
      }
      case "gpu_plans": {
        try {
          const { data } = await db
            .from("gpu_node_plans")
            .select("*")
            .order("sort_order");
          return NextResponse.json(data || []);
        } catch {
          return NextResponse.json([]);
        }
      }
      case "gpu_tiers": {
        try {
          const { data } = await db.from("gpu_tiers").select("*").order("id");
          return NextResponse.json(data || []);
        } catch {
          return NextResponse.json([]);
        }
      }

      case "support_tickets": {
        try {
          const { data: tickets } = await db
            .from("support_tickets")
            .select(
              "id, user_id, subject, category, status, priority, created_at, updated_at",
            )
            .order("updated_at", { ascending: false });
          if (!tickets?.length) return NextResponse.json([]);
          const uids = [...new Set(tickets.map((t: any) => t.user_id))];
          const { data: users } = await db
            .from("users")
            .select("id, email")
            .in("id", uids);
          const um = Object.fromEntries(
            (users || []).map((u: any) => [u.id, u]),
          );
          return NextResponse.json(
            tickets.map((t: any) => ({
              ...t,
              user_email: um[t.user_id]?.email || "—",
            })),
          );
        } catch {
          return NextResponse.json([]);
        }
      }

      case "waitlist": {
        try {
          const { data } = await db
            .from("gpu_waitlist")
            .select(
              "id, user_id, plan_id, email, status, admin_note, created_at",
            )
            .order("created_at", { ascending: false });
          return NextResponse.json(data || []);
        } catch {
          return NextResponse.json([]);
        }
      }
      case "withdrawal_freeze": {
        try {
          const { data } = await db
            .from("withdrawal_freeze")
            .select("*")
            .limit(1)
            .single();
          return NextResponse.json(data || { is_frozen: false });
        } catch {
          return NextResponse.json({ is_frozen: false });
        }
      }
      case "platform_announcements": {
        try {
          const { data } = await db
            .from("platform_announcements")
            .select("*")
            .eq("is_active", true)
            .order("created_at", { ascending: false });
          return NextResponse.json(data || []);
        } catch {
          return NextResponse.json([]);
        }
      }

      case "transactions": {
        try {
          const { data: txs } = await db
            .from("transactions")
            .select(
              "id, user_id, amount, gateway, status, node_key, tx_hash, crypto_amount, crypto_currency, created_at, notes",
            )
            .order("created_at", { ascending: false })
            .limit(200);
          if (!txs?.length) return NextResponse.json([]);
          const uids = [...new Set(txs.map((t: any) => t.user_id))];
          const { data: users } = await db
            .from("users")
            .select("id, email")
            .in("id", uids);
          const um = Object.fromEntries(
            (users || []).map((u: any) => [u.id, u]),
          );
          return NextResponse.json(
            txs.map((t: any) => ({
              ...t,
              users: um[t.user_id] || { email: "—" },
            })),
          );
        } catch {
          return NextResponse.json([]);
        }
      }

      case "fraud_events": {
        try {
          const { data: events } = await db
            .from("fraud_events")
            .select("id, user_id, event_type, details, severity, created_at")
            .order("created_at", { ascending: false })
            .limit(100);
          if (!events?.length) return NextResponse.json([]);
          const uids = [...new Set(events.map((e: any) => e.user_id))];
          const { data: users } = await db
            .from("users")
            .select("id, email")
            .in("id", uids);
          const um = Object.fromEntries(
            (users || []).map((u: any) => [u.id, u]),
          );
          return NextResponse.json(
            events.map((e: any) => ({
              ...e,
              users: um[e.user_id] || { email: "—" },
            })),
          );
        } catch {
          return NextResponse.json([]);
        }
      }

      case "payout_accounts": {
        const { data } = await db
          .from("users")
          .select(
            "id, email, full_name, kyc_fulll_name, kyc_verified, payout_registered, payout_account_name, payout_account_number, payout_bank_name, payout_account_type, payout_kyc_match, payout_locked, payout_change_request, payout_gateway, payout_currency",
          )
          .eq("payout_registered", true)
          .order("created_at", { ascending: false });
        return NextResponse.json(
          (data || []).map((u: any) => ({
            ...u,
            kyc_full_name: u.kyc_fulll_name,
            payout_change_requested: u.payout_change_request,
          })),
        );
      }

      case "expiring_licenses": {
        const now = new Date().toISOString();
        const in30 = new Date(Date.now() + 30 * 86400000).toISOString();
        const [{ data: expired }, { data: expiring }] = await Promise.all([
          db
            .from("users")
            .select(
              "id, email, full_name, tier, node_expiry_date, license_expires_at, has_opertor_license",
            )
            .or(`node_expiry_date.lt.${now},license_expires_at.lt.${now}`)
            .not("node_expiry_date", "is", null),
          db
            .from("users")
            .select(
              "id, email, full_name, tier, node_expiry_date, license_expires_at, has_opertor_license",
            )
            .gte("node_expiry_date", now)
            .lte("node_expiry_date", in30),
        ]);
        return NextResponse.json({
          expired: expired || [],
          expiring: expiring || [],
        });
      }

      case "datacenter_media": {
        try {
          const { data } = await db
            .from("datacenter_media")
            .select("*")
            .eq("is_active", true);
          return NextResponse.json(data || []);
        } catch {
          return NextResponse.json([]);
        }
      }
      case "payment_config": {
        try {
          const { data } = await db.from("payment_config").select("key, value");
          return NextResponse.json(data || []);
        } catch {
          return NextResponse.json([]);
        }
      }

      default:
        return NextResponse.json(
          { error: `Unknown: ${resource}` },
          { status: 400 },
        );
    }
  } catch (e: any) {
    console.error("[admin GET]", resource, e.message);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { action, ...p } = body;

  try {
    switch (action) {
      case "approve_kyc":
        await updateUser(p.user_id, {
          kyc_verified: true,
          kyc_status: "approved",
          kyc_verified_at: new Date().toISOString(),
        });
        try {
          await db
            .from("kyc_documents")
            .update({
              status: "approved",
              reviewed_at: new Date().toISOString(),
            })
            .eq("id", p.doc_id);
        } catch {}
        await tryInsert("user_notifications", {
          user_id: p.user_id,
          type: "kyc_approved",
          title: "Identity Verification Approved ✓",
          body: "Your KYC is approved. You can now invest and withdraw.",
          action_url: "/dashboard/verification",
        });
        return NextResponse.json({ ok: true });

      case "reject_kyc":
        await updateUser(p.user_id, {
          kyc_verified: false,
          kyc_status: "rejected",
        });
        try {
          await db
            .from("kyc_documents")
            .update({
              status: "rejected",
              admin_note: p.reason,
              reviewed_at: new Date().toISOString(),
            })
            .eq("id", p.doc_id);
        } catch {}
        await tryInsert("user_notifications", {
          user_id: p.user_id,
          type: "kyc_rejected",
          title: "KYC Rejected",
          body: p.reason || "Documents could not be verified.",
          action_url: "/dashboard/verification",
        });
        return NextResponse.json({ ok: true });

      case "freeze_user":
        await updateUser(p.user_id, { withdwals_fronzen: p.freeze });
        return NextResponse.json({ ok: true });

      case "reset_fraud":
        await updateUser(p.user_id, {
          fraud_score: 0,
          account_flagged: false,
          fraud_flags: null,
        });
        return NextResponse.json({ ok: true });

      case "flag_user":
        await updateUser(p.user_id, { account_flagged: p.flag });
        return NextResponse.json({ ok: true });

      case "adjust_balance": {
        const { data: u } = await db
          .from("users")
          .select("balance_available, wallet_balance")
          .eq("id", p.user_id)
          .single();
        const cur =
          parseFloat(u?.balance_available) ||
          parseFloat(u?.wallet_balance) ||
          0;
        const next = Math.max(0, cur + p.delta);
        await updateUser(p.user_id, {
          balance_available: next,
          wallet_balance: next,
        });
        return NextResponse.json({ ok: true, new_balance: next });
      }

      case "extend_license": {
        const { data: u } = await db
          .from("users")
          .select("node_expiry_date")
          .eq("id", p.user_id)
          .single();
        const base = u?.node_expiry_date
          ? new Date(u.node_expiry_date)
          : new Date();
        await updateUser(p.user_id, {
          node_expiry_date: new Date(
            base.getTime() + p.days * 86400000,
          ).toISOString(),
        });
        return NextResponse.json({ ok: true });
      }

      case "set_node":
        await updateUser(p.user_id, {
          tier: p.node_key,
          node_activated_at: new Date().toISOString(),
          node_expiry_date: new Date(Date.now() + 365 * 86400000).toISOString(),
        });
        return NextResponse.json({ ok: true });

      case "release_pending": {
        const { data: users } = await db
          .from("users")
          .select(
            "id, balance_available, wallet_balance, balance_pending, pending_balance",
          )
          .gt("balance_pending", 0);
        for (const u of users || []) {
          const avail =
            parseFloat(u.balance_available) ||
            parseFloat(u.wallet_balance) ||
            0;
          const pend =
            parseFloat(u.balance_pending) || parseFloat(u.pending_balance) || 0;
          await db
            .from("users")
            .update({
              balance_available: avail + pend,
              wallet_balance: avail + pend,
              balance_pending: 0,
              pending_balance: 0,
            })
            .eq("id", u.id);
        }
        return NextResponse.json({ ok: true, released: users?.length || 0 });
      }

      case "approve_payout_change":
        await updateUser(p.user_id, { payout_change_request: false });
        return NextResponse.json({ ok: true });

      case "approve_submission": {
        const { data: sub } = await db
          .from("task_submissions")
          .select("user_id, reward_amount, task_id")
          .eq("id", p.submission_id)
          .single();
        if (!sub)
          return NextResponse.json({ error: "Not found" }, { status: 404 });
        let reward = parseFloat(sub.reward_amount) || 0;
        if (!reward) {
          try {
            const { data: t } = await db
              .from("tasks")
              .select("payout_amount")
              .eq("id", sub.task_id)
              .single();
            reward = parseFloat(t?.payout_amount) || 0;
          } catch {}
        }
        await db
          .from("task_submissions")
          .update({
            status: "approved",
            reward_amount: reward,
            reviewed_at: new Date().toISOString(),
          })
          .eq("id", p.submission_id);
        const { data: u } = await db
          .from("users")
          .select("balance_available, wallet_balance, total_earned, earnings")
          .eq("id", sub.user_id)
          .single();
        const avail =
          parseFloat(u?.balance_available) ||
          parseFloat(u?.wallet_balance) ||
          0;
        const earned =
          parseFloat(u?.total_earned) || parseFloat(u?.earnings) || 0;
        await db
          .from("users")
          .update({
            balance_available: avail + reward,
            wallet_balance: avail + reward,
            total_earned: earned + reward,
            earnings: earned + reward,
          })
          .eq("id", sub.user_id);
        await tryInsert("user_notifications", {
          user_id: sub.user_id,
          type: "task_approved",
          title: "Task Approved ✓",
          body: `+$${reward.toFixed(3)} added to your balance.`,
        });
        return NextResponse.json({ ok: true });
      }

      case "reject_submission":
        try {
          await db
            .from("task_submissions")
            .update({
              status: "rejected",
              rejection_reason: p.reason,
              reviewed_at: new Date().toISOString(),
            })
            .eq("id", p.submission_id);
        } catch {}
        return NextResponse.json({ ok: true });

      case "mark_withdrawal_paid":
        try {
          await db
            .from("withdrawals")
            .update({ status: "paid", paid_at: new Date().toISOString() })
            .eq("id", p.withdrawal_id);
        } catch {}
        await tryInsert("user_notifications", {
          user_id: p.user_id,
          type: "withdrawal_completed",
          title: "Withdrawal Paid ✓",
          body: `$${p.amount} sent to your account.`,
        });
        return NextResponse.json({ ok: true });

      case "reject_withdrawal": {
        try {
          await db
            .from("withdrawals")
            .update({
              status: "rejected",
              failure_reason: p.reason || "Rejected",
            })
            .eq("id", p.withdrawal_id);
        } catch {}
        if (p.user_id && p.amount) {
          const { data: u } = await db
            .from("users")
            .select("balance_available, wallet_balance")
            .eq("id", p.user_id)
            .single();
          const avail =
            parseFloat(u?.balance_available) ||
            parseFloat(u?.wallet_balance) ||
            0;
          await db
            .from("users")
            .update({
              balance_available: avail + p.amount,
              wallet_balance: avail + p.amount,
            })
            .eq("id", p.user_id);
        }
        return NextResponse.json({ ok: true });
      }

      case "create_task":
        try {
          await db
            .from("tasks")
            .insert({
              title: p.title,
              description: p.description,
              category: p.category || "AI Evaluation",
              payout_amount: parseFloat(p.payout_amount) || 0.05,
              tier_required: p.tier_required || "foundation",
              max_assignments: parseInt(p.max_assignments) || 100,
              status: "open",
            });
        } catch (e: any) {
          return NextResponse.json({ error: e.message }, { status: 500 });
        }
        return NextResponse.json({ ok: true });

      case "toggle_task":
        try {
          await db
            .from("tasks")
            .update({ status: p.new_status })
            .eq("id", p.task_id);
        } catch {}
        return NextResponse.json({ ok: true });

      case "delete_task":
        try {
          await db.from("tasks").delete().eq("id", p.task_id);
        } catch {}
        return NextResponse.json({ ok: true });

      case "create_gpu_plan":
        try {
          await db
            .from("gpu_node_plans")
            .insert({
              name: p.name,
              short_name: p.short_name,
              subtitle: p.subtitle,
              gpu_model: p.gpu_model,
              vram: p.vram,
              tdp: p.tdp,
              architecture: p.architecture,
              tflops: parseFloat(p.tflops) || 0,
              price_min: parseFloat(p.price_min),
              price_max:
                parseFloat(p.price_max) || parseFloat(p.price_min) * 100,
              daily_pct: parseFloat(p.daily_pct),
              tier_color: p.tier_color || "slate",
              is_waitlist: !!p.is_waitlist,
              is_invite_only: !!p.is_invite_only,
              is_admin_locked: !!p.is_admin_locked,
              instance_type: "on_demand",
              use_cases: p.use_cases || [],
              sort_order: parseInt(p.sort_order) || 99,
              is_active: true,
            });
        } catch (e: any) {
          return NextResponse.json({ error: e.message }, { status: 500 });
        }
        return NextResponse.json({ ok: true });

      case "update_gpu_plan": {
        const { id, ...fields } = p;
        try {
          await db.from("gpu_node_plans").update(fields).eq("id", id);
        } catch (e: any) {
          return NextResponse.json({ error: e.message }, { status: 500 });
        }
        return NextResponse.json({ ok: true });
      }

      case "toggle_gpu_plan":
        try {
          await db
            .from("gpu_node_plans")
            .update({ is_active: p.active })
            .eq("id", p.id);
        } catch {}
        return NextResponse.json({ ok: true });

      case "update_gpu_tier":
        try {
          await db
            .from("gpu_tiers")
            .update({
              [p.field]: p.value,
              updated_at: new Date().toISOString(),
            })
            .eq("node_key", p.node_key);
        } catch {}
        return NextResponse.json({ ok: true });

      case "toggle_gpu_tier_lock":
        try {
          await db
            .from("gpu_tiers")
            .update({ is_locked: p.locked })
            .eq("node_key", p.node_key);
        } catch {}
        return NextResponse.json({ ok: true });

      case "toggle_waitlist":
        try {
          await db
            .from("gpu_tiers")
            .update({ waitlist_only: p.waitlist })
            .eq("node_key", p.node_key);
        } catch {}
        return NextResponse.json({ ok: true });

      case "create_demand_event":
        try {
          await db
            .from("demand_events")
            .insert({
              plan_id: p.plan_id,
              event_type: p.event_type,
              title: p.title,
              description: p.description,
              multiplier: p.multiplier,
              maintenance_fee: p.maintenance_fee,
              is_active: true,
              created_by: p.admin_id,
            });
        } catch {}
        return NextResponse.json({ ok: true });

      case "deactivate_event":
        try {
          await db
            .from("demand_events")
            .update({ is_active: false })
            .eq("id", p.event_id);
        } catch {}
        return NextResponse.json({ ok: true });

      case "create_announcement":
        try {
          await db
            .from("platform_announcements")
            .insert({
              title: p.title,
              body: p.body,
              type: p.type || "info",
              action_type: p.action_type || null,
              action_fee: p.action_fee || null,
              requires_action: !!p.action_type,
              is_active: true,
              created_by: p.admin_id,
            });
        } catch {}
        return NextResponse.json({ ok: true });

      case "deactivate_announcement":
        try {
          await db
            .from("platform_announcements")
            .update({ is_active: false })
            .eq("id", p.id);
        } catch {}
        return NextResponse.json({ ok: true });

      case "freeze_withdrawals":
        try {
          await db
            .from("withdrawal_freeze")
            .update({
              is_frozen: true,
              reason: p.reason || "Admin action",
              frozen_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            });
        } catch {}
        return NextResponse.json({ ok: true });

      case "unfreeze_withdrawals":
        try {
          await db
            .from("withdrawal_freeze")
            .update({
              is_frozen: false,
              reason: null,
              updated_at: new Date().toISOString(),
            });
        } catch {}
        return NextResponse.json({ ok: true });

      case "freeze_with_announcement":
        try {
          await db
            .from("withdrawal_freeze")
            .update({
              is_frozen: true,
              reason: p.title,
              frozen_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            });
        } catch {}
        try {
          await db
            .from("platform_announcements")
            .insert({
              title: p.title,
              body: p.body,
              type: "critical",
              action_type: p.action_type,
              requires_action: true,
              is_active: true,
            });
        } catch {}
        return NextResponse.json({ ok: true });

      case "update_ticket_status":
        try {
          await db
            .from("support_tickets")
            .update({ status: p.status, updated_at: new Date().toISOString() })
            .eq("id", p.ticket_id);
        } catch {}
        return NextResponse.json({ ok: true });

      case "send_support_reply":
        try {
          await db
            .from("support_messages")
            .insert({
              ticket_id: p.ticket_id,
              sender_id: p.admin_id,
              body: p.body,
              is_admin: true,
            });
        } catch {}
        try {
          await db
            .from("support_tickets")
            .update({
              status: "in_progress",
              updated_at: new Date().toISOString(),
            })
            .eq("id", p.ticket_id);
        } catch {}
        return NextResponse.json({ ok: true });

      case "notify_waitlist":
        try {
          await db
            .from("gpu_waitlist")
            .update({
              status: "notified",
              notified_at: new Date().toISOString(),
              admin_note: p.note,
            })
            .eq("id", p.waitlist_id);
        } catch {}
        await tryInsert("user_notifications", {
          user_id: p.user_id,
          type: "waitlist_open",
          title: "GPU Node Slot Available!",
          body: p.note || "A spot opened.",
          action_url: "/dashboard/gpu-plans",
        });
        return NextResponse.json({ ok: true });

      case "expire_waitlist":
        try {
          await db
            .from("gpu_waitlist")
            .update({ status: "expired" })
            .eq("id", p.waitlist_id);
        } catch {}
        return NextResponse.json({ ok: true });

      case "approve_investment":
        try {
          await db
            .from("node_allocations")
            .update({ status: "active" })
            .eq("id", p.allocation_id);
        } catch {}
        await tryInsert("user_notifications", {
          user_id: p.user_id,
          type: "system",
          title: "Investment Activated ✓",
          body: `Your $${p.amount} GPU node investment is now active.`,
        });
        return NextResponse.json({ ok: true });

      case "mature_investment":
        try {
          await db
            .from("node_allocations")
            .update({ status: "matured" })
            .eq("id", p.allocation_id);
        } catch {}
        return NextResponse.json({ ok: true });

      case "update_investment_earnings":
        try {
          await db
            .from("node_allocations")
            .update({ total_earned: p.total_earned })
            .eq("id", p.allocation_id);
        } catch {}
        return NextResponse.json({ ok: true });

      case "approve_api_key":
        try {
          await db
            .from("developer_api_keys")
            .update({
              status: "active",
              approved_by: p.admin_id,
              approved_at: new Date().toISOString(),
              permissions: p.permissions || ["read", "write"],
              rate_limit: p.rate_limit || 1000,
            })
            .eq("id", p.key_id);
        } catch {}
        return NextResponse.json({ ok: true });

      case "reject_api_key":
        try {
          await db
            .from("developer_api_keys")
            .update({ status: "rejected", rejection_reason: p.reason })
            .eq("id", p.key_id);
        } catch {}
        return NextResponse.json({ ok: true });

      case "suspend_api_key":
        try {
          await db
            .from("developer_api_keys")
            .update({ status: "suspended" })
            .eq("id", p.key_id);
        } catch {}
        return NextResponse.json({ ok: true });

      case "revoke_api_key":
        try {
          await db
            .from("developer_api_keys")
            .update({ status: "revoked" })
            .eq("id", p.key_id);
        } catch {}
        return NextResponse.json({ ok: true });

      case "send_notification": {
        try {
          if (p.userId === "all") {
            const { data: allUsers } = await db.from("users").select("id");
            if (allUsers?.length)
              await db
                .from("user_notifications")
                .insert(
                  allUsers.map((u: any) => ({
                    user_id: u.id,
                    type: p.type || "system",
                    title: p.title,
                    body: p.body_text,
                  })),
                );
            return NextResponse.json({ sent: allUsers?.length || 0 });
          }
          await db
            .from("user_notifications")
            .insert({
              user_id: p.userId,
              type: p.type || "system",
              title: p.title,
              body: p.body_text,
            });
          return NextResponse.json({ sent: 1 });
        } catch {
          return NextResponse.json({ sent: 0 });
        }
      }

      case "notify_expiring": {
        try {
          const in30 = new Date(Date.now() + 30 * 86400000).toISOString();
          const { data: expiring } = await db
            .from("users")
            .select("id, node_expiry_date")
            .gte("node_expiry_date", new Date().toISOString())
            .lte("node_expiry_date", in30);
          if (expiring?.length)
            await db
              .from("user_notifications")
              .insert(
                expiring.map((u: any) => ({
                  user_id: u.id,
                  type: "system",
                  title: "License Renewal Required",
                  body: `Your node license expires on ${new Date(u.node_expiry_date).toLocaleDateString()}.`,
                  action_url: "/dashboard/node-upgrade",
                })),
              );
          return NextResponse.json({ notified: expiring?.length || 0 });
        } catch {
          return NextResponse.json({ notified: 0 });
        }
      }

      case "save_config":
        try {
          await db
            .from("payment_config")
            .upsert(
              {
                key: p.key,
                value: p.value,
                updated_at: new Date().toISOString(),
              },
              { onConflict: "key" },
            );
        } catch {}
        return NextResponse.json({ ok: true });

      case "set_datacenter_media":
        try {
          await db.from("datacenter_media").update({ is_active: false });
        } catch {}
        try {
          await db
            .from("datacenter_media")
            .insert({
              file_url: p.file_url,
              label: p.label || "Live Feed",
              is_active: true,
              created_by: p.admin_id,
            });
        } catch {}
        return NextResponse.json({ ok: true });

      case "remove_datacenter_media":
        try {
          await db.from("datacenter_media").delete().eq("id", p.id);
        } catch {}
        return NextResponse.json({ ok: true });

      case "confirm_crypto":
        try {
          await db
            .from("transactions")
            .update({ status: "confirmed" })
            .eq("id", p.transaction_id);
        } catch {}
        await updateUser(p.user_id, {
          tier: p.node_key,
          node_activated_at: new Date().toISOString(),
          node_expiry_date: new Date(Date.now() + 365 * 86400000).toISOString(),
        });
        return NextResponse.json({ ok: true });

      case "reject_transaction":
        try {
          await db
            .from("transactions")
            .update({ status: "rejected", notes: p.reason })
            .eq("id", p.transaction_id);
        } catch {}
        return NextResponse.json({ ok: true });

      default:
        return NextResponse.json(
          { error: `Unknown action: ${action}` },
          { status: 400 },
        );
    }
  } catch (e: any) {
    console.error("[admin POST]", action, e.message);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
