// lib/lock-policy.ts
// ─────────────────────────────────────────────────────────────────────────────
// Capital return policy — FIRST DEPOSIT ONLY
//
// Rule: a user's very first deposit (their earliest allocation ever) is
// eligible for a partial capital return after a lock period, based on the
// tier their deposit amount falls into. The percentage and lock window are
// fixed by the ORIGINAL deposit amount and ORIGINAL deposit date — they do
// not change if the user later re-mines, withdraws, or stakes more.
//
// All deposits/re-mines AFTER the first one do NOT get any capital return —
// their capital stays committed to mining permanently. Only profit earned on
// those later allocations is withdrawable once mining completes.
// ─────────────────────────────────────────────────────────────────────────────

export type CapitalReturnTier = {
  lockDays: number;
  returnPct: number; // 0.0 - 1.0
};

export function getCapitalReturnTier(amount: number): CapitalReturnTier {
  if (amount <= 1)   return { lockDays: 7,   returnPct: 1.00 }; // 100%
  if (amount <= 3)   return { lockDays: 14,  returnPct: 0.40 }; // 40%
  if (amount <= 10)  return { lockDays: 21,  returnPct: 0.30 }; // 30%
  if (amount <= 20)  return { lockDays: 30,  returnPct: 0.20 }; // 20%
  if (amount <= 40)  return { lockDays: 55,  returnPct: 0.15 }; // 15%
  if (amount <= 100) return { lockDays: 90,  returnPct: 0.10 }; // 10% (3 months)
  if (amount <= 500) return { lockDays: 180, returnPct: 0.05 }; // 5%  (6 months)
  return                    { lockDays: 730, returnPct: 0.03 }; // 3%  (24 months)
}

export function getCapitalReturnUnlockDate(createdAt: string, amount: number): Date {
  const { lockDays } = getCapitalReturnTier(amount);
  return new Date(new Date(createdAt).getTime() + lockDays * 86_400_000);
}

export function getCapitalReturnAmount(amount: number): number {
  const { returnPct } = getCapitalReturnTier(amount);
  return Math.round(amount * returnPct * 10000) / 10000;
}