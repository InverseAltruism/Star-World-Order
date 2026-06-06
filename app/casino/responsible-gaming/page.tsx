// /casino/responsible-gaming — responsible-gaming notice for the Cosmic
// Casino. Ported from the BB predecessor casino [BB_PHASE3_LEGAL_PAGES]
// `/responsible-gaming` page and re-skinned to the SWO casino theme
// (Tailwind neon instead of the BB `--bb-*` CSS vars). Task:
// [SWO_CASINO_RESPONSIBLE_GAMING_PAGE] (G4).
//
// Acceptance carried over from BB:
//   (b) links to (1) BeGambleAware.org, (2) the in-app self-exclusion
//       request channel (mailto until the wallet-signed flow ships),
//       (3) session-time-limit guidance.
//   (e) the `Draft — counsel review pending` ribbon stays until the
//       operator clears counsel signoff (legal review).

import Link from 'next/link';

export const metadata = {
  title: 'Responsible Gaming | Cosmic Casino',
  description:
    'Cosmic Casino responsible-gaming resources — BeGambleAware, ' +
    'self-exclusion, and session-time-limit guidance. Draft — counsel ' +
    'review pending.',
};

export const RG_LAST_UPDATED = '2026-05-25';
export const SELF_EXCLUSION_EMAIL = 'self-exclusion@starworldorder.com';
export const BEGAMBLEAWARE_URL = 'https://www.begambleaware.org';
export const SESSION_LIMIT_DEFAULT_MINUTES = 60;

