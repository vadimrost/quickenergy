const KEY = 'qe_dismissed_duplikate'

function pairKey(a: string, b: string) {
  return [a, b].sort().join('::')
}

export function getDismissed(): Set<string> {
  try {
    const raw = localStorage.getItem(KEY)
    return new Set(raw ? JSON.parse(raw) : [])
  } catch { return new Set() }
}

export function dismissPair(a: string, b: string) {
  const set = getDismissed()
  set.add(pairKey(a, b))
  localStorage.setItem(KEY, JSON.stringify([...set]))
}

export function isPairDismissed(a: string, b: string): boolean {
  return getDismissed().has(pairKey(a, b))
}
