import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        background: 'var(--background)',
        foreground: 'var(--foreground)',
        primary: {
          DEFAULT: '#6366f1',
          dark: '#4f46e5',
        },
        accent: {
          DEFAULT: '#fbbf24',
          dark: '#f59e0b',
        },
      },
    },
  },
  plugins: [],
};
export default config;
