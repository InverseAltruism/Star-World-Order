'use client';

// SWO V2 — centralized, path-aware site chrome. Renders the global Header /
// Footer / FeedbackButton once (from the root layout) instead of per-page, and
// suppresses them on app/game/compliance surfaces that own their own chrome.
// See docs/UI_V2_REDESIGN_PLAN.md §6.1.
import { usePathname } from 'next/navigation';
import Header from './Header';
import Footer from './Footer';
import FeedbackButton from './FeedbackButton';

// Feedback/Bugs button — hidden for now; flip to true to re-enable site-wide.
const SHOW_FEEDBACK_BUTTON = false;

// Header is hidden on these (own auth/standalone surfaces).
const NO_HEADER = ['/admin', '/region-not-supported', '/__e2e__'];
// Footer + feedback button additionally hidden on full-bleed game / compliance pages.
const NO_FOOTER = [...NO_HEADER, '/casino', '/sanctuary', '/dev-preview'];

const startsWithAny = (path: string, prefixes: string[]) =>
  prefixes.some((p) => path === p || path.startsWith(p + '/') || path.startsWith(p));

export default function SiteChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || '/';
  const hideHeader = startsWithAny(pathname, NO_HEADER);
  const hideFooter = startsWithAny(pathname, NO_FOOTER);

  return (
    <>
      {!hideHeader && <Header />}
      {children}
      {!hideFooter && <Footer />}
      {SHOW_FEEDBACK_BUTTON && !hideFooter && <FeedbackButton />}
    </>
  );
}
