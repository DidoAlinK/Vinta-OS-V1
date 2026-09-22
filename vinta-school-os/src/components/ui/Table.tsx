import { type ReactNode } from 'react'
import { cn } from '../../lib/cn'

/* ─── Column definition ─── */

export interface Column<T> {
  /** Object key or unique accessor string */
  key: string
  /** Header label text */
  label: string
  /** Custom cell renderer — falls back to item[key] */
  render?: (item: T) => ReactNode
  /** Extra classes applied to the header + cell */
  className?: string
}

/* ─── Props ─── */

export interface TableProps<T> {
  columns: Column<T>[]
  data: T[]
  /** Called when a row is clicked */
  onRowClick?: (item: T) => void
  /** Shown when data is empty */
  emptyMessage?: string
}

/* ─── Component ─── */

export function Table<T extends Record<string, unknown>>({
  columns,
  data,
  onRowClick,
  emptyMessage = 'No data to display',
}: TableProps<T>) {
  return (
    <div
      className={cn(
        'rounded-[var(--radius-lg)] border border-[var(--glass-border)]',
        'bg-[var(--glass)] backdrop-blur-[22px] backdrop-saturate-[180%]',
        'shadow-[var(--glass-shadow)]',
        'overflow-hidden',
      )}
    >
      {/* Horizontal scroll wrapper for mobile */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          {/* Header */}
          <thead>
            <tr className="border-b border-[var(--glass-border)]">
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={cn(
                    'px-4 py-3 text-left',
                    'text-[11px] font-semibold text-[var(--muted)] uppercase tracking-wider',
                    col.className,
                  )}
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>

          {/* Body */}
          <tbody>
            {data.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className="px-4 py-12 text-center text-sm text-[var(--muted)]"
                >
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              data.map((item, idx) => (
                <tr
                  key={idx}
                  onClick={() => onRowClick?.(item)}
                  className={cn(
                    'transition-colors duration-100',
                    onRowClick && 'cursor-pointer hover:bg-[var(--glass)]',
                    idx < data.length - 1 && 'border-b border-[var(--glass-border)]/50',
                  )}
                >
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className={cn(
                        'px-4 py-3 text-[var(--text)]',
                        col.className,
                      )}
                    >
                      {col.render
                        ? col.render(item)
                        : (item[col.key] as ReactNode) ?? '—'}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default Table
