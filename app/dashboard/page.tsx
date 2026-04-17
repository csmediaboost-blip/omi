import DashboardPage from "@/components/users/dashboardClient";
import { createSupabaseServer } from "@/lib/supabase-server";
import { redirect } from "next/navigation";

export default async function ClientDashboard() {
  const supabase = await createSupabaseServer();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (!user || authError) {
    redirect("/auth/signin");
  }

  return (
    <div>
      <DashboardPage userDetails={user} />
    </div>
  );
}
