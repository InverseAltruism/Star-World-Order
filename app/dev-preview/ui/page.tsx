'use client';

/**
 * SWO V2 — UI primitives showcase. Lets us screenshot/test every
 * components/ui/* variant on the live test site without a connected wallet.
 * Route: /dev-preview/ui   (not linked anywhere; safe to delete)
 */
import {
  Button,
  Panel,
  Badge,
  StatReadout,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  CrtToggle,
} from '@/components/ui';

const FEATURES = ['sanctuary', 'casino', 'dao', 'raffle', 'forge', 'hangout', 'gallery'] as const;

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4">
      <h2 className="text-xs text-gold tracking-widest" style={{ fontFamily: 'var(--font-display)' }}>
        ◆ {title}
      </h2>
      <div className="pixel-card p-5">{children}</div>
    </section>
  );
}

export default function UIShowcase() {
  return (
    <div className="mx-auto max-w-4xl space-y-10 p-6 pb-24">
      <header className="space-y-2 text-center">
        <h1 className="text-base text-gold tracking-widest" style={{ fontFamily: 'var(--font-display)' }}>
          SWO V2 — UI PRIMITIVES
        </h1>
        <p className="text-fg-muted text-xs" style={{ fontFamily: 'var(--font-console)' }}>
          components/ui/* · tokens + fonts foundation · /dev-preview/ui
        </p>
        <div className="flex justify-center pt-1">
          <CrtToggle />
        </div>
      </header>

      {/* Typography roles */}
      <Section title="Typography roles">
        <div className="space-y-3">
          <p style={{ fontFamily: 'var(--font-display)' }} className="text-gold text-sm">
            DISPLAY — Press Start 2P (titles only)
          </p>
          <p style={{ fontFamily: 'var(--font-ui)' }} className="text-fg text-lg">
            UI — Pixelify Sans, readable at mid sizes for headings and chrome
          </p>
          <p style={{ fontFamily: 'var(--font-console)' }} className="text-fg-muted text-base">
            CONSOLE — VT323 has real lowercase, so paragraphs and the boot log stay legible.
          </p>
          <p style={{ fontFamily: 'var(--font-hud)' }} className="text-cyan text-base tabular-nums">
            HUD — Departure Mono 0123456789 · 1,402 STAR · 88.50 MON
          </p>
        </div>
      </Section>

      {/* Buttons */}
      <Section title="Button">
        <div className="flex flex-wrap items-center gap-4">
          <Button variant="gold">GOLD</Button>
          <Button variant="purple">PURPLE</Button>
          <Button variant="ghost">GHOST</Button>
          <Button variant="danger">DANGER</Button>
          <Button variant="gold" size="sm">SM</Button>
          <Button variant="gold" size="lg">LARGE</Button>
          <Button variant="purple" disabled>
            DISABLED
          </Button>
          <Button variant="ghost" href="/">
            AS LINK →
          </Button>
        </div>
      </Section>

      {/* Badges */}
      <Section title="Badge">
        <div className="flex flex-wrap items-center gap-3">
          <Badge tone="purple">PURPLE</Badge>
          <Badge tone="gold">GOLD</Badge>
          <Badge tone="cyan">CYAN</Badge>
          <Badge tone="green">ONLINE</Badge>
          <Badge tone="magenta">CASINO</Badge>
          <Badge tone="danger">WAGER</Badge>
        </div>
      </Section>

      {/* StatReadout */}
      <Section title="StatReadout (HUD)">
        <div className="grid grid-cols-2 gap-6 sm:grid-cols-4">
          <StatReadout label="Star Holders" value="312" accent="gold" />
          <StatReadout label="STAR Minted" value="1,402" accent="cyan" unit="STAR" />
          <StatReadout label="Companions" value="47" accent="purple" />
          <StatReadout label="Skrumpeys" value="333" accent="green" />
        </div>
      </Section>

      {/* Panels with feature accents */}
      <Section title="Panel — per-feature accents">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          {FEATURES.map((f) => (
            <Panel key={f} accent={f} interactive className="p-4">
              <h3 className="text-[10px] uppercase tracking-wider text-fg" style={{ fontFamily: 'var(--font-ui)' }}>
                {f}
              </h3>
              <p className="mt-2 text-xs text-fg-muted" style={{ fontFamily: 'var(--font-console)' }}>
                token-driven accent glow, no inline hex
              </p>
            </Panel>
          ))}
        </div>
      </Section>

      {/* Tabs */}
      <Section title="Tabs (Radix, accessible)">
        <Tabs defaultValue="governance">
          <TabsList>
            <TabsTrigger value="governance">GOVERNANCE</TabsTrigger>
            <TabsTrigger value="council">STAR COUNCIL</TabsTrigger>
            <TabsTrigger value="members">MEMBERS</TabsTrigger>
            <TabsTrigger value="treasury">TREASURY</TabsTrigger>
          </TabsList>
          <TabsContent value="governance">
            <p className="text-xs text-fg-muted" style={{ fontFamily: 'var(--font-console)' }}>
              Keyboard-navigable tabs (arrow keys), proper ARIA roles, pixel skin. These replace the
              hand-rolled tab rows across DAO / Raffle / Casino.
            </p>
          </TabsContent>
          <TabsContent value="council">
            <p className="text-xs text-fg-muted" style={{ fontFamily: 'var(--font-console)' }}>
              Star Council content.
            </p>
          </TabsContent>
          <TabsContent value="members">
            <p className="text-xs text-fg-muted" style={{ fontFamily: 'var(--font-console)' }}>
              Members content.
            </p>
          </TabsContent>
          <TabsContent value="treasury">
            <p className="text-xs text-fg-muted" style={{ fontFamily: 'var(--font-console)' }}>
              Treasury content.
            </p>
          </TabsContent>
        </Tabs>
      </Section>
    </div>
  );
}
