'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Image from 'next/image';
import styles from './LoadingScreen.module.css';

// ── STAR-64 boot sequence (see docs/UI_V2_REDESIGN_PLAN.md §5) ───────────────
// Act 1: click the cartridge → it drops → CRT power-on.
// Act 2: camera pushes in while a full-resolution boot screen cross-fades over
// the top: VT323 BIOS log types out → logo reveal → loading bar → done.

type Phase = 'idle' | 'inserting' | 'powering' | 'zooming' | 'booting' | 'loading' | 'done';

// Timeline (ms from cartridge click) — paced to feel deliberate, not rushed.
const T = {
  INSERTING: 0,
  POWERING: 950,
  ZOOMING: 2100,
  BOOTING: 3150,
  LOGO_UP: 5250, // BIOS log finished → reveal title card
  LOADING: 5700,
  CLOSING: 7900,
  HIDE: 8700,
} as const;

const BOOT_LINES: { text: string; cls?: string }[] = [
  { text: 'STAR-64 BIOS v2.0', cls: styles.ok },
  { text: '(c) cosmic systems — the order' },
  { text: 'detecting cartridge ............ SWO', cls: styles.dim },
  { text: 'memory check 64M ............... OK', cls: styles.ok },
  { text: 'mounting constellation map ..... OK', cls: styles.ok },
  { text: 'loading star ledger ............ OK', cls: styles.ok },
  { text: 'establishing monad link ........ OK', cls: styles.ok },
  { text: 'starting STAR WORLD ORDER ...', cls: styles.dim },
];

const ss = {
  get(k: string) {
    try {
      return typeof window !== 'undefined' ? sessionStorage.getItem(k) : null;
    } catch {
      return null;
    }
  },
  set(k: string, v: string) {
    try {
      sessionStorage.setItem(k, v);
    } catch {
      /* ignore */
    }
  },
};

export default function LoadingScreen() {
  const [show, setShow] = useState(true);
  const [phase, setPhase] = useState<Phase>('idle');
  const [logoUp, setLogoUp] = useState(false);
  const [closing, setClosing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [visibleLines, setVisibleLines] = useState(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const interval = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (ss.get('swo-loading-seen')) setShow(false);
  }, []);

  const clearAll = useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    if (interval.current) clearInterval(interval.current);
    interval.current = null;
  }, []);

  const finish = useCallback(() => {
    clearAll();
    ss.set('swo-loading-seen', 'true');
    setShow(false);
  }, [clearAll]);

  const at = (ms: number, fn: () => void) => timers.current.push(setTimeout(fn, ms));

  const start = useCallback(() => {
    if (phase !== 'idle') return;
    setPhase('inserting');
    at(T.POWERING, () => setPhase('powering'));
    at(T.ZOOMING, () => setPhase('zooming'));
    at(T.BOOTING, () => {
      setPhase('booting');
      // reveal BIOS log lines one by one
      let i = 0;
      interval.current = setInterval(() => {
        i += 1;
        setVisibleLines(i);
        if (i >= BOOT_LINES.length && interval.current) {
          clearInterval(interval.current);
          interval.current = null;
        }
      }, 250);
    });
    at(T.LOGO_UP, () => setLogoUp(true));
    at(T.LOADING, () => {
      setPhase('loading');
      interval.current = setInterval(() => {
        setProgress((p) => {
          if (p >= 100) {
            if (interval.current) clearInterval(interval.current);
            interval.current = null;
            return 100;
          }
          return Math.min(100, p + 4);
        });
      }, 70);
    });
    at(T.CLOSING, () => setClosing(true));
    at(T.HIDE, () => finish());
  }, [phase, finish]);

  useEffect(() => () => clearAll(), [clearAll]);

  if (!show) return null;

  const inAct2 = phase === 'zooming' || phase === 'booting' || phase === 'loading';
  const showTitleCard = phase === 'loading' || logoUp;

  return (
    <div
      className={[styles.root, styles[phase], logoUp ? styles.showLogo : '', closing ? styles.closing : '']
        .filter(Boolean)
        .join(' ')}
      data-phase={phase}
      role="application"
      aria-label="STAR-64 — inserting game cartridge"
    >
      <div className={styles.vignette} aria-hidden />
      <div className={styles.stars} aria-hidden />
      <div className={styles.dust} aria-hidden>
        {[12, 28, 44, 60, 76, 88].map((l, i) => (
          <span key={l} style={{ left: `${l}%`, animationDelay: `${i * 1.4}s` }} />
        ))}
      </div>

      {/* ── ACT 1: hero console ── */}
      <div className={styles.stage}>
        <div className={styles.unit}>
          <div className={styles.tv}>
            <div className={styles.screen}>
              <div className={styles.off} aria-hidden />
              <div className={styles.tube}>
                <Image src="/SWO_Star.png" alt="" width={26} height={26} className={styles.tubeStar} />
              </div>
            </div>
            <div className={styles.plate}>
              <span className={styles.brand}>STAR-64</span>
              <span className={styles.led} />
            </div>
          </div>

          <div className={styles.console}>
            <div className={styles.slot} />
            <span className={styles.consoleBadge}>
              <span>★</span> STAR-64
            </span>
            <div className={styles.vents}>
              <i /> <i /> <i />
            </div>

            <div
              className={styles.cartWrap}
              onClick={phase === 'idle' ? start : undefined}
              onKeyDown={(e) => e.key === 'Enter' && phase === 'idle' && start()}
              role={phase === 'idle' ? 'button' : undefined}
              tabIndex={phase === 'idle' ? 0 : -1}
              aria-label={phase === 'idle' ? 'Insert the game cartridge' : undefined}
            >
              <div className={styles.cart}>
                <div className={styles.cartTop} />
                <div className={styles.cartLabel}>
                  <b>SWO</b>
                  <small>★</small>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── ACT 2: full-res boot screen ── */}
      <div className={styles.bootScreen} aria-hidden={!inAct2}>
        {phase === 'booting' && !showTitleCard && (
          <div className={styles.log}>
            {BOOT_LINES.slice(0, visibleLines).map((line, i) => (
              <div key={i} className={`${styles.logLine} ${styles.show} ${line.cls || ''}`}>
                {line.text}
                {i === visibleLines - 1 && <span className={styles.cursor}>&nbsp;</span>}
              </div>
            ))}
          </div>
        )}

        {showTitleCard && (
          <>
            <div className={styles.logo}>
              <Image src="/SWO_Star.png" alt="Star World Order" width={64} height={64} className={styles.logoStar} />
              <h1 className={styles.title}>STAR WORLD ORDER</h1>
              <p className={styles.subtitle}>✦ chosen by the stars ✦</p>
            </div>
            <div className={styles.barWrap}>
              <div className={styles.barRail}>
                <div className={styles.barFill} style={{ width: `${progress}%` }} />
              </div>
              <div className={styles.barMeta}>
                <span>NOW LOADING</span>
                <span className={styles.pct}>{progress}%</span>
              </div>
            </div>
          </>
        )}
      </div>

      <button className={styles.skip} onClick={finish} aria-label="Skip intro">
        SKIP ▸▸
      </button>

      {phase === 'idle' && (
        <div className={styles.hint}>
          <b>▼</b> click the cartridge to insert <b>▼</b>
          <span className={styles.hintFlavor}>the stars are calling…</span>
        </div>
      )}
    </div>
  );
}
