// @vitest-environment happy-dom
//
// Acceptance test for [SWO_CASINO_RESPONSIBLE_GAMING_PAGE] (G4), ported
// from the BB predecessor casino [BB_PHASE3_LEGAL_PAGES] /responsible-gaming suite
// and adapted to the SWO casino test harness (raw `react-dom/client` +
// happy-dom; SWO does not ship @testing-library). Covers:
//   (a) routing entry point + key copy,
//   (b) the three required link/guidance touchpoints (BeGambleAware,
//       in-app self-exclusion channel, session-time-limit guidance),
//   (e) the draft / counsel-review ribbon,
//   (UX) heading hierarchy + safe rel attrs on the external link.

import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import ResponsibleGamingPage, {
  BEGAMBLEAWARE_URL,
  RG_LAST_UPDATED,
  SELF_EXCLUSION_EMAIL,
  SESSION_LIMIT_DEFAULT_MINUTES,
} from '../page';

(
  globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLElement;
let root: Root;

function render(node: React.ReactElement) {
  act(() => {
    root.render(node);
  });
}

function byTestId(id: string): HTMLElement {
  const el = container.querySelector<HTMLElement>(`[data-testid="${id}"]`);
  if (!el) throw new Error(`no element with data-testid="${id}"`);
  return el;
}

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
});

describe('/casino/responsible-gaming — routing + key copy', () => {
  it('renders the page title and key copy', () => {
    render(<ResponsibleGamingPage />);
    expect(byTestId('responsible-gaming-page-title').textContent).toBe(
      'Responsible gaming',
    );
    expect(byTestId('responsible-gaming-page-body').textContent).toMatch(
      /entertainment with a transparent house edge/i,
    );
    expect(
      byTestId('responsible-gaming-last-updated').textContent ?? '',
    ).toContain(RG_LAST_UPDATED);
  });
});

describe('/casino/responsible-gaming — acceptance (b) link/guidance touchpoints', () => {
  it('links BeGambleAware.org as an external resource with safe rel attrs', () => {
    render(<ResponsibleGamingPage />);
    const link = byTestId('responsible-gaming-begambleaware-link');
    expect(link.getAttribute('href')).toBe(BEGAMBLEAWARE_URL);
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel') ?? '').toMatch(/noopener/);
    expect(link.getAttribute('rel') ?? '').toMatch(/noreferrer/);
    expect(link.textContent ?? '').toMatch(/begambleaware/i);
  });

  it('exposes the in-app self-exclusion channel as a mailto', () => {
    render(<ResponsibleGamingPage />);
    const link = byTestId('responsible-gaming-self-exclusion-link');
    expect(link.getAttribute('href') ?? '').toContain(
      `mailto:${SELF_EXCLUSION_EMAIL}`,
    );
    expect(link.textContent ?? '').toContain(SELF_EXCLUSION_EMAIL);
  });

  it('surfaces the session-time-limit guidance with the explicit minute cap', () => {
    render(<ResponsibleGamingPage />);
    expect(
      byTestId('responsible-gaming-session-limit').textContent ?? '',
    ).toMatch(new RegExp(`${SESSION_LIMIT_DEFAULT_MINUTES} minutes`));
  });
});

describe('/casino/responsible-gaming — draft ribbon (acceptance e)', () => {
  it("surfaces the 'Draft — counsel review pending' ribbon with role=status", () => {
    render(<ResponsibleGamingPage />);
    const ribbon = byTestId('responsible-gaming-draft-ribbon');
    expect(ribbon.getAttribute('role')).toBe('status');
    expect(ribbon.textContent ?? '').toMatch(/draft — counsel review pending/i);
  });
});

describe('/casino/responsible-gaming — accessibility', () => {
  it('uses a single h1 and >=5 h2 sections (heading hierarchy)', () => {
    render(<ResponsibleGamingPage />);
    const h1s = container.querySelectorAll('h1');
    expect(h1s).toHaveLength(1);
    expect(h1s[0]).toBe(byTestId('responsible-gaming-page-title'));

    const h2s = container.querySelectorAll('h2');
    expect(h2s.length).toBeGreaterThanOrEqual(5);
  });

  it('every link is a real <a> with default tab order', () => {
    render(<ResponsibleGamingPage />);
    const linkIds = [
      'responsible-gaming-casino-link',
      'responsible-gaming-begambleaware-link',
      'responsible-gaming-self-exclusion-link',
      'responsible-gaming-terms-link',
    ];
    for (const id of linkIds) {
      const el = byTestId(id);
      expect(el.tagName.toLowerCase()).toBe('a');
      expect(el.getAttribute('href')).toBeTruthy();
      expect(el.getAttribute('tabindex') ?? '0').toBe('0');
    }
  });
});
