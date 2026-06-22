// app/api/report/generate/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

// ── GET /api/report/generate?userId=... ───────────────────────────────────────
export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get("userId");
  if (!userId) {
    return NextResponse.json({ error: "Missing userId" }, { status: 400 });
  }

  const supabaseAdmin = getSupabaseAdmin(); // ← was missing, caused the build error

  const { data: reports } = await supabaseAdmin
    .from("compute_reports")
    .select("week_number, generated_at, total_teraflops, total_earned")
    .eq("user_id", userId)
    .order("week_number", { ascending: true });

  return NextResponse.json({ reports: reports ?? [] });
}

// ── POST /api/report/generate ─────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const supabaseAdmin = getSupabaseAdmin();
    const { userId, weekNumber } = await req.json();

    if (!userId || !weekNumber) {
      return NextResponse.json(
        { error: "Missing userId or weekNumber" },
        { status: 400 },
      );
    }

    const { data: user } = await supabaseAdmin
      .from("users")
      .select(
        "full_name, email, tier, total_earned, balance_available, node_activated_at, streak_count",
      )
      .eq("id", userId)
      .single();

    const { data: allocations } = await supabaseAdmin
      .from("user_allocations")
      .select("*, gpu_clients(name, risk_level, multiplier)")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(10);

    const { data: optimizations } = await supabaseAdmin
      .from("daily_optimization_logs")
      .select("completed_at, reward_given")
      .eq("user_id", userId)
      .order("completed_at", { ascending: false })
      .limit(7);

    const { data: rlhfResponses } = await supabaseAdmin
      .from("rlhf_responses")
      .select("created_at, reward_given, confidence_score")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(20);

    const totalEarned = user?.total_earned ?? 0;
    const optimizationEarnings =
      optimizations?.reduce(
        (s: number, o: any) => s + (o.reward_given ?? 0),
        0,
      ) ?? 0;
    const rlhfEarnings =
      rlhfResponses?.reduce(
        (s: number, r: any) => s + (r.reward_given ?? 0),
        0,
      ) ?? 0;
    const allocationEarnings =
      allocations?.reduce(
        (s: number, a: any) => s + (a.earnings_collected ?? 0),
        0,
      ) ?? 0;
    const teraflops =
      (optimizations?.length ?? 0) * 847.3 +
      (rlhfResponses?.length ?? 0) * 12.4;
    const nodeId = `GPU-${userId.slice(0, 8).toUpperCase()}`;
    const userName = user?.full_name ?? user?.email ?? "Node Operator";
    const tier = (user?.tier ?? "compute").toUpperCase();

    const pdfBytes = generatePDFBytes({
      userName,
      nodeId,
      tier,
      weekNumber,
      totalEarned,
      optimizationEarnings,
      rlhfEarnings,
      allocationEarnings,
      teraflops,
      optimizationCount: optimizations?.length ?? 0,
      rlhfCount: rlhfResponses?.length ?? 0,
      allocations: allocations ?? [],
      streakCount: user?.streak_count ?? 0,
    });

    await supabaseAdmin.from("compute_reports").upsert(
      {
        user_id: userId,
        week_number: weekNumber,
        generated_at: new Date().toISOString(),
        total_teraflops: teraflops,
        total_earned: totalEarned,
        report_data: {
          optimizationCount: optimizations?.length ?? 0,
          rlhfCount: rlhfResponses?.length ?? 0,
        },
      },
      { onConflict: "user_id,week_number" },
    );

    return new NextResponse(pdfBytes, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="compute-report-week-${weekNumber}-${nodeId}.pdf"`,
        "Content-Length": pdfBytes.length.toString(),
      },
    });
  } catch (err: any) {
    console.error("[report/generate] Error:", err.message ?? "unknown");
    return NextResponse.json(
      { error: "Report generation failed." },
      { status: 500 },
    );
  }
}

// ─── Pure JS PDF binary builder (no dependencies) ────────────────────────────

function generatePDFBytes(data: {
  userName: string;
  nodeId: string;
  tier: string;
  weekNumber: number;
  totalEarned: number;
  optimizationEarnings: number;
  rlhfEarnings: number;
  allocationEarnings: number;
  teraflops: number;
  optimizationCount: number;
  rlhfCount: number;
  allocations: any[];
  streakCount: number;
}): Buffer {
  const now = new Date();
  const dateStr = now.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  const weekStart = new Date(
    now.getFullYear(),
    0,
    1 + (data.weekNumber - 1) * 7,
  );
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);
  const weekRange = `${weekStart.toLocaleDateString("en-US", { month: "short", day: "numeric" })} \u2013 ${weekEnd.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;

  const lines: string[] = [];
  const esc = (s: string) =>
    s.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");

  lines.push("BT");
  lines.push("/F2 28 Tf");
  lines.push("0.06 0.09 0.15 rg");
  lines.push("50 770 Td");
  lines.push(`(COMPUTE CONTRIBUTION REPORT) Tj`);
  lines.push("/F1 11 Tf");
  lines.push("0.4 0.5 0.6 rg");
  lines.push("0 -22 Td");
  lines.push(
    `(Week ${data.weekNumber}  |  ${weekRange}  |  Generated ${dateStr}) Tj`,
  );
  lines.push("ET");
  lines.push("0.1 0.4 0.8 RG 2 w");
  lines.push("50 730 m 545 730 l S");

  lines.push("0.97 0.98 1 rg 0.85 0.9 0.95 RG 1 w");
  lines.push("50 650 m 545 650 l 545 715 l 50 715 l f");
  lines.push("50 650 m 545 650 l 545 715 l 50 715 l S");
  lines.push("BT /F2 11 Tf 0.15 0.2 0.3 rg 65 698 Td");
  lines.push(`(NODE ID:  ${esc(data.nodeId)}) Tj`);
  lines.push("0 -18 Td");
  lines.push(`(OPERATOR:  ${esc(data.userName)}) Tj`);
  lines.push("240 18 Td");
  lines.push(`(TIER:  ${esc(data.tier)} NODE) Tj`);
  lines.push("0 -18 Td");
  lines.push(`(STREAK:  ${data.streakCount} DAYS) Tj`);
  lines.push("ET");

  lines.push(
    "BT /F2 14 Tf 0.1 0.3 0.7 rg 50 630 Td (PERFORMANCE SUMMARY) Tj ET",
  );
  lines.push("0.1 0.3 0.7 RG 1 w 50 624 m 280 624 l S");

  const stats = [
    { label: "TOTAL EARNED", value: `$${data.totalEarned.toFixed(2)}`, x: 50 },
    { label: "TERAFLOPS", value: data.teraflops.toFixed(1) + " TF", x: 200 },
    { label: "OPTIMIZATIONS", value: String(data.optimizationCount), x: 350 },
    { label: "RLHF TASKS", value: String(data.rlhfCount), x: 460 },
  ];
  for (const s of stats) {
    lines.push(`0.05 0.1 0.2 rg 0.2 0.3 0.5 RG 1 w`);
    lines.push(
      `${s.x} 560 m ${s.x + 130} 560 l ${s.x + 130} 615 l ${s.x} 615 l f`,
    );
    lines.push(
      `${s.x} 560 m ${s.x + 130} 560 l ${s.x + 130} 615 l ${s.x} 615 l S`,
    );
    lines.push(
      `BT /F2 18 Tf 0.2 0.8 0.5 rg ${s.x + 10} 583 Td (${esc(s.value)}) Tj ET`,
    );
    lines.push(
      `BT /F1 8 Tf 0.5 0.6 0.7 rg ${s.x + 10} 567 Td (${esc(s.label)}) Tj ET`,
    );
  }

  lines.push(
    "BT /F2 14 Tf 0.1 0.3 0.7 rg 50 540 Td (EARNINGS BREAKDOWN) Tj ET",
  );
  lines.push("0.1 0.3 0.7 RG 1 w 50 534 m 260 534 l S");

  const earnings = [
    { label: "Daily Optimization", amount: data.optimizationEarnings },
    { label: "RLHF Validation Bonus", amount: data.rlhfEarnings },
    { label: "GPU Allocation Revenue", amount: data.allocationEarnings },
    {
      label: "TOTAL WEEK EARNINGS",
      amount:
        data.optimizationEarnings + data.rlhfEarnings + data.allocationEarnings,
    },
  ];

  let ey = 515;
  for (let i = 0; i < earnings.length; i++) {
    const e = earnings[i];
    const isTot = i === earnings.length - 1;
    if (isTot) {
      lines.push(
        `0.05 0.1 0.2 rg 50 ${ey - 6} m 400 ${ey - 6} l 400 ${ey + 18} l 50 ${ey + 18} l f`,
      );
      lines.push(
        `BT /F2 11 Tf 0.2 0.8 0.5 rg 60 ${ey + 2} Td (${esc(e.label)}) Tj ET`,
      );
      lines.push(
        `BT /F2 11 Tf 0.2 0.8 0.5 rg 330 ${ey + 2} Td ($${e.amount.toFixed(2)}) Tj ET`,
      );
    } else {
      lines.push(
        `BT /F1 10 Tf 0.7 0.75 0.8 rg 60 ${ey + 2} Td (${esc(e.label)}) Tj ET`,
      );
      lines.push(
        `BT /F1 10 Tf 0.6 0.9 0.6 rg 330 ${ey + 2} Td ($${e.amount.toFixed(2)}) Tj ET`,
      );
      lines.push(`0.15 0.2 0.3 rg 50 ${ey - 2} m 400 ${ey - 2} l 0.5 w S`);
    }
    ey -= 28;
  }

  ey -= 30;
  lines.push(
    `BT /F2 14 Tf 0.1 0.3 0.7 rg 50 ${ey} Td (CERTIFICATE OF TASK COMPLETION) Tj ET`,
  );
  lines.push(`0.1 0.3 0.7 RG 1 w 50 ${ey - 6} m 400 ${ey - 6} l S`);
  ey -= 30;
  lines.push(`0.97 0.98 1 rg 0.7 0.8 0.9 RG 1 w`);
  lines.push(
    `50 ${ey - 80} m 545 ${ey - 80} l 545 ${ey + 10} l 50 ${ey + 10} l f`,
  );
  lines.push(
    `50 ${ey - 80} m 545 ${ey - 80} l 545 ${ey + 10} l 50 ${ey + 10} l S`,
  );
  lines.push(
    `BT /F1 10 Tf 0.3 0.4 0.5 rg 70 ${ey - 5} Td (This certifies that ${esc(data.userName)} \\(${esc(data.nodeId)}\\)) Tj ET`,
  );
  lines.push(
    `BT /F1 10 Tf 0.3 0.4 0.5 rg 70 ${ey - 22} Td (has successfully contributed ${data.teraflops.toFixed(1)} teraflops of compute) Tj ET`,
  );
  lines.push(
    `BT /F1 10 Tf 0.3 0.4 0.5 rg 70 ${ey - 39} Td (to the OmniTask AI Training Network during Week ${data.weekNumber}.) Tj ET`,
  );
  lines.push(
    `BT /F2 10 Tf 0.1 0.3 0.7 rg 70 ${ey - 56} Td (Completed: ${data.optimizationCount} Thermal Calibrations  |  ${data.rlhfCount} RLHF Validations) Tj ET`,
  );
  lines.push(
    `BT /F1 9 Tf 0.5 0.6 0.7 rg 70 ${ey - 72} Td (Verified by OmniTask Pro AI Infrastructure Division \u2014 ${dateStr}) Tj ET`,
  );

  lines.push("BT /F1 8 Tf 0.4 0.5 0.6 rg 50 30 Td");
  lines.push(
    `(OmniTask Pro  |  AI Compute Contribution Report  |  Node ${esc(data.nodeId)}  |  Week ${data.weekNumber}) Tj ET`,
  );
  lines.push("0.3 0.4 0.5 RG 0.5 w 50 45 m 545 45 l S");

  const contentStream = lines.join("\n");
  const objs: string[] = [];

  function addObj(content: string): number {
    const idx = objs.length + 1;
    objs.push(`${idx} 0 obj\n${content}\nendobj`);
    return idx;
  }

  const fontF1 = addObj(
    `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>`,
  );
  const fontF2 = addObj(
    `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>`,
  );
  const resources = addObj(
    `<< /Font << /F1 ${fontF1} 0 R /F2 ${fontF2} 0 R >> >>`,
  );
  const contentObj = addObj(
    `<< /Length ${contentStream.length} >>\nstream\n${contentStream}\nendstream`,
  );
  const pageObj = addObj(
    `<< /Type /Page /Parent 6 0 R /MediaBox [0 0 595 842] /Contents ${contentObj} 0 R /Resources ${resources} 0 R >>`,
  );
  const pagesIdx = objs.length + 1;
  addObj(`<< /Type /Pages /Kids [${pageObj} 0 R] /Count 1 >>`);
  const catalogIdx = objs.length + 1;
  addObj(`<< /Type /Catalog /Pages ${pagesIdx} 0 R >>`);

  let pdf = "%PDF-1.4\n";
  const body = objs.join("\n") + "\n";
  const xrefOffset = pdf.length + body.length;
  pdf += body;
  pdf += "xref\n";
  pdf += `0 ${objs.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  let pos = "%PDF-1.4\n".length;
  for (let i = 0; i < objs.length; i++) {
    pdf += pos.toString().padStart(10, "0") + " 00000 n \n";
    pos += objs[i].length + 1;
  }
  pdf += "trailer\n";
  pdf += `<< /Size ${objs.length + 1} /Root ${catalogIdx} 0 R >>\n`;
  pdf += "startxref\n";
  pdf += `${xrefOffset}\n`;
  pdf += "%%EOF";

  return Buffer.from(pdf, "latin1");
}