export default function ResponsibleGamingPage() {
  return (
    <main
      className="min-h-screen max-w-3xl mx-auto px-5 py-8 flex flex-col gap-4 text-gray-300"
      data-testid="responsible-gaming-page-main"
    >
      <p
        role="status"
        className="m-0 px-3 py-2 rounded-lg text-sm leading-relaxed text-[#ffb86b] bg-[#ffb86b]/15 border border-[#ffb86b]/40"
        data-testid="responsible-gaming-draft-ribbon"
      >
        Draft — counsel review pending. The text below is the operator&apos;s
        first-draft responsible-gaming notice and may change before public
        launch.
      </p>

      <h1
        className="m-0 text-2xl font-bold text-[#ff00ff]"
        data-testid="responsible-gaming-page-title"
      >
        Responsible gaming
      </h1>
      <p
        className="m-0 text-sm text-gray-500"
        data-testid="responsible-gaming-last-updated"
      >
        Last updated {RG_LAST_UPDATED}.
      </p>

      <section aria-labelledby="rg-intro-heading" className="flex flex-col gap-2">
        <h2 id="rg-intro-heading" className="m-0 text-lg font-bold text-[#00ffff]">
          Bet for fun, not for income
        </h2>
        <p
          className="m-0 text-[0.95rem] leading-relaxed"
          data-testid="responsible-gaming-page-body"
        >
          The Cosmic Casino is built to be entertainment with a transparent
          house edge — not a way to make money. Every game discloses its edge,
          every bet uses commit-reveal randomness that is re-derivable on the
          Monad chain, and the resources on this page exist so you can keep
          play in healthy bounds. Return to the{' '}
          <Link
            href="/casino"
            className="text-[#44ff88] underline"
            data-testid="responsible-gaming-casino-link"
          >
            casino lobby
          </Link>{' '}
          any time.
        </p>
      </section>

      <section aria-labelledby="rg-warning-signs-heading" className="flex flex-col gap-2">
        <h2 id="rg-warning-signs-heading" className="m-0 text-lg font-bold text-[#00ffff]">
          Warning signs
        </h2>
        <ul className="m-0 pl-5 flex flex-col gap-2 list-disc" data-testid="rg-warning-signs-list">
          <li className="text-[0.95rem] leading-snug">
            Betting more than you can afford to lose, or betting with money you
            owe.
          </li>
          <li className="text-[0.95rem] leading-snug">
            Chasing losses with bigger bets, or feeling you need to win back
            what you lost.
          </li>
          <li className="text-[0.95rem] leading-snug">
            Hiding play from people you live with, lying about time spent, or
            feeling guilt afterwards.
          </li>
          <li className="text-[0.95rem] leading-snug">
            Play interfering with sleep, work, relationships, or financial
            obligations.
          </li>
        </ul>
      </section>

      <section aria-labelledby="rg-begambleaware-heading" className="flex flex-col gap-2">
        <h2 id="rg-begambleaware-heading" className="m-0 text-lg font-bold text-[#00ffff]">
          Free, confidential help: BeGambleAware
        </h2>
        <p className="m-0 text-[0.95rem] leading-relaxed">
          If gambling is causing harm, free and confidential support is
          available 24/7 from BeGambleAware. They are independent of every
          operator, including this one.
        </p>
        <p className="m-0 text-[0.95rem] leading-relaxed">
          <a
            href={BEGAMBLEAWARE_URL}
            rel="noopener noreferrer"
            target="_blank"
            className="text-[#44ff88] underline"
            data-testid="responsible-gaming-begambleaware-link"
          >
            BeGambleAware.org
          </a>{' '}
          — international helpline directory and live chat.
        </p>
      </section>

      <section aria-labelledby="rg-self-exclusion-heading" className="flex flex-col gap-2">
        <h2 id="rg-self-exclusion-heading" className="m-0 text-lg font-bold text-[#00ffff]">
          Self-exclusion request
        </h2>
        <p className="m-0 text-[0.95rem] leading-relaxed">
          Self-exclusion blocks the front end from accepting bets from your
          wallet for the duration you choose. Because the Cosmic Casino is
          non-custodial, the on-chain contract cannot force-block a wallet — but
          the front end (this site) will refuse to assist further bets, and the
          operator commits to honouring the exclusion across all official Star
          World Order surfaces.
        </p>
        <p className="m-0 text-[0.95rem] leading-relaxed">
          To request self-exclusion, email{' '}
          <a
            href={`mailto:${SELF_EXCLUSION_EMAIL}?subject=Cosmic%20Casino%20self-exclusion%20request`}
            className="text-[#44ff88] underline"
            data-testid="responsible-gaming-self-exclusion-link"
          >
            {SELF_EXCLUSION_EMAIL}
          </a>{' '}
          from any address with the wallet you want excluded and the duration
          (24 hours, 7 days, 30 days, 6 months, permanent). We acknowledge
          within 24 hours.
        </p>
      </section>

      <section aria-labelledby="rg-session-limit-heading" className="flex flex-col gap-2">
        <h2 id="rg-session-limit-heading" className="m-0 text-lg font-bold text-[#00ffff]">
          Session-time-limit guidance
        </h2>
        <p
          className="m-0 text-[0.95rem] leading-relaxed"
          data-testid="responsible-gaming-session-limit"
        >
          A healthy session is bounded. The default guidance is to cap any
          single session at {SESSION_LIMIT_DEFAULT_MINUTES} minutes and step
          away for at least the same length of time before coming back. Use a
          phone timer, set a per-session deposit cap, and stop on a win at least
          as often as you stop on a loss.
        </p>
        <p className="m-0 text-[0.95rem] leading-relaxed">
          A wallet-signed in-app session-limit prompt is on the roadmap; until
          it ships, this guidance plus the self-exclusion channel above are the
          operator-supported tools.
        </p>
      </section>

      <section aria-labelledby="rg-related-heading" className="flex flex-col gap-2">
        <h2 id="rg-related-heading" className="m-0 text-lg font-bold text-[#00ffff]">
          Related
        </h2>
        <p className="m-0 text-[0.95rem] leading-relaxed">
          Eligibility is gated to Star Skrumpey holders and is geo-restricted in
          blocked jurisdictions. Provably-fair details and the current house
          edge are shown on the{' '}
          <Link
            href="/casino"
            className="text-[#44ff88] underline"
            data-testid="responsible-gaming-terms-link"
          >
            Cosmic Casino lobby
          </Link>
          .
        </p>
      </section>
    </main>
  );
}
