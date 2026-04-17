import { supabase } from "@/lib/supabase";

export async function activateNode(user: any, node: string) {
  const NODE_PRICE: any = {
    compute: 29,
    neural: 99,
    intelligence: 299,
    cognitive: 999,
  };

  const price = NODE_PRICE[node];

  if (user.earnings < price) {
    throw new Error("Add funds to activate node");
  }

  await supabase
    .from("users")
    .update({
      tier: node,
    })
    .eq("id", user.id);

  await supabase.from("licenses").insert({
    user_id: user.id,
    node,
    price,
    status: "active",
  });
}
