'use client'

import { FileText, X } from 'lucide-react'
import type { OptionColor, SelectOption } from '@/lib/db-types'
import { cn } from '@/lib/utils'

export function OptionChip({
  option,
  onRemove,
  className,
}: {
  option: Pick<SelectOption, 'name' | 'color'>
  onRemove?: () => void
  className?: string
}) {
  return (
    <span
      data-opt-color={option.color}
      className={cn(
        'inline-flex max-w-full items-center gap-0.5 truncate rounded px-1.5 py-px text-xs leading-5',
        className
      )}
    >
      <span className="truncate">{option.name}</span>
      {onRemove && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onRemove()
          }}
          className="-mr-0.5 rounded-sm opacity-60 hover:opacity-100"
          aria-label={`Quitar ${option.name}`}
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </span>
  )
}

export function ColorDot({ color, className }: { color: OptionColor; className?: string }) {
  return <span data-opt-color={color} className={cn('inline-block h-3.5 w-3.5 shrink-0 rounded', className)} />
}

/** Chip for a related row (relation / backlink). */
export function RowChip({
  title,
  icon,
  onClick,
  onRemove,
}: {
  title: string
  icon: string | null
  onClick?: () => void
  onRemove?: () => void
}) {
  return (
    <span className="inline-flex max-w-full items-center gap-1 rounded px-1 py-px text-xs leading-5 underline decoration-muted-foreground/40 underline-offset-2 hover:bg-accent">
      <button
        type="button"
        onClick={(e) => {
          if (!onClick) return
          e.stopPropagation()
          onClick()
        }}
        className="inline-flex min-w-0 items-center gap-1"
      >
        <span className="shrink-0 text-[11px] no-underline">
          {icon || <FileText className="h-3 w-3 text-muted-foreground" />}
        </span>
        <span className="truncate">{title || 'Sin título'}</span>
      </button>
      {onRemove && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onRemove()
          }}
          className="rounded-sm opacity-60 hover:opacity-100"
          aria-label={`Quitar ${title}`}
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </span>
  )
}

export function Avatar({ label, className }: { label: string; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-semibold text-foreground',
        className
      )}
      aria-hidden="true"
    >
      {label.trim().charAt(0).toUpperCase() || '?'}
    </span>
  )
}

export function ProgressBar({ ratio, label }: { ratio: number; label: string }) {
  return (
    <span className="flex w-full min-w-0 items-center gap-2">
      <span className="h-1.5 min-w-10 flex-1 overflow-hidden rounded-full bg-muted">
        <span
          className="block h-full rounded-full bg-[#2383e2]"
          style={{ width: `${Math.round(ratio * 100)}%` }}
        />
      </span>
      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{label}</span>
    </span>
  )
}
