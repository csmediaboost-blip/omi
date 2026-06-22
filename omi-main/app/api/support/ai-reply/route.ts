// app/api/support/ai-reply/route.ts
//
// FIX: Accepts an optional `currentMessage` in the request body and appends
// it to the conversation history AFTER loading from DB. This eliminates the
// read-after-write race where the just-inserted message wasn't visible yet,
// causing the AI to reply to the previous message (or stay silent entirely).

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

// ── OmniTask Pro system prompt ────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are the official AI support agent for OmniTask Pro, a GPU mining investment platform. You are helpful, professional, and concise. Always respond in the same language the user writes in.

PLATFORM RULES YOU MUST KNOW:
- Users invest in GPU Node Plans and earn daily ROI.
- Withdrawals are ONLY allowed on Mondays, 08:00–16:00 WAT (West Africa Time).
- Withdrawals are blocked on Nigerian public holidays even if they fall on Monday.
- Capital lock periods apply depending on the plan tier chosen by the user.
- Preset withdrawal amounts only — users cannot withdraw arbitrary amounts.
- Weekly withdrawal limit applies per user.
- Payment methods: KoraPay (bank transfer, max ₦200,000 per transaction), Crypto (USDT), Card.
- KoraPay bank transfers exceeding ₦200,000 are split into multiple installments automatically.
- Operator Licenses are available for purchase and unlock additional earning tiers.
- Tasks: users can complete RLHF validation tasks, GPU allocation contracts, and thermal calibration tasks to earn extra balance.
- Support tickets are responded to within 2 hours by the team.

