'use client';

import { AuthProvider } from '@/lib/auth-context';
import { Toaster } from 'sonner';
import { ReactNode } from 'react';

export function RootProviders({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      {children}
      <Toaster />
    </AuthProvider>
  );
}
