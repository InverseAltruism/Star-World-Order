'use client';

// SWO V2 — grouped, data-driven site navigation with smooth dropdowns.
// One source of truth (NAV_GROUPS) drives both the desktop dropdowns and the
// mobile sheet, replacing the ~8x-repeated inline link blocks in the old Header.
// See docs/UI_V2_REDESIGN_PLAN.md §6.2 (Cosmic OS grouped IA).
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import styles from './SiteNav.module.css';

export type NavItem = {
  href: string;
  label: string;
  icon: string;
  desc: string;
  accent: string;
  dev?: boolean; // DEV-only (hidden in prod)
  external?: boolean;
};

export type NavGroup = { label: string; accent: string; items: NavItem[] };

// Grouped so each bucket is intuitive: PLAY = the games, DAO = governance +
// treasury + members, COLLECTION = the NFTs. Hangout and Profile are their own
// top-level links (single-item groups auto-render as a plain link).
export const NAV_GROUPS: NavGroup[] = [
  {
    label: 'PLAY',
    accent: 'var(--color-purple)',
    items: [
      { href: '/sanctuary', label: 'Sanctuary', icon: '🪐', desc: 'Raise your companion', accent: 'var(--color-feature-sanctuary)' },
      { href: '/casino', label: 'Cosmic Casino', icon: '🎰', desc: 'Provably-fair games', accent: 'var(--color-feature-casino)' },
      { href: '/raffle', label: 'Cosmic Raffle', icon: '🎟️', desc: 'Holder-tier raffles', accent: 'var(--color-feature-raffle)' },
      { href: '/starforge', label: 'Star Forge', icon: '🔨', desc: 'Forge the grid', accent: 'var(--color-feature-forge)', dev: true },
    ],
  },
  {
    label: 'DAO',
    accent: 'var(--color-gold)',
    items: [
      { href: '/dao', label: 'The Order', icon: '⭐', desc: 'Governance & voting', accent: 'var(--color-feature-dao)' },
      { href: '/treasury', label: 'Treasury', icon: '💎', desc: 'DAO holdings on-chain', accent: 'var(--color-green)' },
      { href: '/members', label: 'Members', icon: '🛡️', desc: 'Star holder directory', accent: 'var(--color-cyan)' },
    ],
  },
  {
    label: 'GALLERY',
    accent: 'var(--color-feature-gallery)',
    items: [{ href: '/gallery', label: 'Gallery', icon: '🖼️', desc: 'All 333 Star Skrumpeys', accent: 'var(--color-feature-gallery)' }],
  },
  {
    label: 'HANGOUT',
    accent: 'var(--color-feature-hangout)',
    items: [{ href: '/hangout', label: 'Hangout', icon: '💬', desc: 'Community lobby & chat', accent: 'var(--color-feature-hangout)' }],
  },
  {
    label: 'PROFILE',
    accent: 'var(--color-gold)',
    items: [{ href: '/profile', label: 'Profile', icon: '👤', desc: 'Your stats & socials', accent: 'var(--color-gold)' }],
  },
];

const visibleItems = (g: NavGroup, isProd: boolean) => g.items.filter((i) => !i.dev || !isProd);

function NavLinkRow({ item, onNavigate }: { item: NavItem; onNavigate?: () => void }) {
  return (
    <Link href={item.href} className={styles.item} onClick={onNavigate} style={{ ['--ic' as string]: item.accent }}>
      <span className={styles.itemIcon}>{item.icon}</span>
      <span className={styles.itemText}>
        <span className={styles.itemLabel}>{item.label}</span>
        <span className={styles.itemDesc}>{item.desc}</span>
      </span>
    </Link>
  );
}

/** Desktop: one hover/click dropdown per group. */
export function DesktopNav({ isProd }: { isProd: boolean }) {
  const [open, setOpen] = useState<string | null>(null);
  const navRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(null);
    const onDown = (e: MouseEvent) => {
      if (navRef.current && !navRef.current.contains(e.target as Node)) setOpen(null);
    };
    window.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDown);
    };
  }, []);

  return (
    <nav ref={navRef} className={styles.desktop} aria-label="Primary">
      {NAV_GROUPS.map((g) => {
        const items = visibleItems(g, isProd);
        if (!items.length) return null;
        // Single-item groups render as a plain top-level link (no dropdown).
        if (items.length === 1) {
          return (
            <Link key={g.label} href={items[0].href} className={styles.trigger} style={{ ['--gc' as string]: g.accent }}>
              {g.label}
            </Link>
          );
        }
        const isOpen = open === g.label;
        return (
          <div
            key={g.label}
            className={styles.group}
            onMouseEnter={() => setOpen(g.label)}
            onMouseLeave={() => setOpen((o) => (o === g.label ? null : o))}
          >
            <button
              type="button"
              className={styles.trigger}
              style={{ ['--gc' as string]: g.accent }}
              aria-expanded={isOpen}
              aria-haspopup="menu"
              onClick={() => setOpen((o) => (o === g.label ? null : g.label))}
            >
              {g.label}
              <span className={`${styles.caret} ${isOpen ? styles.caretOpen : ''}`}>▾</span>
            </button>
            <div className={`${styles.panel} ${isOpen ? styles.panelOpen : ''}`} role="menu" style={{ ['--gc' as string]: g.accent }}>
              {items.map((it) => (
                <NavLinkRow key={it.href} item={it} onNavigate={() => setOpen(null)} />
              ))}
            </div>
          </div>
        );
      })}
    </nav>
  );
}

/** Mobile: grouped sections inside the sheet. */
export function MobileNav({ isProd, onNavigate }: { isProd: boolean; onNavigate: () => void }) {
  return (
    <nav className={styles.mobile} aria-label="Primary">
      {NAV_GROUPS.map((g) => {
        const items = visibleItems(g, isProd);
        if (!items.length) return null;
        return (
          <div key={g.label} className={styles.mobileGroup}>
            {items.length > 1 && (
              <h3 className={styles.mobileGroupTitle} style={{ color: g.accent }}>
                {g.label}
              </h3>
            )}
            {items.map((it) => (
              <NavLinkRow key={it.href} item={it} onNavigate={onNavigate} />
            ))}
          </div>
        );
      })}
    </nav>
  );
}
