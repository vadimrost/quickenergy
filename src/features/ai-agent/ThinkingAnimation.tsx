import { useState, useEffect } from 'react'
import { Zap } from 'lucide-react'

const PHRASES = [
  'Netz fließt…',
  'Wechselrichter läuft…',
  'kWh werden gezählt…',
  'MPP wird gesucht…',
  'Einspeisung läuft…',
  'Ertrag wird berechnet…',
  'Strings werden geprüft…',
  'Wirkungsgrad optimiert…',
  'Peak Power gemessen…',
  'Zähler dreht sich…',
  'Förderantrag wird geprüft…',
  'Sonnenstunden werden analysiert…',
  'Batterie wird geladen…',
  'Einspeisevergütung berechnet…',
]

export function ThinkingAnimation() {
  const [idx, setIdx] = useState(() => Math.floor(Math.random() * PHRASES.length))
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    const timer = setInterval(() => {
      setVisible(false)
      setTimeout(() => {
        setIdx(i => (i + 1) % PHRASES.length)
        setVisible(true)
      }, 300)
    }, 2200)
    return () => clearInterval(timer)
  }, [])

  return (
    <div className="flex items-center gap-2 py-0.5">
      <Zap
        size={11}
        className="text-indigo-400 shrink-0 animate-pulse"
      />
      <span
        className="text-sm text-slate-500 whitespace-nowrap"
        style={{ opacity: visible ? 1 : 0, transition: 'opacity 0.3s ease' }}
      >
        {PHRASES[idx]}
      </span>
    </div>
  )
}
