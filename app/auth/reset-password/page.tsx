// app/auth/reset-password/page.tsx
// FIXED: ResetPasswordForm already renders a full-page layout internally.
// The old wrapper was adding an extra div container that caused a layout clash.
// Now we just render the form directly — it handles everything itself.

import { ResetPasswordForm } from "@/components/auth/reset-password-form";

export default function ResetPasswordPage() {
  return <ResetPasswordForm />;
}
