export const COLORS = {
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
  entity: ['#EC4899', '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#A855F7', '#06B6D4', '#F97316'],
  ink: {
    DEFAULT: '#0F172A',
    muted: '#64748B',
    subtle: '#94A3B8',
  },
  border: {
    DEFAULT: '#E2E8F0',
    subtle: '#F1F5F9',
  },
} as const

export const CHART_DEFAULTS = {
  primaryColor: '#EC4899',
  secondaryColor: '#0F172A',
  gridColor: '#F1F5F9',
  axisColor: '#94A3B8',
  axisFontSize: 11,
  barRadius: [4, 4, 0, 0] as [number, number, number, number],
  barWidth: 22,
  compactHeight: 280,
  featuredHeight: 340,
} as const
