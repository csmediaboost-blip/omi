import Link from 'next/link';
import { ResetPasswordForm } from '@/components/auth/reset-password-form';

export default function ResetPasswordPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background dark">
      <div className="w-full max-w-md mx-4">
        <div className="text-center mb-8">
          <Link href="/" className="text-2xl font-bold text-foreground hover:text-primary transition inline-block mb-6">
            OmniTask Pro
          </Link>
          <h1 className="text-3xl font-bold text-foreground mb-2">Reset Password</h1>
          <p className="text-muted-foreground">We'll help you reset your password</p>
        </div>
        <div className="bg-card rounded-lg border border-border p-8">
          <ResetPasswordForm />
        </div>
      </div>
    </div>
  );
}
