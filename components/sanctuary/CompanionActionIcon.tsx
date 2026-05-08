// [SWO_V2_COMPANION_INTERACTABLES_POLISH]
// Pixel-art SVG icons for the companion action grid. Replaces the raw
// emoji affordances we shipped pre-RD-Batch-1 — each icon renders at any
// size while staying crisp via shape-rendering=crispEdges. Stroke colors
// are inherited from `currentColor` so variant CSS can re-tint them.

import type { ReactElement, SVGProps } from 'react';
import type { CompanionActionId } from '@/lib/sanctuary/companionAction';

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function PixelSvg({ size = 24, children, ...rest }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      shapeRendering="crispEdges"
      aria-hidden="true"
      role="img"
      {...rest}
    >
      {children}
    </svg>
  );
}

// 16x16 pixel apple — silhouette uses currentColor; bite + leaf use accent.
export function FeedIcon(props: IconProps) {
  return (
    <PixelSvg {...props}>
      <rect x="6" y="2" width="2" height="2" fill="#5fb15a" />
      <rect x="8" y="3" width="2" height="2" fill="#5fb15a" />
      <rect x="7" y="3" width="1" height="1" fill="#3a3a4e" />
      <rect x="4" y="4" width="8" height="2" fill="currentColor" />
      <rect x="3" y="5" width="10" height="1" fill="currentColor" />
      <rect x="3" y="6" width="11" height="6" fill="currentColor" />
      <rect x="4" y="12" width="9" height="1" fill="currentColor" />
      <rect x="5" y="13" width="7" height="1" fill="currentColor" />
      <rect x="6" y="6" width="2" height="2" fill="#fff5e0" opacity="0.55" />
    </PixelSvg>
  );
}

// 16x16 paw print — pad + 3 toe beans, all in currentColor.
export function PetIcon(props: IconProps) {
  return (
    <PixelSvg {...props}>
      {/* Toe beans */}
      <rect x="3" y="4" width="2" height="3" fill="currentColor" />
      <rect x="6" y="2" width="2" height="3" fill="currentColor" />
      <rect x="9" y="2" width="2" height="3" fill="currentColor" />
      <rect x="12" y="4" width="2" height="3" fill="currentColor" />
      {/* Main pad */}
      <rect x="5" y="8" width="6" height="4" fill="currentColor" />
      <rect x="4" y="9" width="8" height="2" fill="currentColor" />
      <rect x="6" y="12" width="4" height="1" fill="currentColor" />
    </PixelSvg>
  );
}

// 16x16 speech bubble.
export function TalkIcon(props: IconProps) {
  return (
    <PixelSvg {...props}>
      <rect x="2" y="3" width="12" height="8" fill="currentColor" />
      <rect x="3" y="2" width="10" height="1" fill="currentColor" />
      <rect x="3" y="11" width="10" height="1" fill="currentColor" />
      <rect x="5" y="11" width="2" height="2" fill="currentColor" />
      <rect x="5" y="13" width="1" height="1" fill="currentColor" />
      {/* dots */}
      <rect x="5" y="6" width="1" height="2" fill="#0a0a15" />
      <rect x="8" y="6" width="1" height="2" fill="#0a0a15" />
      <rect x="11" y="6" width="1" height="2" fill="#0a0a15" />
    </PixelSvg>
  );
}

// 16x16 crescent moon.
export function SleepIcon(props: IconProps) {
  return (
    <PixelSvg {...props}>
      <rect x="6" y="2" width="6" height="2" fill="currentColor" />
      <rect x="4" y="3" width="2" height="2" fill="currentColor" />
      <rect x="3" y="5" width="2" height="6" fill="currentColor" />
      <rect x="4" y="11" width="2" height="2" fill="currentColor" />
      <rect x="6" y="13" width="6" height="1" fill="currentColor" />
      {/* Cut-out for crescent shape */}
      <rect x="7" y="4" width="6" height="2" fill="#0a0a15" />
      <rect x="6" y="6" width="6" height="6" fill="#0a0a15" />
      <rect x="7" y="12" width="5" height="1" fill="#0a0a15" />
      {/* zZz mark */}
      <rect x="11" y="3" width="2" height="1" fill="#88ccff" />
      <rect x="12" y="4" width="1" height="1" fill="#88ccff" />
      <rect x="11" y="5" width="2" height="1" fill="#88ccff" />
    </PixelSvg>
  );
}

// 16x16 pixel ball — concentric panels suggesting a baseball/play orb.
export function PlayIcon(props: IconProps) {
  return (
    <PixelSvg {...props}>
      <rect x="5" y="2" width="6" height="1" fill="currentColor" />
      <rect x="3" y="3" width="10" height="1" fill="currentColor" />
      <rect x="2" y="4" width="12" height="8" fill="currentColor" />
      <rect x="3" y="12" width="10" height="1" fill="currentColor" />
      <rect x="5" y="13" width="6" height="1" fill="currentColor" />
      {/* seams */}
      <rect x="4" y="5" width="1" height="6" fill="#0a0a15" opacity="0.7" />
      <rect x="11" y="5" width="1" height="6" fill="#0a0a15" opacity="0.7" />
      <rect x="6" y="4" width="1" height="1" fill="#0a0a15" opacity="0.5" />
      <rect x="9" y="4" width="1" height="1" fill="#0a0a15" opacity="0.5" />
      <rect x="6" y="11" width="1" height="1" fill="#0a0a15" opacity="0.5" />
      <rect x="9" y="11" width="1" height="1" fill="#0a0a15" opacity="0.5" />
    </PixelSvg>
  );
}

// 16x16 hourglass — used for the "pressed/working" state instead of ⏳.
export function WorkingIcon(props: IconProps) {
  return (
    <PixelSvg {...props}>
      <rect x="3" y="2" width="10" height="1" fill="currentColor" />
      <rect x="3" y="13" width="10" height="1" fill="currentColor" />
      <rect x="4" y="3" width="8" height="1" fill="currentColor" />
      <rect x="5" y="4" width="6" height="1" fill="currentColor" />
      <rect x="6" y="5" width="4" height="1" fill="currentColor" />
      <rect x="7" y="6" width="2" height="2" fill="currentColor" />
      <rect x="6" y="8" width="4" height="1" fill="currentColor" />
      <rect x="5" y="9" width="6" height="1" fill="currentColor" />
      <rect x="4" y="10" width="8" height="1" fill="currentColor" />
      <rect x="3" y="11" width="10" height="2" fill="currentColor" />
    </PixelSvg>
  );
}

const ICON_BY_ACTION: Record<CompanionActionId, (p: IconProps) => ReactElement> = {
  feed: FeedIcon,
  pet: PetIcon,
  talk: TalkIcon,
  sleep: SleepIcon,
  play: PlayIcon,
};

export function CompanionActionIcon({
  action,
  working,
  size = 24,
  ...rest
}: IconProps & { action: CompanionActionId; working?: boolean }) {
  const Icon = working ? WorkingIcon : ICON_BY_ACTION[action];
  return <Icon size={size} {...rest} />;
}
