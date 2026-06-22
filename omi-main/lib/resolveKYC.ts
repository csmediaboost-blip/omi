export type KYCStatus = "not_started" | "pending" | "approved" | "rejected";

/**
 * Resolves the true KYC status by checking ALL three data sources:
 *
 * 1. users.kyc_verified (boolean)
 * 2. users.kyc_status (string)
 * 3. kyc_documents.status
 * 4. user_kyc.status
 */
export function resolveKYCStatus(
  usersRow: any,
  userKycRow: any,
  kycDocRow: any,
): KYCStatus {
  // ── APPROVED ──
  if (usersRow?.kyc_verified === true) return "approved";
  if (kycDocRow?.status === "verified") return "approved";
  if (userKycRow?.status === "approved") return "approved";
  if (usersRow?.kyc_status === "verified") return "approved";
  if (usersRow?.kyc_status === "approved") return "approved";

  // ── PENDING ──
  if (
    usersRow?.kyc_status === "pending" ||
    usersRow?.kyc_status === "pending_review" ||
    userKycRow?.status === "pending_review" ||
    userKycRow?.status === "pending" ||
    kycDocRow?.status === "pending"
  )
    return "pending";

  // ── REJECTED ──
  if (
    usersRow?.kyc_status === "rejected" ||
    userKycRow?.status === "rejected" ||
    kycDocRow?.status === "rejected"
  )
    return "rejected";

  return "not_started";
}
