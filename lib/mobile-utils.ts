/**
 * Mobile UX Utilities
 * 
 * Provides Tailwind class combinations and utilities for optimal mobile experience
 */

/**
 * Base button classes for mobile-friendly touch targets
 * - Minimum 48x48px touch target (WCAG AAA standard)
 * - Proper focus states for keyboard navigation
 * - iOS-friendly styling
 */
export const BUTTON_CLASSES = {
  base: "min-h-12 min-w-12 px-4 py-3 transition-colors",
  focus: "focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary",
  mobile: "-webkit-appearance-none touch-action-manipulation",
};

/**
 * Input classes for mobile-friendly forms
 * - 16px font size prevents iOS zoom
 * - Clear focus states
 * - Better touch interaction
 */
export const INPUT_CLASSES = {
  base: "text-base -webkit-appearance-none",
  focus: "focus:outline-none focus:ring-2 focus:ring-primary",
  mobile: "touch-action-manipulation",
};

/**
 * Modal classes for proper mobile display
 * - Max height prevents overflow on small screens
 * - Proper scrolling for content
 * - Bottom padding for fixed buttons
 */
export const MODAL_CLASSES = {
  overlay: "fixed inset-0 z-50 bg-black/50",
  content: "max-h-[90vh] overflow-y-auto px-4",
  fixed: "fixed bottom-0 left-0 right-0 bg-background border-t",
};

/**
 * Responsive container classes
 * Mobile-first approach with breakpoint overrides
 */
export const RESPONSIVE_CLASSES = {
  container: "px-4 md:px-6 lg:px-8",
  padding: "p-2 sm:p-4 md:p-6",
  gap: "gap-2 sm:gap-3 md:gap-4",
};

/**
 * Detect if device is mobile
 * Uses window.innerWidth, should only be called client-side
 */
export function isMobileDevice(): boolean {
  if (typeof window === "undefined") return false;
  return window.innerWidth < 768; // Tailwind md breakpoint
}

/**
 * Get input mode for keyboard type
 * Helps mobile devices show correct keyboard
 */
export function getInputMode(
  type: "email" | "phone" | "number" | "text" = "text"
): "email" | "tel" | "numeric" | "text" {
  const modes = {
    email: "email",
    phone: "tel",
    number: "numeric",
    text: "text",
  } as const;
  return modes[type];
}

/**
 * Calculate responsive chart height
 * Returns appropriate height for current screen size
 */
export function getResponsiveChartHeight(): number {
  if (typeof window === "undefined") return 250;
  
  const width = window.innerWidth;
  if (width < 640) return 250; // Mobile
  if (width < 1024) return 320; // Tablet
  return 400; // Desktop
}

/**
 * Get touch target minimum dimensions
 * Returns the minimum size for accessible touch targets
 */
export const TOUCH_TARGET_MIN = {
  width: 48, // pixels
  height: 48, // pixels
} as const;

/**
 * Button button base classes combining mobile UX best practices
 */
export function getButtonClasses(variant: "primary" | "secondary" | "outline" = "primary"): string {
  const baseClasses = `${BUTTON_CLASSES.base} ${BUTTON_CLASSES.focus} ${BUTTON_CLASSES.mobile}`;
  
  const variants = {
    primary: "bg-primary hover:bg-primary/90 text-primary-foreground",
    secondary: "bg-secondary hover:bg-secondary/90 text-secondary-foreground",
    outline: "border border-border hover:bg-accent text-foreground",
  };

  return `${baseClasses} ${variants[variant]}`;
}

/**
 * Input base classes combining mobile UX best practices
 */
export function getInputClasses(): string {
  return `${INPUT_CLASSES.base} ${INPUT_CLASSES.focus} ${INPUT_CLASSES.mobile} border border-input rounded-lg bg-background px-4 py-2`;
}
