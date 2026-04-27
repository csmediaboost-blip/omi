import { AlertCircle, CheckCircle, Info, X } from 'lucide-react';
import { useEffect, useState } from 'react';

export type AlertType = 'error' | 'success' | 'info' | 'warning';

interface ErrorAlertProps {
  type: AlertType;
  title: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
  onClose?: () => void;
  autoClose?: number; // milliseconds, 0 = no auto-close
  details?: string;
}

/**
 * Accessible error/alert component with auto-dismiss and action support
 */
export function ErrorAlert({
  type,
  title,
  message,
  actionLabel,
  onAction,
  onClose,
  autoClose = type === 'success' ? 3000 : 0,
  details,
}: ErrorAlertProps) {
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    if (autoClose <= 0) return;

    const timer = setTimeout(() => {
      setIsVisible(false);
      onClose?.();
    }, autoClose);

    return () => clearTimeout(timer);
  }, [autoClose, onClose]);

  if (!isVisible) return null;

  const config = {
    error: {
      icon: AlertCircle,
      bgColor: 'bg-red-500/10',
      borderColor: 'border-red-500/30',
      textColor: 'text-red-300',
      titleColor: 'text-red-400',
    },
    success: {
      icon: CheckCircle,
      bgColor: 'bg-emerald-500/10',
      borderColor: 'border-emerald-500/30',
      textColor: 'text-emerald-300',
      titleColor: 'text-emerald-400',
    },
    info: {
      icon: Info,
      bgColor: 'bg-blue-500/10',
      borderColor: 'border-blue-500/30',
      textColor: 'text-blue-300',
      titleColor: 'text-blue-400',
    },
    warning: {
      icon: AlertCircle,
      bgColor: 'bg-amber-500/10',
      borderColor: 'border-amber-500/30',
      textColor: 'text-amber-300',
      titleColor: 'text-amber-400',
    },
  };

  const styles = config[type];
  const Icon = styles.icon;

  return (
    <div
      role="alert"
      className={`${styles.bgColor} border ${styles.borderColor} rounded-lg p-4 mb-4`}
    >
      <div className="flex gap-3">
        <Icon size={20} className={`${styles.textColor} shrink-0 mt-0.5`} />
        <div className="flex-1 min-w-0">
          <h3 className={`${styles.titleColor} font-bold text-sm mb-1`}>
            {title}
          </h3>
          {message && (
            <p className={`${styles.textColor} text-sm leading-relaxed mb-2`}>
              {message}
            </p>
          )}
          {details && (
            <pre className={`${styles.textColor} text-xs bg-black/20 rounded p-2 mt-2 overflow-x-auto max-w-sm`}>
              {details}
            </pre>
          )}
          {actionLabel && onAction && (
            <button
              onClick={onAction}
              className={`${styles.textColor} text-sm font-semibold mt-2 hover:opacity-80 transition-opacity`}
            >
              {actionLabel}
            </button>
          )}
        </div>
        <button
          onClick={() => {
            setIsVisible(false);
            onClose?.();
          }}
          className={`${styles.textColor} hover:opacity-80 transition-opacity shrink-0`}
          aria-label="Close alert"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
