// app/api/auth/signin/route.ts
import { generateDeviceFingerprint } from "@/lib/deviceFingerprint";
import { supabase } from "@/lib/supabase";
import { NextRequest } from "next/server";
import { rateLimit, getClientIp } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(req: NextRequest) {
  // Rate limit: 5 attempts per 15 minutes per IP
  const ip = getClientIp(req);
  const { allowed, remaining } = await rateLimit(
    `signin:${ip}`,
    5,
    15 * 60_000,
  );

  if (!allowed) {
    return Response.json(
      {
        error:
          "Too many sign-in attempts. Please wait 15 minutes and try again.",
      },
      { status: 429, headers: { "Retry-After": "900" } },
    );
  }

  const body = await req.json().catch(() => null);
  if (!body?.email || !body?.password) {
    return Response.json(
      { error: "Email and password are required." },
      { status: 400 },
    );
  }

  const { email, password } = body;

  const { data: user, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    return Response.json({ error: error.message }, { status: 401 });
  }

  const fingerprint = generateDeviceFingerprint(req);

  await supabase
    .from("users")
    .update({ device_fingerprint: fingerprint })
    .eq("id", user.user.id);

  return Response.json(
    { success: true },
    { headers: { "X-RateLimit-Remaining": String(remaining) } },
  );
}
