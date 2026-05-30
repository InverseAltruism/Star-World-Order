import { Button } from '@/components/ui';

// SWO V2 — themed 404. Renders inside the global chrome (SiteChrome) so the
// nav is available to navigate away. See UI_V2_REDESIGN_PLAN §7 (system pages).
export const metadata = { title: 'Signal Lost (404) | Star World Order' };

export default function NotFound() {
  return (
    <main className="min-h-[70vh] flex items-center justify-center px-4 py-16 starfield-bg">
      <div
        className="pixel-card relative w-full max-w-lg overflow-hidden p-10 text-center"
        style={{ ['--panel-accent' as string]: 'var(--color-magenta)' }}
      >
        {/* scanline veil */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-50"
          style={{
            background:
              'repeating-linear-gradient(0deg, rgba(0,0,0,0.18), rgba(0,0,0,0.18) 1px, transparent 1px, transparent 3px)',
          }}
        />
        <p
          className="text-[10px] tracking-[0.3em] text-cyan"
          style={{ fontFamily: 'var(--font-console)', fontSize: '14px' }}
        >
          STAR-64 // SIGNAL LOST
        </p>
        <h1
          className="my-4 text-6xl glitch-text text-gold"
          data-text="404"
          style={{ fontFamily: 'var(--font-display)', textShadow: '0 0 24px rgba(255,215,0,0.55), 4px 4px 0 rgba(0,0,0,0.8)' }}
        >
          404
        </h1>
        <p
          className="mx-auto mb-8 max-w-sm text-fg-muted"
          style={{ fontFamily: 'var(--font-console)', fontSize: '16px' }}
        >
          this cartridge has no data here — the stars drifted out of alignment.
        </p>
        <div className="flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Button variant="gold" href="/">
            ⭐ RETURN TO BASE
          </Button>
          <Button variant="ghost" href="/sanctuary">
            VISIT SANCTUARY →
          </Button>
        </div>
        <div className="mt-6 text-[8px] tracking-widest text-fg-dim" style={{ fontFamily: 'var(--font-display)' }}>
          ◆ ◇ ◆
        </div>
      </div>
    </main>
  );
}
