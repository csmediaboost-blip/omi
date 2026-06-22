"use client";
// app/admin/prize-winners/page.tsx
// Shows users who hit the 3 monthly referral prize targets.
// Admin can mark a winner — user sees a "You Won!" banner on /dashboard/network.
// Targets: Luxury Car (120 refs), Phone Bundle (50 refs), Fridge (30 refs)

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import {
  Trophy,
  Mail,
  Phone,
  MapPin,
  Award,
  CheckCircle,
  RefreshCw,
  Crown,
  Users,
  Car,
  Smartphone,
  Refrigerator,
} from "lucide-react";

const PRIZES = [
  {
    id: "luxury_car",
    title: "Luxury Car",
    emoji: "🏆",
    target: 120,
    color: "text-amber-600",
    bg: "bg-amber-50",
    border: "border-amber-200",
    badgeBg: "bg-amber-100",
    btnColor: "bg-amber-500 hover:bg-amber-600",
    Icon: Car,
  },
  {
    id: "phone_bundle",
    title: "iPhone 17 Pro + Samsung S25 Ultra",
    emoji: "📱",
    target: 50,
    color: "text-violet-600",
    bg: "bg-violet-50",
    border: "border-violet-200",
    badgeBg: "bg-violet-100",
    btnColor: "bg-violet-500 hover:bg-violet-600",
    Icon: Smartphone,
  },
  {
    id: "fridge",
    title: "Samsung Bespoke Fridge",
    emoji: "❄️",
    target: 30,
    color: "text-blue-600",
    bg: "bg-blue-50",
    border: "border-blue-200",
    badgeBg: "bg-blue-100",
    btnColor: "bg-blue-500 hover:bg-blue-600",
    Icon: Refrigerator,
  },
] as const;

type PrizeId = (typeof PRIZES)[number]["id"];

interface QualifyingUser {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  delivery_address: string | null;
  city: string | null;
  country: string | null;
  referral_count: number;
}

interface WinnerRow {
  id: string;
  user_id: string;
  prize_id: string;
  awarded_at: string;
}

