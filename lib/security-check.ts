import { supabase } from "@/lib/supabase";

export async function detectMultipleAccounts(fingerprint: string) {
  const { data } = await supabase
    .from("users")
    .select("id")
    .eq("device_fingerprint", fingerprint);

  if (data && data.length > 3) {
    throw new Error("Multiple accounts detected");
  }
}