BEHAVIOUR RULES:
- If you don't know a specific answer (e.g. exact balance, transaction status), say so clearly and tell the user a human agent will follow up.
- Never make up transaction IDs, balances, or dates.
- If the user's account data is provided, use it to give a personalised answer.
- Keep replies under 120 words unless a detailed explanation is genuinely needed.
- Do NOT mention that you are an AI unless the user directly asks.
- Sign off as: "— OmniTask Support"`;

// ── Helper: fetch live user account data ─────────────────────────────────────
async function fetchUserContext(
  userId: string | null,
  guestEmail: string | null,
): Promise<string> {
  if (!userId) {
    return guestEmail
      ? `Guest user (email: ${guestEmail}). No account data available.`
      : "Guest user. No account data available.";
  }

  try {
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("full_name, email, balance, total_invested, total_earned, status")
      .eq("id", userId)
      .maybeSingle();

    const { data: plans } = await supabaseAdmin
      .from("user_gpu_plans")
      .select("plan_name, stake_amount, daily_roi, start_date, end_date, status")
      .eq("user_id", userId)
      .eq("status", "active")
      .limit(5);

    const { data: txns } = await supabaseAdmin
      .from("transactions")
      .select("type, amount, status, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(5);

    const lines: string[] = [];

    if (profile) {
      lines.push(`Name: ${profile.full_name ?? "N/A"}`);
      lines.push(`Email: ${profile.email ?? "N/A"}`);
      lines.push(`Account status: ${profile.status ?? "active"}`);
      lines.push(`Balance: ₦${Number(profile.balance ?? 0).toLocaleString()}`);
      lines.push(`Total invested: ₦${Number(profile.total_invested ?? 0).toLocaleString()}`);
      lines.push(`Total earned: ₦${Number(profile.total_earned ?? 0).toLocaleString()}`);
    }

    if (plans && plans.length > 0) {
      lines.push(`\nActive GPU plans (${plans.length}):`);
      plans.forEach((p) => {
        lines.push(
          `  • ${p.plan_name} — stake ₦${Number(p.stake_amount).toLocaleString()}, ROI ${p.daily_roi}%/day, ends ${p.end_date ?? "flexible"}`,
        );
      });
    } else {
      lines.push("\nNo active GPU plans.");
    }

    if (txns && txns.length > 0) {
      lines.push(`\nRecent transactions:`);
      txns.forEach((t) => {
        lines.push(
          `  • ${t.type} ₦${Number(t.amount).toLocaleString()} — ${t.status} (${new Date(t.created_at).toLocaleDateString()})`,
        );
      });
    }

    return lines.join("\n");
  } catch (err) {
    console.error("[ai-reply] fetchUserContext error:", err);
    return "Could not load user account data.";
  }
}

// ── Main handler ──────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const { ticketId, userId, guestEmail, currentMessage } = await req.json();

    if (!ticketId) {
      return NextResponse.json({ error: "ticketId required" }, { status: 400 });
    }

    // 1. Load conversation history EXCLUDING the current message
    //    (it may not be visible in DB yet due to write propagation delay)
    const { data: messages, error: msgError } = await supabaseAdmin
      .from("support_messages")
      .select("body, is_admin, created_at, image_name")
      .eq("ticket_id", ticketId)
      .order("created_at", { ascending: true });

    if (msgError || !messages) {
      console.error("[ai-reply] load messages error:", msgError);
      return NextResponse.json({ error: "Could not load messages" }, { status: 500 });
    }

    // 2. Load live user account context
    const userContext = await fetchUserContext(userId, guestEmail);

    // 3. Build Groq messages array
    const groqMessages: { role: "system" | "user" | "assistant"; content: string }[] = [
      { role: "system", content: SYSTEM_PROMPT },
      // Inject account context silently
      {
        role: "user",
        content: `[ACCOUNT CONTEXT — do not repeat this to the user]\n${userContext}`,
      },
      {
        role: "assistant",
        content:
          "Understood. I have the user's account context and will use it to give accurate, personalised answers.",
      },
    ];

    // Map DB history to Groq turns
    for (const msg of messages) {
      const role = msg.is_admin ? "assistant" : "user";
      let content = msg.body ?? "";
      if (!content && msg.image_name) content = `[User sent a file: ${msg.image_name}]`;
      if (!content) continue;
      groqMessages.push({ role, content });
    }

    // KEY FIX: append the current message passed directly from send-message.
    // This ensures the AI always sees the latest message even if the DB
    // hasn't propagated the insert yet.
    if (currentMessage) {
      let content = currentMessage.body ?? "";
      if (!content && currentMessage.image_name)
        content = `[User sent a file: ${currentMessage.image_name}]`;
      if (content) {
        // Only append if it's not already the last message in history
        // (avoids duplicating if DB was fast enough to include it)
        const lastMsg = groqMessages[groqMessages.length - 1];
        const alreadyPresent =
          lastMsg?.role === "user" && lastMsg?.content === content;
        if (!alreadyPresent) {
          groqMessages.push({ role: "user", content });
        }
      }
    }

    // Merge consecutive same-role messages (Groq requires strict alternation)
    const merged: { role: "system" | "user" | "assistant"; content: string }[] = [];
    for (const turn of groqMessages) {
      const last = merged[merged.length - 1];
      if (last && last.role === turn.role) {
        last.content += "\n" + turn.content;
      } else {
        merged.push({ ...turn });
      }
    }

    // Ensure conversation ends with a user message
    if (merged[merged.length - 1]?.role !== "user") {
      console.warn("[ai-reply] last message is not from user — skipping AI reply");
      return NextResponse.json({ skipped: true });
    }

    // 4. Call Groq API with a hard timeout — Vercel functions have a max
    //    duration, and a hung Groq call should not silently eat the whole
    //    background invocation.
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 20_000);

    let aiReply = "";
    try {
      const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
        },
        body: JSON.stringify({
          model: "llama-3.3-70b-versatile",
          max_tokens: 300,
          temperature: 0.5,
          messages: merged,
        }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!groqRes.ok) {
        const errText = await groqRes.text();
        console.error("[ai-reply] Groq API error:", groqRes.status, errText);
        // Fall back to a generic acknowledgement instead of total silence
        aiReply =
          "Thanks for your message — our team will get back to you shortly. — OmniTask Support";
      } else {
        const groqData = await groqRes.json();
        aiReply = groqData.choices?.[0]?.message?.content ?? "";
      }
    } catch (err) {
      clearTimeout(timeoutId);
      const isAbort = err instanceof Error && err.name === "AbortError";
      console.error("[ai-reply] Groq call failed:", isAbort ? "timeout" : err);
      aiReply =
        "Thanks for your message — our team will get back to you shortly. — OmniTask Support";
    }

    if (!aiReply.trim()) {
      console.warn("[ai-reply] Groq returned empty reply");
      return NextResponse.json({ skipped: true });
    }

    // 5. Insert AI reply as admin message
    const now = new Date().toISOString();
    const { error: insertError } = await supabaseAdmin
      .from("support_messages")
      .insert({
        ticket_id: ticketId,
        body: aiReply,
        is_admin: true,
        created_at: now,
        delivery_status: "delivered",
        delivered_at: now,
        image_url: null,
        image_name: null,
      });

    if (insertError) {
      console.error("[ai-reply] insert error:", insertError);
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown";
    console.error("[ai-reply] exception:", msg);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}