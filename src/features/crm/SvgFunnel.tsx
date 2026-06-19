import { useState, useEffect } from 'react'

export interface FunnelStage {
  stage: string
  count: number
}

export function SvgFunnel({
  data,
  labels,
}: {
  data: FunnelStage[]
  labels: Record<string, string>
}) {
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    setProgress(0)
    let rafId: number
    let startTime: number | null = null
    const DURATION = 1100
    function tick(ts: number) {
      if (!startTime) startTime = ts
      const t = Math.min((ts - startTime) / DURATION, 1)
      setProgress(1 - Math.pow(1 - t, 3))
      if (t < 1) rafId = requestAnimationFrame(tick)
    }
    rafId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafId)
  }, [data])

  const W = 560
  const H = 160
  const BOT = 50
  const N = data.length
  const segW = W / N
  const cy = H / 2
  const MAX_H = H * 0.86
  const maxCount = data[0]?.count || 1

  const stageH = data.map(d =>
    Math.max((d.count / maxCount) * MAX_H, d.count > 0 ? 10 : 2) * progress,
  )

  const boundaryH: number[] = Array.from({ length: N + 1 }, (_, i) => {
    if (i === 0) return stageH[0]
    if (i === N) return stageH[N - 1]
    return (stageH[i - 1] + stageH[i]) / 2
  })

  const topPts = boundaryH.map((h, i) => ({ x: i * segW, y: cy - h / 2 }))
  const botPts = boundaryH.map((h, i) => ({ x: i * segW, y: cy + h / 2 }))

  function buildPath(
    topP: { x: number; y: number }[],
    botP: { x: number; y: number }[],
  ): string {
    let d = `M ${topP[0].x},${topP[0].y}`
    for (let i = 1; i < topP.length; i++) {
      const mx = (topP[i - 1].x + topP[i].x) / 2
      d += ` C ${mx},${topP[i - 1].y} ${mx},${topP[i].y} ${topP[i].x},${topP[i].y}`
    }
    d += ` L ${botP[N].x},${botP[N].y}`
    for (let i = N - 1; i >= 0; i--) {
      const mx = (botP[i + 1].x + botP[i].x) / 2
      d += ` C ${mx},${botP[i + 1].y} ${mx},${botP[i].y} ${botP[i].x},${botP[i].y}`
    }
    return d + ' Z'
  }

  const path = buildPath(topPts, botPts)
  const glowPath = buildPath(
    boundaryH.map((h, i) => ({ x: i * segW, y: cy - (h * 1.22) / 2 })),
    boundaryH.map((h, i) => ({ x: i * segW, y: cy + (h * 1.22) / 2 })),
  )
  const midPath = buildPath(
    boundaryH.map((h, i) => ({ x: i * segW, y: cy - (h * 1.1) / 2 })),
    boundaryH.map((h, i) => ({ x: i * segW, y: cy + (h * 1.1) / 2 })),
  )

  const uid = `f${Math.random().toString(36).slice(2, 8)}`

  return (
    <div className="w-full">
      <svg
        viewBox={`0 0 ${W} ${H + BOT}`}
        className="w-full"
        style={{ overflow: 'visible' }}
        aria-hidden
      >
        <defs>
          <linearGradient id={`g-${uid}`} x1="0" y1="0.5" x2="1" y2="0.5" gradientUnits="objectBoundingBox">
            <stop offset="0%"   stopColor="#e879f9" />
            <stop offset="35%"  stopColor="#f97316" />
            <stop offset="75%"  stopColor="#fbbf24" />
            <stop offset="100%" stopColor="#fde68a" />
          </linearGradient>
          <linearGradient id={`gl-${uid}`} x1="0" y1="0.5" x2="1" y2="0.5" gradientUnits="objectBoundingBox">
            <stop offset="0%"   stopColor="#f0abfc" stopOpacity="0.55" />
            <stop offset="40%"  stopColor="#fed7aa" stopOpacity="0.4"  />
            <stop offset="100%" stopColor="#fef9c3" stopOpacity="0.2"  />
          </linearGradient>
          <filter id={`bo-${uid}`} x="-20%" y="-30%" width="140%" height="160%">
            <feGaussianBlur stdDeviation="10" />
          </filter>
          <filter id={`bm-${uid}`} x="-10%" y="-15%" width="120%" height="130%">
            <feGaussianBlur stdDeviation="5" />
          </filter>
        </defs>

        <path d={glowPath} fill={`url(#gl-${uid})`} filter={`url(#bo-${uid})`} />
        <path d={midPath}  fill={`url(#gl-${uid})`} filter={`url(#bm-${uid})`} opacity="0.8" />
        <path d={path}     fill={`url(#g-${uid})`}  opacity="0.92" />

        {Array.from({ length: N - 1 }, (_, i) => (
          <line
            key={i}
            x1={(i + 1) * segW} y1={topPts[i + 1].y}
            x2={(i + 1) * segW} y2={botPts[i + 1].y}
            stroke="white" strokeWidth="1.5" strokeOpacity="0.35"
          />
        ))}

        {data.map((d, i) => {
          const x = (i + 0.5) * segW
          const pct = maxCount > 0 ? Math.round((d.count / maxCount) * 100) : 0
          const visible = progress > 0.4 && d.count > 0
          return (
            <text
              key={d.stage}
              x={x} y={cy + 6}
              textAnchor="middle" fill="white" fontSize="17" fontWeight="700"
              style={{ opacity: visible ? Math.min((progress - 0.4) / 0.35, 1) : 0 }}
            >
              {pct}%
            </text>
          )
        })}

        {data.map((d, i) => {
          const x = (i + 0.5) * segW
          return (
            <g key={`lbl-${d.stage}`}>
              <text x={x} y={H + 20} textAnchor="middle" fill="#94a3b8" fontSize="8.5" fontWeight="700" letterSpacing="0.07em">
                {(labels[d.stage] ?? d.stage).toUpperCase()}
              </text>
              <text x={x} y={H + 38} textAnchor="middle" fill="#475569" fontSize="13" fontWeight="800">
                {d.count}
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}
