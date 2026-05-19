import { supabase } from './supabase'

export function pairKey(a: string, b: string) {
  return [a, b].sort().join('::')
}

export async function dismissPair(a: string, b: string): Promise<void> {
  await supabase
    .from('dismissed_duplikate')
    .upsert({ pair_key: pairKey(a, b) }, { onConflict: 'pair_key' })
}

export async function getDismissedKeys(): Promise<Set<string>> {
  const { data } = await supabase.from('dismissed_duplikate').select('pair_key')
  return new Set((data ?? []).map((r: any) => r.pair_key as string))
}
