import { supabase } from "@/lib/supabase";

export async function requestWithdrawal(user: any, amount: number) {
  const today = new Date().getDay();

  if (today !== 5) {
    throw new Error("Withdrawals processed Friday only");
  }

  if (amount < 10) {
    throw new Error("Minimum withdrawal is $10");
  }

  if (amount > 500) {
    throw new Error("Maximum weekly withdrawal $500");
  }

  if (amount > user.earnings) {
    throw new Error("Insufficient balance");
  }

  await supabase.from("withdrawals").insert({
    user_id: user.id,
    amount,
    status: "pending",
  });
}
