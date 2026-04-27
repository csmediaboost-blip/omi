'use client';

import { useEffect, useState } from 'react';
import { AlertCircle, Wifi, WifiOff } from 'lucide-react';

interface NetworkErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

export function NetworkErrorBoundary({
  children,
  fallback,
}: NetworkErrorBoundaryProps) {
  const [isOnline, setIsOnline] = useState(true);
  const [showError, setShowError] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    // Check initial online status
    setIsOnline(navigator.onLine);

    const handleOnline = () => {
      console.log('[v0] Connection restored');
      setIsOnline(true);
      setShowError(false);
      setRetryCount(0);
      // Optionally refetch data here
    };

    const handleOffline = () => {
      console.log('[v0] Connection lost');
      setIsOnline(false);
      setShowError(true);
      setLastError('No internet connection');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const handleRetry = () => {
    setRetryCount((prev) => prev + 1);
    setShowError(false);
    setLastError(null);
    // Reload page to retry
    window.location.reload();
  };

  if (!isOnline && showError) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-background p-4">
        <div className="max-w-md w-full space-y-4 text-center">
          <div className="flex justify-center">
            {isOnline ? (
              <Wifi className="w-12 h-12 text-green-500" />
            ) : (
              <WifiOff className="w-12 h-12 text-red-500" />
            )}
          </div>
          
          <div className="space-y-2">
            <h1 className="text-2xl font-bold text-foreground">
              {isOnline ? 'Connection Restored' : 'No Internet Connection'}
            </h1>
            <p className="text-sm text-muted-foreground">
              {lastError || 'Please check your internet connection and try again.'}
            </p>
          </div>

          <div className="space-y-2 pt-4">
            <button
              onClick={handleRetry}
              className="w-full px-4 py-2 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 transition-colors"
            >
              Retry
            </button>
            {retryCount > 0 && (
              <p className="text-xs text-muted-foreground">
                Retry attempt {retryCount}
              </p>
            )}
          </div>

          <div className="pt-4 border-t border-border">
            <p className="text-xs text-muted-foreground">
              Troubleshooting tips:
            </p>
            <ul className="text-xs text-muted-foreground space-y-1 mt-2 text-left">
              <li>• Check your WiFi or mobile connection</li>
              <li>• Try turning airplane mode off and on</li>
              <li>• Restart your device</li>
              <li>• Contact your ISP if problem persists</li>
            </ul>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
