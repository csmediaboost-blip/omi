// hooks/useRealtimeSync.ts
// Drop this in your dashboard layout — it connects every admin action to the user instantly
// Usage: call useRealtimeSync() once in your dashboard layout or _app

"use client";
import { useEffect, useCallback, useRef } from "react";
import { supabase } from "@/lib/supabase";

// ── Types ─────────────────────────────────────────────────────────────────────
export type Notification = {
  id: string;
  type: string;
  title: string;
  body: string;
  action_url: string | null;
  is_read: boolean;
  created_at: string;
};

export type UserSyncState = {
  notifications: Notification[];
  unreadCount: number;
  balance: number;
  pendingBalance: number;
  kycStatus: string | null;
  kycVerified: boolean;
  withdrawalsFrozen: boolean;
  tierName: string | null;
  nodeExpiryDate: string | null;
  announcements: Announcement[];
  freezeStatus: { is_frozen: boolean; reason: string | null };
};

export type Announcement = {
  id: string;
  title: string;
  body: string;
  type: string;
  action_type: string | null;
  requires_action: boolean;
  is_active: boolean;
  created_at: string;
};

type SyncCallbacks = {
  onNotification?: (n: Notification) => void;
  onBalanceChange?: (balance: number, pending: number) => void;
  onKycChange?: (status: string, verified: boolean) => void;
  onFreezeChange?: (frozen: boolean, reason: string | null) => void;
  onAnnouncementChange?: (announcements: Announcement[]) => void;
  onSupportReply?: (ticketId: string) => void;
  onPlanChange?: (tier: string) => void;
};

