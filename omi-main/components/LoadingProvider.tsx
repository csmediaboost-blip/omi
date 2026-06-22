'use client';

import { ReactNode, useEffect, useState } from 'react';
import { LoadingSkeleton } from './LoadingSkeleton';

export function LoadingProvider({ children }: { children: ReactNode }) {
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    // Mark as hydrated immediately - this hides the skeleton
    setIsHydrated(true);
  }, []);

  // Only show skeleton during initial SSR/hydration phase
  if (!isHydrated) {
    return <LoadingSkeleton />;
  }

  return children;
}
