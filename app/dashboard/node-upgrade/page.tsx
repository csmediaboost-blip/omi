import { redirect } from "next/navigation";

// Old node-upgrade route — redirects to the new GPU tasks page
export default function NodeUpgradePage() {
  redirect("/dashboard/tasks");
}
