import type { Config } from 'tailwindcss'
import animate from 'tailwindcss-animate'

const config: Config = {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: {
          base: '#F7F9FC',
          surface: '#FFFFFF',
          muted: '#F1F5F9',
          hover: '#F8FAFC',
        },
        ink: {
          DEFAULT: '#0F172A',
          muted: '#64748B',
          subtle: '#94A3B8',
          label: '#64748B',
        },
        border: {
          DEFAULT: '#E2E8F0',
          subtle: '#F1F5F9',
        },
        accent: {
          50: '#FDF2F8',
          100: '#FCE7F3',
          200: '#FBCFE8',
          400: '#F472B6',
          500: '#EC4899',
          600: '#DB2777',
          700: '#BE185D',
        },
        status: {
          active: '#10B981',
          warning: '#F59E0B',
          danger: '#EF4444',
          info: '#3B82F6',
          neutral: '#64748B',
        },
        entity: {
          pink: '#EC4899',
          blue: '#3B82F6',
          emerald: '#10B981',
          amber: '#F59E0B',
          red: '#EF4444',
          purple: '#A855F7',
          cyan: '#06B6D4',
          orange: '#F97316',
        },
      },
      fontSize: {
        label: ['11px', { lineHeight: '16px', letterSpacing: '0.06em', fontWeight: '500' }],
        kpi: ['36px', { lineHeight: '44px', letterSpacing: '-0.02em', fontWeight: '400' }],
        'kpi-sm': ['28px', { lineHeight: '36px', letterSpacing: '-0.01em', fontWeight: '400' }],
        'page-title': ['28px', { lineHeight: '36px', letterSpacing: '-0.02em', fontWeight: '600' }],
        'section-title': ['11px', { lineHeight: '16px', letterSpacing: '0.08em', fontWeight: '600' }],
      },
      borderRadius: {
        card: '16px',
        'card-sm': '12px',
        pill: '9999px',
      },
      boxShadow: {
        card: '0 1px 2px 0 rgb(15 23 42 / 0.04), 0 1px 3px 0 rgb(15 23 42 / 0.04)',
        'card-hover': '0 4px 12px -2px rgb(15 23 42 / 0.08)',
      },
    },
  },
  plugins: [animate],
}

export default config
