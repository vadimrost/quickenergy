import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs))

export const formatEuro = (value: number): string => {
  if (value === 0) return '€ 0K'
  const abs = Math.abs(value)
  const sign = value < 0 ? '-' : ''
  if (abs >= 1_000_000) return `${sign}€ ${(abs / 1_000_000).toFixed(2)}M`
  if (abs >= 1_000) return `${sign}€ ${Math.round(abs / 1_000)}K`
  return `${sign}€ ${abs.toFixed(0)}`
}

export const formatPercent = (value: number): string => `${Math.round(value)}%`

export const formatDate = (d: Date | string): string => {
  const date = typeof d === 'string' ? new Date(d) : d
  return date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

const ENTITY_COLORS = ['#EC4899', '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#A855F7', '#06B6D4', '#F97316']

export const entityColor = (id: string): string => {
  let hash = 0
  for (let i = 0; i < id.length; i++) hash = (hash << 5) - hash + id.charCodeAt(i)
  return ENTITY_COLORS[Math.abs(hash) % ENTITY_COLORS.length]
}
