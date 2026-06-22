'use client';

import { AuthProvider } from '@/lib/auth-context';
import { Toaster } from 'sonner';
import { ReactNode } from 'react';
import { LoadingProvider } from '@/components/LoadingProvider';

export function RootProviders({ children }: { children: ReactNode }) {
  return (
    <LoadingProvider>
      <AuthProvider>
        {children}
        <Toaster />
      </AuthProvider>
    </LoadingProvider>
  );
}
