/**
 * lib/supabase.ts
 *
 * BUG FIXED: The previous version applied AbortSignal.timeout(10000) to ALL
 * Supabase fetch calls globally — including file uploads. A 0.47 MB image
 * upload on a slow Nigerian 4G connection takes 15-25 seconds. The 10-second
 * abort was silently killing every upload, causing the "Submitting..." hang.
 *
 * FIX: Remove the global timeout override entirely.
 *   - Auth/DB queries are fast by nature (<2s on any connection).
 *   - Timeouts for specific slow operations are handled per-call where needed.
 *   - Storage uploads must NEVER have a short global abort signal.
 */

import { createBrowserClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// ── Stub client for when env vars are missing (e.g. CI / preview builds) ──
// NOTE: All methods here support full chaining so runtime calls don't throw.
const chainable = (): any => {
  const obj: any = {
    select: () => obj,
    insert: () => obj,
    update: () => obj,
    upsert: () => obj,
    delete: () => obj,
    eq: () => obj,
    neq: () => obj,
    gt: () => obj,
    gte: () => obj,
    lt: () => obj,
    lte: () => obj,
    in: () => obj,
    is: () => obj,
    order: () => obj,
    limit: () => obj,
    range: () => obj,
    head: () => obj,
    single: async () => ({ data: null, error: null }),
    then: (resolve: any) =>
      Promise.resolve({ data: null, error: null }).then(resolve),
    // make it awaitable as a raw query too
    // count
  };
  // also resolve as a promise when awaited directly (e.g. await supabase.from("x").select("*"))
  obj[Symbol.toStringTag] = "Promise";
  return obj;
};

const stubClient = {
  auth: {
    getUser: async () => ({ data: { user: null }, error: null }),
    getSession: async () => ({ data: { session: null }, error: null }),
    onAuthStateChange: () => ({
      data: { subscription: { unsubscribe: () => {} } },
    }),
    signOut: async () => ({ error: null }),
    signInWithPassword: async () => ({
      data: null,
      error: new Error("Supabase not configured"),
    }),
    signUp: async () => ({
      data: null,
      error: new Error("Supabase not configured"),
    }),
  },
  from: () => chainable(),
  channel: () => ({
    on: () => ({ subscribe: () => ({}) }),
    subscribe: () => ({}),
  }),
  removeChannel: () => {},
  storage: {
    from: () => ({
      upload: async () => ({ error: new Error("Supabase not configured") }),
      getPublicUrl: () => ({ data: { publicUrl: "" } }),
    }),
  },
};

// ── Main browser client — NO global fetch timeout ──────────────────────────
// Uploads need as long as they need. Per-operation timeouts live in the
// component that calls them (auth uses getSession which is local anyway).
export const supabase =
  supabaseUrl && supabaseAnonKey
    ? createBrowserClient(supabaseUrl, supabaseAnonKey)
    : (stubClient as any);

// ── Service-role client (server-side only, never import in client components) ─
export const getSupabaseServiceClient = () => {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY",
    );
  }
  if (!serviceRoleKey) {
    throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
};

export default supabase;
