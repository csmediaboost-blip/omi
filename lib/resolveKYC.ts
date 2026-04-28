export type KYCStatus = "not_started" | "pending" | "approved" | "rejected";

/**
 * SECURITY FIX 2.2: Consolidated KYC Status
 * 
 * NOW reads from a SINGLE canonical source: users.kyc_status
 * 
 * Migration path:
 * - Old sources (kyc_documents.status, user_kyc.status, kyc_verified bool) 
 *   were consolidated into users.kyc_status during migration
 * - This function now has a single source of truth
 * 
 * @param usersRow User record with kyc_status column
 * @returns Canonical KYC status
 */
export function resolveKYCStatus(usersRow: any): KYCStatus {
  const status = usersRow?.kyc_status;
  
  if (!status || status === "not_started") return "not_started";
  if (status === "pending" || status === "pending_review") return "pending";
  if (status === "approved" || status === "verified") return "approved";
  if (status === "rejected") return "rejected";
  
  return "not_started";
}

/**
 * Legacy function for backwards compatibility during transition
 * Will be removed after all call sites are updated
 * @deprecated Use resolveKYCStatus with single usersRow parameter
 */
export function resolveKYCStatusLegacy(
  usersRow: any,
  userKycRow: any,
  kycDocRow: any,
): KYCStatus {
  // Fall back to new single-source resolver
  return resolveKYCStatus(usersRow);
}
