// Raffle tier visual styles — shared by RaffleContent + RaffleOverlays.
export const TIER_STYLES: Record<string, { color: string; bgColor: string; borderColor: string; glow: string }> = {
  cosmic_emperor: {
    color: '#ffd700',
    bgColor: 'rgba(255, 215, 0, 0.15)',
    borderColor: '#ffd700',
    glow: '0 0 20px rgba(255, 215, 0, 0.4)',
  },
  star_lord: {
    color: '#ff00ff',
    bgColor: 'rgba(255, 0, 255, 0.15)',
    borderColor: '#ff00ff',
    glow: '0 0 20px rgba(255, 0, 255, 0.4)',
  },
  cosmic_warden: {
    color: '#00ffff',
    bgColor: 'rgba(0, 255, 255, 0.15)',
    borderColor: '#00ffff',
    glow: '0 0 20px rgba(0, 255, 255, 0.4)',
  },
  star_forged: {
    color: '#9966ff',
    bgColor: 'rgba(153, 102, 255, 0.15)',
    borderColor: '#9966ff',
    glow: '0 0 20px rgba(153, 102, 255, 0.4)',
  },
  skrumpey_holder: {
    color: '#44ff88',
    bgColor: 'rgba(68, 255, 136, 0.15)',
    borderColor: '#44ff88',
    glow: '0 0 20px rgba(68, 255, 136, 0.4)',
  },
};
