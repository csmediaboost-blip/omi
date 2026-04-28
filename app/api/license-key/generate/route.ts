// app/api/license-key/generate/route.ts
// POST /api/license-key/generate
// — Expires any previous active key for this user
// — Creates a new key in license_keys table
// — Sends the key to the user's email via Resend (non-blocking)

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const KEY_TTL_MINUTES = 15;

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

function generateKey(): string {
  const seg = () =>
    Math.random().toString(36).substring(2, 6).toUpperCase().padEnd(4, "X");
  return `OMNI-${seg()}-${seg()}-${seg()}-${seg()}`;
}

export async function POST(req: NextRequest) {
  try {
    const supabaseAdmin = getSupabaseAdmin();

    // 1. Verify the user is logged in
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const token = authHeader.substring(7);

    // 2. Decode JWT to get user ID
    let userId: string;
    try {
      const parts = token.split(".");
      if (parts.length !== 3) throw new Error("Invalid token format");
      const payload = JSON.parse(
        Buffer.from(parts[1], "base64").toString("utf-8"),
      );
      userId = payload.sub;
      if (!userId) throw new Error("No user ID in token");
    } catch {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    // 3. Verify user exists
    const { data: user, error: userError } = await supabaseAdmin
      .from("users")
      .select("id, email, full_name")
      .eq("id", userId)
      .single();

    if (userError || !user) {
      return NextResponse.json({ error: "User not found" }, { status: 401 });
    }

    // 4. Expire any currently active key for this user
    await supabaseAdmin
      .from("license_keys")
      .update({ status: "expired" })
      .eq("user_id", userId)
      .eq("status", "active");

    // 5. Generate a new key
    const key = generateKey();
    const expiresAt = new Date(
      Date.now() + KEY_TTL_MINUTES * 60 * 1000,
    ).toISOString();

    // 6. Insert into license_keys — using "license_key" column to match your schema
    const { data: inserted, error: insertError } = await supabaseAdmin
      .from("license_keys")
      .insert({
        user_id: userId,
        license_key: key, // ✅ fixed: was "key", now matches your schema column
        status: "active",
        expires_at: expiresAt,
      })
      .select()
      .single();

    if (insertError || !inserted) {
      console.error("insert error:", insertError);
      return NextResponse.json(
        { error: "Failed to create key" },
        { status: 500 },
      );
    }

    // 7. Send email via Resend — NON-BLOCKING, key is always returned
    const resendApiKey = process.env.RESEND_API_KEY;
    let emailSent = false;

    if (resendApiKey) {
      try {
        const resend = new Resend(resendApiKey);
        const { error: emailError } = await resend.emails.send({
          from: "OmniTask Pro <noreply@omnitaskpro.io>",
          to: user.email,
          subject: "Your OmniTask Pro License Key",
          html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width" />
</head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:system-ui,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;border:1px solid #e5e7eb;overflow:hidden;">
          <tr>
            <td style="background:#000000;padding:28px 36px;">
              <p style="margin:0;color:#ffffff;font-size:20px;font-weight:900;letter-spacing:-0.5px;">
                OmniTask<span style="color:#10b981;">Pro</span>
              </p>
              <p style="margin:4px 0 0;color:#6b7280;font-size:11px;text-transform:uppercase;letter-spacing:2px;">
                Certified Operator Program
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:36px;">
              <p style="margin:0 0 8px;font-size:14px;color:#6b7280;">Hello, ${user.full_name || "Operator"}</p>
              <h1 style="margin:0 0 20px;font-size:22px;font-weight:900;color:#111827;font-family:Georgia,serif;line-height:1.3;">
                Your License Key Is Ready
              </h1>
              <p style="margin:0 0 24px;font-size:14px;color:#6b7280;line-height:1.6;">
                A new Certified AI Operator License key has been generated for your account.
                This key is <strong style="color:#111827;">single-use</strong> and expires in
                <strong style="color:#111827;">${KEY_TTL_MINUTES} minutes</strong>.
              </p>
              <div style="background:#f9fafb;border:2px dashed #d1d5db;border-radius:8px;padding:20px 24px;text-align:center;margin:0 0 24px;">
                <p style="margin:0 0 4px;font-size:11px;text-transform:uppercase;letter-spacing:2px;color:#9ca3af;font-weight:700;">Your License Key</p>
                <p style="margin:0;font-family:monospace;font-size:20px;font-weight:900;color:#111827;letter-spacing:3px;">${key}</p>
              </div>
              <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:12px 16px;margin:0 0 24px;">
                <p style="margin:0;font-size:13px;color:#92400e;line-height:1.5;">
                  ⏱ <strong>Expires in ${KEY_TTL_MINUTES} minutes</strong> from when this email was sent.
                  If it expires, return to the license page and generate a new one.
                </p>
              </div>
              <p style="margin:0 0 12px;font-size:13px;font-weight:700;color:#374151;text-transform:uppercase;letter-spacing:1px;">How to use your key:</p>
              <ol style="margin:0 0 24px;padding-left:20px;color:#6b7280;font-size:14px;line-height:1.8;">
                <li>Go to your <strong style="color:#111827;">Dashboard → License</strong> page</li>
                <li>Paste the key into the <em>Step B</em> input field</li>
                <li>Click <strong style="color:#111827;">Validate Key</strong></li>
                <li>Complete checkout — your node activates immediately</li>
              </ol>
              <p style="margin:0;font-size:12px;color:#9ca3af;line-height:1.6;">
                If you did not request this key, you can safely ignore this email.
              </p>
            </td>
          </tr>
          <tr>
            <td style="background:#f9fafb;border-top:1px solid #e5e7eb;padding:20px 36px;">
              <p style="margin:0;font-size:11px;color:#9ca3af;line-height:1.6;">
                OmniTask Pro Ltd. · compliance@omnitaskpro.io · omnitaskpro.online
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
          `,
        });

        if (emailError) {
          console.warn("Email delivery failed:", emailError);
        } else {
          emailSent = true;
        }
      } catch (emailErr) {
        // Email failed — key still returned below
        console.warn("Resend threw an error:", emailErr);
      }
    } else {
      console.warn("RESEND_API_KEY not set — skipping email.");
    }

    // ✅ Always return the key regardless of email status
    return NextResponse.json({
      key,
      expiresAt,
      emailSent,
      ...(emailSent
        ? {}
        : {
            warning:
              "Key created but email not sent. Copy the key from this page.",
          }),
    });
  } catch (err: any) {
    console.error("Generate error:", err);
    return NextResponse.json(
      { error: err.message || "Failed to generate key" },
      { status: 500 },
    );
  }
}
