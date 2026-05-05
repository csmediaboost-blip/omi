// supabase/functions/send-push/index.ts
// Deploy: supabase functions deploy send-push
// Called by: database triggers or other edge functions

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const FCM_SERVER_KEY = Deno.env.get("FCM_SERVER_KEY") || "";

interface PushPayload {
  userId: string;
  title: string;
  body: string;
  data?: Record<string, string>;
}

async function sendFCM(
  token: string,
  title: string,
  body: string,
  data: Record<string, string> = {},
) {
  const res = await fetch("https://fcm.googleapis.com/fcm/send", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `key=${FCM_SERVER_KEY}`,
    },
    body: JSON.stringify({
      to: token,
      notification: {
        title,
        body,
        icon: "/icons/icon-192.png",
        badge: "/icons/badge-72.png",
      },
      data,
      webpush: {
        headers: { Urgency: "high" },
        notification: { title, body, requireInteraction: false },
      },
    }),
  });
  return res.json();
}

Deno.serve(async (req) => {
  const { userId, title, body, data = {} }: PushPayload = await req.json();

  const { data: tokens } = await supabase
    .from("push_tokens")
    .select("token")
    .eq("user_id", userId)
    .eq("active", true);

  if (!tokens?.length) {
    return new Response(JSON.stringify({ sent: 0 }), { status: 200 });
  }

  let sent = 0;
  for (const { token } of tokens) {
    try {
      const result = await sendFCM(token, title, body, data);
      if (result.failure === 1) {
        // Token invalid — deactivate
        await supabase
          .from("push_tokens")
          .update({ active: false })
          .eq("token", token);
      } else {
        sent++;
      }
    } catch (e) {
      console.error("FCM error:", e);
    }
  }

  return new Response(JSON.stringify({ sent }), { status: 200 });
});
