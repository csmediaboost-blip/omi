/**
 * Mobile Touch Accessibility Helper
 * Provides standardized inline styles for mobile-friendly buttons and interactive elements
 */

export const MOBILE_TOUCH_STYLES: React.CSSProperties = {
  WebkitTapHighlightColor: "transparent",
  touchAction: "manipulation",
  WebkitUserSelect: "none",
  userSelect: "none",
};

export const MOBILE_SAFE_POSITIONING = {
  pointerEvents: "auto" as const,
  touchAction: "manipulation" as const,
};
