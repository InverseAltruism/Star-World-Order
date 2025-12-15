import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      screens: {
        'xs': '475px',
      },
      colors: {
        background: 'var(--background)',
        foreground: 'var(--foreground)',
        primary: {
          DEFAULT: '#9966ff',
          dark: '#7744dd',
        },
        accent: {
          DEFAULT: '#ffd700',
          dark: '#cc9900',
        },
        pixel: {
          gold: '#ffd700',
          purple: '#9966ff',
          blue: '#4488ff',
          green: '#44ff88',
          red: '#ff4466',
          dark: '#1a1a2e',
          darker: '#0d0d1a',
        },
      },
      fontFamily: {
        pixel: ['"Press Start 2P"', 'monospace'],
      },
      animation: {
        'pixel-float': 'pixelFloat 3s ease-in-out infinite',
        'pixel-pulse': 'pixelPulse 2s ease-in-out infinite',
        'text-flicker': 'textFlicker 4s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
export default config;
