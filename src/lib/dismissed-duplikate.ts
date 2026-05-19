import { supabase } from './supabase'

const LS_KEY = 'qe_dismissed_duplikate'

export function pairKey(a: string, b: string) {
  return [a, b].sort().join('::')
}

function lsGet(): Set<string> {
  try {
    const raw = localStorage.getItem(LS_KEY)
    return new Set(raw ? JSON.parse(raw) : [])
  } catch { return new Set() }
}

function lsAdd(key: string) {
  const set = lsGet()
  set.add(key)
  localStorage.setItem(LS_KEY, JSON.stringify([...set]))
}

export async function dismissPair(a: string, b: string): Promise<void> {
  const key = pairKey(a, b)
  lsAdd(key) // immer lokal speichern als Fallback
  const { error } = await supabase
    .from('dismissed_duplikate')
    .upsert({ pair_key: key }, { onConflict: 'pair_key' })
  if (error) console.warn('dismissed_duplikate Tabelle fehlt noch:', error.message)
}

export async function getDismissedKeys(): Promise<Set<string>> {
  const { data, error } = await supabase.from('dismissed_duplikate').select('pair_key')
  if (error || !data) {
    // Tabelle existiert noch nicht → localStorage als Fallback
    return lsGet()
  }
  const dbKeys = new Set(data.map((r: any) => r.pair_key as string))
  // Merge mit localStorage (falls Einträge noch nicht migriert)
  lsGet().forEach(k => dbKeys.add(k))
  return dbKeys
}
