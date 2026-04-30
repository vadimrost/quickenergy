import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface Column<T> {
  key: string
  header: string
  render: (row: T) => ReactNode
  align?: 'left' | 'right' | 'center'
  width?: string
}

interface DataTableProps<T> {
  columns: Column<T>[]
  data: T[]
  getRowKey: (row: T) => string
  zebra?: boolean
  className?: string
  emptyState?: ReactNode
}

export function DataTable<T>({
  columns,
  data,
  getRowKey,
  zebra = false,
  className,
  emptyState,
}: DataTableProps<T>) {
  return (
    <div className={cn('overflow-auto', className)}>
      <table className="w-full">
        <thead className="sticky top-0 bg-bg-surface z-10">
          <tr>
            {columns.map((col) => (
              <th
                key={col.key}
                style={{ width: col.width }}
                className={cn(
                  'label-caps pb-3 border-b border-border/50 text-left font-normal',
                  col.align === 'right' && 'text-right',
                  col.align === 'center' && 'text-center'
                )}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.length === 0 && emptyState ? (
            <tr>
              <td colSpan={columns.length}>{emptyState}</td>
            </tr>
          ) : (
            data.map((row, idx) => (
              <tr
                key={getRowKey(row)}
                className={cn(
                  'h-14 border-b border-border/50 last:border-0 hover:bg-bg-hover transition-colors',
                  zebra && idx % 2 === 1 && 'bg-bg-muted/30'
                )}
              >
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={cn(
                      'text-sm text-ink py-2',
                      col.align === 'right' && 'text-right',
                      col.align === 'center' && 'text-center'
                    )}
                  >
                    {col.render(row)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}
