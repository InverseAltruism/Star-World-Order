'use client';

import { useEffect, useState } from 'react';
import { Button } from './Button';

const ORDER = ['full', 'low', 'off'] as const;
type Mode = (typeof ORDER)[number];
const LABEL: Record<Mode, string> = { full: 'CRT: FULL', low: 'CRT: LOW', off: 'CRT: OFF' };

/**
 * Cycles the global CRT effect intensity (full → low → off) by setting
 * <html data-crt> and persisting to localStorage. CSS in globals.css (A5)
 * does the rest; prefers-reduced-motion still hard-disables the flicker.
 */
export default function CrtToggle({ className }: { className?: string }) {
  const [mode, setMode] = useState<Mode>('full');

  useEffect(() => {
    const v = document.documentElement.dataset.crt as Mode | undefined;
    if (v && (ORDER as readonly string[]).includes(v)) setMode(v);
  }, []);

  const cycle = () => {
    const next = ORDER[(ORDER.indexOf(mode) + 1) % ORDER.length];
    setMode(next);
    document.documentElement.dataset.crt = next;
    try {
      localStorage.setItem('swo-crt', next);
    } catch {
      /* ignore */
    }
  };

  return (
    <Button variant="ghost" size="sm" onClick={cycle} className={className} aria-label="Toggle CRT effects">
      {LABEL[mode]}
    </Button>
  );
}
