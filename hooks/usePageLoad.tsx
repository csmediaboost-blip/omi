'use client';

import { useEffect, useState } from 'react';

export function usePageLoad() {
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Hide skeleton once page is fully loaded
    const handleLoad = () => {
      setTimeout(() => setIsLoading(false), 100);
    };

    if (document.readyState === 'complete') {
      handleLoad();
    } else {
      window.addEventListener('load', handleLoad);
      return () => window.removeEventListener('load', handleLoad);
    }
  }, []);

  return isLoading;
}
