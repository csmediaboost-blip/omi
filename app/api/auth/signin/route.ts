import { generateDeviceFingerprint } from "@/lib/deviceFingerprint";
import { supabase } from "@/lib/supabase"; // ← ADD THIS

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(req: Request) {
  const { email, password } = await req.json();

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

  return Response.json({ success: true });
}
