import { entityColor } from '@/lib/utils'

interface ProjectColorDotProps {
  id: string
  color?: string
  size?: number
}

export function ProjectColorDot({ id, color, size = 8 }: ProjectColorDotProps) {
  const bg = color ?? entityColor(id)
  return (
    <span
      className="inline-block rounded-full flex-shrink-0"
      style={{ width: size, height: size, backgroundColor: bg }}
    />
  )
}
