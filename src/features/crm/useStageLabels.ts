import { useState } from 'react'
import { LEAD_STATUS_LABELS } from './useLeads'
import type { LeadStatus } from '@/types/database'

const STORAGE_KEY = 'crm_stage_labels'

function load(): Record<LeadStatus, string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? { ...LEAD_STATUS_LABELS, ...JSON.parse(raw) } : { ...LEAD_STATUS_LABELS }
  } catch {
    return { ...LEAD_STATUS_LABELS }
  }
}

export function useStageLabels() {
  const [labels, setLabels] = useState<Record<LeadStatus, string>>(load)

  function updateLabel(status: LeadStatus, label: string) {
    const trimmed = label.trim()
    if (!trimmed) return
    const next = { ...labels, [status]: trimmed }
    setLabels(next)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  }

  return { labels, updateLabel }
}
