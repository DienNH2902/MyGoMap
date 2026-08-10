import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Deep warm-black used for the header and hero — the "luxury" anchor color.
        ink: '#140F0C',
        // Core brand orange.
        primary: '#FF6A1A',
        'primary-light': '#FF9142',
        // Warm gold accent used for highlights, active states, and the AI tip banner.
        'accent-gold': '#FFC24B',
        // Warm off-white used for text on dark surfaces.
        cream: '#FFF6EC',
        surface: '#FFFFFF',
        'surface-muted': '#FFF1E2',
      },
      fontFamily: {
        display: ['var(--font-display)', 'sans-serif'],
        mono: ['var(--font-mono)', 'monospace'],
      },
      boxShadow: {
        glow: '0 0 30px rgba(255, 106, 26, 0.35)',
      },
      keyframes: {
        'route-dash': {
          to: { strokeDashoffset: '-200' },
        },
      },
      animation: {
        'route-dash': 'route-dash 6s linear infinite',
      },
    },
  },
  plugins: [],
};

export default config;
