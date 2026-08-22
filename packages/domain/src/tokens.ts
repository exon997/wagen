/**
 * Design tokens (6.3). Shared as DATA between web and mobile - components
 * are deliberately not shared (no packages/ui in v1).
 */
export const colors = {
  /**
   * Accent - CTA buttons, highlights, hover states, icons, the price bar.
   * NEVER as text color on a white background (fails WCAG AA - 6.3).
   * Black text on cyan passes contrast (13.1 price bar).
   */
  cyan: '#1EDCE8',
  gray: '#808080',
  black: '#000000',
  white: '#FFFFFF',
} as const;

export type ColorToken = keyof typeof colors;
