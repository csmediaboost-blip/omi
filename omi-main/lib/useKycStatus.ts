import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";

export type KYCStatus = "not_started" | "pending" | "approved" | "rejected";

/**
 * Resolves true KYC status by checking all three sources:
 * - users.kyc_verified (written by admin approval)
 * - user_kyc.status (from verification flow)
 * - kyc_documents.status (from admin panel)
 */
function resolveKYCStatus(
  usersRow: any,
  userKycRow: any,
  kycDocRow: any,
): KYCStatus {
  // Priority 1: users.kyc_verified = true → definitely approved
  if (usersRow?.kyc_verified === true) return "approved";

  // Priority 2: kyc_documents latest record shows "verified"
  if (kycDocRow?.status === "verified") return "approved";

  // Priority 3: user_kyc table shows approved
  if (userKycRow?.status === "approved") return "approved";

  // Check for pending in any table
  if (
    usersRow?.kyc_status === "pending" ||
    usersRow?.kyc_status === "pending_review" ||
    userKycRow?.status === "pending_review" ||
    userKycRow?.status === "pending" ||
    kycDocRow?.status === "pending"
  ) {
    return "pending";
  }

  // Check for rejected
  if (
    usersRow?.kyc_status === "rejected" ||
    userKycRow?.status === "rejected" ||
    kycDocRow?.status === "rejected"
  ) {
    return "rejected";
  }

  return "not_started";
}

/**
 * Shared hook for KYC status polling across pages.
 * Checks users, user_kyc, and kyc_documents tables every 3 seconds.
 * Auto-syncs users.kyc_verified when any source shows approved.
 */
export function useKycStatus(userId: string | null) {
  const [kycStatus, setKycStatus] = useState<KYCStatus>("not_started");

  const checkKycStatus = useCallback(async () => {
    if (!userId) return;

    try {
      // Get current session
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.user) return;

      // Query all three sources in parallel
      const [{ data: usersRow }, { data: userKycRow }, { data: kycDocRow }] =
        await Promise.all([
          supabase
            .from("users")
            .select("kyc_verified,kyc_status")
            .eq("id", userId)
            .maybeSingle(),
          supabase
            .from("user_kyc")
            .select("status")
            .eq("user_id", userId)
            .maybeSingle(),
          supabase
            .from("kyc_documents")
            .select("status")
            .eq("user_id", userId)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle(),
        ]);

      const resolved = resolveKYCStatus(usersRow, userKycRow, kycDocRow);
      setKycStatus(resolved);

      // Auto-sync: If kyc_documents shows verified but users.kyc_verified is false,
      // update the users table to keep them in sync
      if (resolved === "approved" && usersRow && !usersRow.kyc_verified) {
        await supabase
          .from("users")
          .update({ kyc_verified: true, kyc_status: "verified" })
          .eq("id", userId);
      }
    } catch (err) {
      // Silent error - continue polling
      console.error("[useKycStatus] Error checking KYC:", err);
    }
  }, [userId]);

  // Poll every 3 seconds
  useEffect(() => {
    if (!userId) return;

    // Check immediately
    checkKycStatus();

    // Then poll every 3 seconds
    const interval = setInterval(checkKycStatus, 3000);
    return () => clearInterval(interval);
  }, [userId, checkKycStatus]);

  return {
    kycStatus,
    recheck: checkKycStatus,
  };
}
