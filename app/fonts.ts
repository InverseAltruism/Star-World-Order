// SWO V2 typography — self-hosted via next/font (no FOUT, no external <link>).
// See docs/UI_V2_REDESIGN_PLAN.md §3.2. Roles:
//   Press Start 2P  → hero titles / "PRESS START" only (display, all-caps, never body)
//   Pixelify Sans   → section sub-headings & mid-size UI (readable small, multi-weight)
//   VT323           → boot/terminal log & console-style body (has lowercase)
//   Departure Mono  → numeric HUD / stat tables / STAR balances (monospaced alignment)
import { Press_Start_2P, Pixelify_Sans, VT323 } from 'next/font/google';
import localFont from 'next/font/local';

export const pressStart2P = Press_Start_2P({
  weight: '400',
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-pixel-display',
  fallback: ['Courier New', 'monospace'],
});

export const pixelifySans = Pixelify_Sans({
  weight: ['400', '500', '600', '700'],
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-pixel-ui',
  fallback: ['Courier New', 'monospace'],
});

export const vt323 = VT323({
  weight: '400',
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-terminal',
  fallback: ['Courier New', 'monospace'],
});

export const departureMono = localFont({
  src: './fonts/DepartureMono-Regular.woff2',
  display: 'swap',
  variable: '--font-mono-hud',
  fallback: ['ui-monospace', 'monospace'],
});

// Combined className for <html> — exposes all four CSS variables.
export const fontVariables = [
  pressStart2P.variable,
  pixelifySans.variable,
  vt323.variable,
  departureMono.variable,
].join(' ');