export default function PrizeWinnersPage() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<PrizeId>("luxury_car");
  const [qualifiers, setQualifiers] = useState<
    Record<PrizeId, QualifyingUser[]>
  >({
    luxury_car: [],
    phone_bundle: [],
    fridge: [],
  });
  const [winners, setWinners] = useState<WinnerRow[]>([]);
  const [awarding, setAwarding] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const monthStart = (() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  })();

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 4000);
  };

  const load = useCallback(async () => {
    const { data: allUsers } = await supabase
      .from("users")
      .select("id, full_name, email, phone, delivery_address, city, country");

    if (!allUsers) {
      setLoading(false);
      setRefreshing(false);
      return;
    }

    const { data: referredThisMonth } = await supabase
      .from("users")
      .select("referred_by")
      .gte("created_at", monthStart)
      .not("referred_by", "is", null);

    const countMap: Record<string, number> = {};
    (referredThisMonth || []).forEach((r: { referred_by: string }) => {
      countMap[r.referred_by] = (countMap[r.referred_by] || 0) + 1;
    });

    const next: Record<PrizeId, QualifyingUser[]> = {
      luxury_car: [],
      phone_bundle: [],
      fridge: [],
    };

    for (const u of allUsers as any[]) {
      const count = countMap[u.id] || 0;
      if (count <= 0) continue;
      const entry: QualifyingUser = {
        id: u.id,
        full_name: u.full_name,
        email: u.email,
        phone: u.phone,
        delivery_address: u.delivery_address,
        city: u.city,
        country: u.country,
        referral_count: count,
      };
      for (const prize of PRIZES) {
        if (count >= prize.target) next[prize.id].push(entry);
      }
    }

    for (const prize of PRIZES) {
      next[prize.id].sort((a, b) => b.referral_count - a.referral_count);
    }

    setQualifiers(next);

    const { data: winnerRows } = await supabase
      .from("prize_winners")
      .select("id, user_id, prize_id, awarded_at")
      .gte("awarded_at", monthStart);

    setWinners((winnerRows as WinnerRow[]) || []);
    setLoading(false);
    setRefreshing(false);
  }, [monthStart]);

  useEffect(() => {
    load();
  }, [load]);

  async function markWinner(user: QualifyingUser, prizeId: PrizeId) {
    const key = `${user.id}-${prizeId}`;
    setAwarding(key);
    try {
      const { error } = await supabase.from("prize_winners").insert({
        user_id: user.id,
        prize_id: prizeId,
        awarded_at: new Date().toISOString(),
      });

      if (error) throw error;

      const prize = PRIZES.find((p) => p.id === prizeId)!;

      // Notify the user
      await supabase
        .from("user_notifications")
        .insert({
          user_id: user.id,
          type: "prize_win",
          title: `${prize.emoji} Congratulations! You Won a Prize!`,
          body: `You've been selected as a winner of the ${prize.title}. Our team will contact you at your registered details to arrange delivery. Well done! 🎉`,
          created_at: new Date().toISOString(),
        })
        .catch(() => {});

      await load();
      showToast(
        `✅ ${user.full_name || "User"} marked as winner for ${prize.title}`,
      );
    } catch (err: any) {
      showToast(`❌ Failed: ${err?.message || "Unknown error"}`);
    } finally {
      setAwarding(null);
    }
  }

  async function revokeWinner(userId: string, prizeId: PrizeId) {
    const existing = winners.find(
      (w) => w.user_id === userId && w.prize_id === prizeId,
    );
    if (!existing) return;
    await supabase.from("prize_winners").delete().eq("id", existing.id);
    await load();
    showToast("Winner status revoked.");
  }

  function isWinner(userId: string, prizeId: PrizeId) {
    return winners.some((w) => w.user_id === userId && w.prize_id === prizeId);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin w-8 h-8 border-4 border-gray-200 border-t-emerald-500 rounded-full" />
      </div>
    );
  }

  const activePrize = PRIZES.find((p) => p.id === activeTab)!;
  const activeList = qualifiers[activeTab];
  const totalWinners = winners.length;

  return (
    <div className="space-y-6">
      {/* Toast */}
      {toast && (
        <div className="fixed top-4 right-4 z-50 bg-gray-900 text-white text-sm font-semibold px-4 py-3 rounded-xl shadow-xl">
          {toast}
        </div>
      )}

      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-black text-gray-900 flex items-center gap-2">
            <Trophy size={24} className="text-amber-500" />
            Prize Target Winners
          </h1>
          <p className="text-gray-500 text-sm mt-1">
            Monthly referral targets ·{" "}
            {new Date().toLocaleString("default", {
              month: "long",
              year: "numeric",
            })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {totalWinners > 0 && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-bold">
              <Crown size={12} />
              {totalWinners} winner{totalWinners !== 1 ? "s" : ""} this month
            </div>
          )}
          <button
            onClick={() => {
              setRefreshing(true);
              load();
            }}
            className="flex items-center gap-1.5 text-gray-600 hover:text-gray-900 text-xs font-semibold px-3 py-2 border border-gray-200 rounded-lg bg-white transition-colors"
          >
            <RefreshCw size={12} className={refreshing ? "animate-spin" : ""} />
            Refresh
          </button>
        </div>
      </div>

      {/* Prize summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {PRIZES.map((prize) => {
          const count = qualifiers[prize.id].length;
          const wonCount = winners.filter(
            (w) => w.prize_id === prize.id,
          ).length;
          const Icon = prize.Icon;
          return (
            <button
              key={prize.id}
              onClick={() => setActiveTab(prize.id)}
              className={`text-left p-4 rounded-2xl border-2 transition-all ${
                activeTab === prize.id
                  ? `${prize.bg} ${prize.border} shadow-sm`
                  : "bg-white border-gray-200 hover:border-gray-300"
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-2xl">{prize.emoji}</span>
                {wonCount > 0 && (
                  <span className="flex items-center gap-1 text-[10px] font-black px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200">
                    <Crown size={8} /> {wonCount} won
                  </span>
                )}
              </div>
              <p
                className={`font-black text-sm leading-tight ${activeTab === prize.id ? prize.color : "text-gray-900"}`}
              >
                {prize.title}
              </p>
              <p className="text-gray-400 text-xs mt-1">
                Target: {prize.target} referrals
              </p>
              <div className="flex items-center gap-1.5 mt-2">
                <Users
                  size={11}
                  className={
                    activeTab === prize.id ? prize.color : "text-gray-400"
                  }
                />
                <span
                  className={`text-xs font-bold ${activeTab === prize.id ? prize.color : "text-gray-500"}`}
                >
                  {count} qualified
                </span>
              </div>
            </button>
          );
        })}
      </div>

      {/* Active prize qualifier list */}
      <div>
        <div
          className={`flex items-center justify-between px-4 py-3 rounded-t-2xl border ${activePrize.bg} ${activePrize.border}`}
        >
          <div className="flex items-center gap-2">
            <span className="text-lg">{activePrize.emoji}</span>
            <p className={`font-black text-sm ${activePrize.color}`}>
              {activePrize.title}
            </p>
            <span
              className={`text-[10px] font-black px-2 py-0.5 rounded-full ${activePrize.badgeBg} ${activePrize.color}`}
            >
              {activePrize.target}+ referrals needed
            </span>
          </div>
          <div className="flex items-center gap-1.5 text-xs font-bold text-gray-600">
            <Award size={13} />
            {activeList.length} qualified
          </div>
        </div>

        {activeList.length === 0 ? (
          <div className="text-center py-16 border border-t-0 border-gray-200 rounded-b-2xl bg-white text-gray-400">
            <Trophy size={32} className="mx-auto mb-3 opacity-20" />
            <p className="font-semibold text-gray-500">
              No users have reached this target yet
            </p>
            <p className="text-xs mt-1">
              Users need {activePrize.target}+ referrals this month
            </p>
          </div>
        ) : (
          <div className="border border-t-0 border-gray-200 rounded-b-2xl overflow-hidden divide-y divide-gray-100">
            {activeList.map((u, idx) => {
              const won = isWinner(u.id, activeTab);
              const key = `${u.id}-${activeTab}`;
              const isLoading = awarding === key;

              return (
                <div
                  key={u.id}
                  className={`bg-white p-4 transition-colors ${won ? "bg-emerald-50/40" : "hover:bg-gray-50"}`}
                >
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="flex items-start gap-3 min-w-0 flex-1">
                      {/* Rank badge */}
                      <div
                        className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-xs font-black ${
                          idx === 0
                            ? "bg-amber-100 text-amber-700"
                            : idx === 1
                              ? "bg-gray-100 text-gray-600"
                              : idx === 2
                                ? "bg-orange-100 text-orange-700"
                                : "bg-gray-50 text-gray-400"
                        }`}
                      >
                        {idx + 1}
                      </div>

                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <p className="font-black text-gray-900 text-sm">
                            {u.full_name ||
                              `User ${u.id.slice(0, 8).toUpperCase()}`}
                          </p>
                          <span
                            className={`text-[10px] font-black px-2 py-0.5 rounded-full ${activePrize.badgeBg} ${activePrize.color}`}
                          >
                            {u.referral_count} referrals
                          </span>
                          {won && (
                            <span className="flex items-center gap-1 text-[10px] font-black px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200">
                              <Crown size={9} /> Winner ✓
                            </span>
                          )}
                        </div>

                        {/* Contact & delivery details */}
                        <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-gray-500">
                          {u.email && (
                            <span className="flex items-center gap-1">
                              <Mail size={10} className="shrink-0" />
                              {u.email}
                            </span>
                          )}
                          {u.phone && (
                            <span className="flex items-center gap-1">
                              <Phone size={10} className="shrink-0" />
                              {u.phone}
                            </span>
                          )}
                          {(u.delivery_address || u.city || u.country) && (
                            <span className="flex items-center gap-1">
                              <MapPin size={10} className="shrink-0" />
                              {[u.delivery_address, u.city, u.country]
                                .filter(Boolean)
                                .join(", ")}
                            </span>
                          )}
                          {!u.delivery_address && !u.city && !u.country && (
                            <span className="text-red-400 flex items-center gap-1">
                              <MapPin size={10} />
                              No delivery address on file
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Action buttons */}
                    <div className="flex items-center gap-2 shrink-0">
                      {won ? (
                        <>
                          <div className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-600 text-xs font-black">
                            <CheckCircle size={12} /> Marked as Winner
                          </div>
                          <button
                            onClick={() => revokeWinner(u.id, activeTab)}
                            className="px-3 py-2 rounded-lg border border-red-200 text-red-500 text-xs font-semibold hover:bg-red-50 transition-colors"
                          >
                            Revoke
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={() => markWinner(u, activeTab)}
                          disabled={isLoading}
                          className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-black text-white transition-all disabled:opacity-60 ${activePrize.btnColor}`}
                        >
                          {isLoading ? (
                            <>
                              <RefreshCw size={12} className="animate-spin" />{" "}
                              Awarding…
                            </>
                          ) : (
                            <>
                              <Trophy size={12} /> Mark as Winner
                            </>
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
