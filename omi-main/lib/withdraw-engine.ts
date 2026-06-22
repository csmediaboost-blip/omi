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
    throw new Error(
      "Weekly withdrawal limit reached. Continue transacting to increase your withdrawal limit and help us maintain a secure platform");
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
