// lib/supabase-admin.ts
//
// SERVER-ONLY client using the service role key. NEVER import this from
// a "use client" component or anything that ships to the browser — the
// service role key bypasses RLS entirely.
//
// Requires SUPABASE_SERVICE_ROLE_KEY in your server env (Vercel/host env
// vars, NOT prefixed with NEXT_PUBLIC_). Find it in Supabase dashboard:
// Project Settings → API → service_role key.

import { createClient } from "@supabase/supabase-js";

if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
  throw new Error("Missing env var: NEXT_PUBLIC_SUPABASE_URL");
}
if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error(
    "Missing env var: SUPABASE_SERVICE_ROLE_KEY (server-only — do not prefix with NEXT_PUBLIC_)",
  );
}

export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  },
);