// ── Main hook ──────────────────────────────────────────────────────────────────
export function useRealtimeSync(callbacks: SyncCallbacks = {}) {
  const userId = useRef<string | null>(null);
  const channelsRef = useRef<ReturnType<typeof supabase.channel>[]>([]);

  const cleanup = useCallback(() => {
    channelsRef.current.forEach((ch) => {
      supabase.removeChannel(ch);
    });
    channelsRef.current = [];
  }, []);

  useEffect(() => {
    let mounted = true;

    async function setup() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user || !mounted) return;
      userId.current = user.id;

      // ── 1. User notifications (all admin → user messages) ──────────────────
      // This is the primary channel — KYC approval, balance changes, withdrawals,
      // support replies, license changes, etc. all send through here
      const notifChannel = supabase
        .channel(`user_notifications:${user.id}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "user_notifications",
            filter: `user_id=eq.${user.id}`,
          },
          (payload) => {
            const n = payload.new as Notification;
            callbacks.onNotification?.(n);

            // Auto-trigger specific callbacks based on notification type
            if (n.type === "kyc_approved" || n.type === "kyc_rejected") {
              // Refresh KYC status
              refreshUserProfile(user.id);
            }
            if (
              n.type === "balance_credit" ||
              n.type === "balance_released" ||
              n.type === "balance_debit"
            ) {
              refreshBalance(user.id);
            }
            if (n.type === "task_approved") {
              refreshBalance(user.id);
            }
            if (
              n.type === "withdrawal_paid" ||
              n.type === "withdrawal_rejected"
            ) {
              refreshBalance(user.id);
            }
            if (
              n.type === "node_activated" ||
              n.type === "license_extended" ||
              n.type === "payment_confirmed"
            ) {
              refreshUserProfile(user.id);
            }
          },
        )
        .subscribe((status) => {
          if (status === "SUBSCRIBED")
            console.log("[realtime] notifications subscribed");
          if (status === "CHANNEL_ERROR")
            console.error("[realtime] notifications error");
        });

      // ── 2. Users table — watch own row for direct column changes ───────────
      // Admin updates: balance, kyc_status, tier, withdwals_fronzen, etc.
      const userRowChannel = supabase
        .channel(`users_self:${user.id}`)
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "users",
            filter: `id=eq.${user.id}`,
          },
          (payload) => {
            const updated = payload.new as Record<string, unknown>;

            // Balance changed
            const newBal = (updated.balance_available ??
              updated.wallet_balance) as number;
            const newPending = (updated.balance_pending ??
              updated.pending_balance) as number;
            callbacks.onBalanceChange?.(newBal, newPending);

            // KYC changed
            if (
              updated.kyc_status !== undefined ||
              updated.kyc_verified !== undefined
            ) {
              callbacks.onKycChange?.(
                updated.kyc_status as string,
                updated.kyc_verified as boolean,
              );
            }

            // Freeze changed
            if (updated.withdwals_fronzen !== undefined) {
              callbacks.onFreezeChange?.(
                updated.withdwals_fronzen as boolean,
                null,
              );
            }

            // GPU plan / tier changed
            if (updated.tier !== undefined) {
              callbacks.onPlanChange?.(updated.tier as string);
            }
          },
        )
        .subscribe((status) => {
          if (status === "SUBSCRIBED")
            console.log("[realtime] user row subscribed");
        });

      // ── 3. Platform announcements — admin posts, user sees immediately ──────
      const announcementChannel = supabase
        .channel("platform_announcements_live")
        .on(
          "postgres_changes",
          {
            event: "*", // INSERT, UPDATE, DELETE
            schema: "public",
            table: "platform_announcements",
            filter: "is_active=eq.true",
          },
          async () => {
            // Refetch all active announcements
            const { data } = await supabase
              .from("platform_announcements")
              .select("*")
              .eq("is_active", true)
              .order("created_at", { ascending: false });
            callbacks.onAnnouncementChange?.((data as Announcement[]) || []);
          },
        )
        .subscribe((status) => {
          if (status === "SUBSCRIBED")
            console.log("[realtime] announcements subscribed");
        });

      // ── 4. Withdrawal freeze — user sees freeze/unfreeze instantly ──────────
      const freezeChannel = supabase
        .channel("withdrawal_freeze_live")
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "withdrawal_freeze",
          },
          (payload) => {
            const row = (payload.new || payload.old) as {
              is_frozen?: boolean;
              reason?: string;
            };
            callbacks.onFreezeChange?.(
              row?.is_frozen ?? false,
              row?.reason ?? null,
            );
          },
        )
        .subscribe((status) => {
          if (status === "SUBSCRIBED")
            console.log("[realtime] freeze subscribed");
        });

      // ── 5. Support messages — admin replies appear instantly in chat ─────────
      const supportChannel = supabase
        .channel(`support_messages:${user.id}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "support_messages",
            // We can't filter on user_id here (it's on the ticket, not the message)
            // So we filter on is_admin=true to only get admin replies
          },
          async (payload) => {
            const msg = payload.new as { ticket_id: string; is_admin: boolean };
            if (!msg.is_admin) return; // Only care about admin replies

            // Verify this ticket belongs to us
            const { data: ticket } = await supabase
              .from("support_tickets")
              .select("id, user_id")
              .eq("id", msg.ticket_id)
              .eq("user_id", user.id)
              .single();

            if (ticket) {
              callbacks.onSupportReply?.(msg.ticket_id);
            }
          },
        )
        .subscribe((status) => {
          if (status === "SUBSCRIBED")
            console.log("[realtime] support subscribed");
        });

      channelsRef.current = [
        notifChannel,
        userRowChannel,
        announcementChannel,
        freezeChannel,
        supportChannel,
      ];
    }

    setup();
    return () => {
      mounted = false;
      cleanup();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return { cleanup };
}

// ── Helper: refresh balance from DB ──────────────────────────────────────────
async function refreshBalance(userId: string) {
  const { data } = await supabase
    .from("users")
    .select(
      "balance_available, wallet_balance, balance_pending, pending_balance",
    )
    .eq("id", userId)
    .single();
  return data;
}

// ── Helper: refresh full profile ─────────────────────────────────────────────
async function refreshUserProfile(userId: string) {
  const { data } = await supabase
    .from("users")
    .select(
      "kyc_status, kyc_verified, tier, node_expiry_date, withdwals_fronzen, balance_available, wallet_balance",
    )
    .eq("id", userId)
    .single();
  return data;
}

// ── Standalone: fetch initial notifications ───────────────────────────────────
export async function fetchNotifications(
  userId: string,
  limit = 20,
): Promise<Notification[]> {
  const { data } = await supabase
    .from("user_notifications")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data as Notification[]) || [];
}

// ── Standalone: mark notification as read ────────────────────────────────────
export async function markNotificationRead(notificationId: string) {
  await supabase
    .from("user_notifications")
    .update({ is_read: true })
    .eq("id", notificationId);
}

// ── Standalone: mark all read ─────────────────────────────────────────────────
export async function markAllNotificationsRead(userId: string) {
  await supabase
    .from("user_notifications")
    .update({ is_read: true })
    .eq("user_id", userId)
    .eq("is_read", false);
}
