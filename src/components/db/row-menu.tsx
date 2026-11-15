'use client'

import { Copy, Maximize2, MoreHorizontal, Trash2 } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useDb } from '@/components/db/db-context'
import type { DbRow } from '@/lib/db-types'
import { cn } from '@/lib/utils'

/** "…" menu of a row: open, duplicate, delete. */
export function RowMenu({ row, className }: { row: DbRow; className?: string }) {
  const { ws, openRow } = useDb()
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          className={cn(
            'flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground',
            className
          )}
          aria-label={`Opciones de ${row.title || 'la fila'}`}
        >
          <MoreHorizontal className="h-4 w-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-44" onClick={(e) => e.stopPropagation()}>
        <DropdownMenuItem onClick={() => openRow(row.id)} className="cursor-pointer gap-2 text-sm">
          <Maximize2 className="h-3.5 w-3.5" />
          Abrir
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => ws.duplicateRow(row.id)} className="cursor-pointer gap-2 text-sm">
          <Copy className="h-3.5 w-3.5" />
          Duplicar
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => {
            if (window.confirm(`¿Eliminar "${row.title || 'Sin título'}"?`)) ws.deleteRow(row.id)
          }}
          className="cursor-pointer gap-2 text-sm text-destructive focus:text-destructive"
        >
          <Trash2 className="h-3.5 w-3.5" />
          Eliminar
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** Inline title editor used by table rows and new rows. */
export function TitleInput({
  row,
  autoFocus,
  onDone,
  className,
}: {
  row: DbRow
  autoFocus?: boolean
  onDone: () => void
  className?: string
}) {
  const { ws } = useDb()
  return (
    <input
      autoFocus={autoFocus}
      defaultValue={row.title}
      onClick={(e) => e.stopPropagation()}
      onBlur={(e) => {
        const v = e.target.value
        if (v !== row.title) ws.updateRowMeta(row.id, { title: v })
        onDone()
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === 'Escape') (e.target as HTMLInputElement).blur()
      }}
      placeholder="Sin título"
      className={cn('h-full w-full min-w-0 bg-transparent text-sm font-medium outline-none', className)}
    />
  )
}
