'use client'

import { useState } from 'react'
import { FileText, MessageSquare, Plus } from 'lucide-react'
import { useDb } from '@/components/db/db-context'
import { PropertyCell } from '@/components/db/property-value'
import { AddPropertyButton, PropertyIcon, PropertyMenu } from '@/components/db/property-menu'
import { RowMenu, TitleInput } from '@/components/db/row-menu'
import { getProperty, TITLE_PROPERTY_ID, type DatabaseDef, type DbRow, type PropertyDef, type ViewDef } from '@/lib/db-types'
import { cn } from '@/lib/utils'

function colWidth(p: PropertyDef): number {
  switch (p.type) {
    case 'checkbox':
      return 100
    case 'number':
    case 'date':
      return 150
    case 'formula':
      return p.showAs === 'bar' ? 190 : 160
    case 'text':
      return 220
    default:
      return 180
  }
}

export function TableView({
  db,
  view,
  rows,
  onNew,
}: {
  db: DatabaseDef
  view: ViewDef
  rows: DbRow[]
  onNew: () => Promise<DbRow | null>
}) {
  const { openRow } = useDb()
  const [editingTitle, setEditingTitle] = useState<string | null>(null)
  const titleProp = getProperty(db, TITLE_PROPERTY_ID) ?? db.properties.find((p) => p.type === 'title')!
  const cols = view.visibleProperties.map((id) => getProperty(db, id)).filter((p): p is PropertyDef => !!p && p.type !== 'title')
  const totalWidth = 280 + cols.reduce((s, p) => s + colWidth(p), 0) + 48

  return (
    <div className="notion-scroll overflow-x-auto">
      <div style={{ minWidth: totalWidth }} className="text-sm">
        {/* Header */}
        <div className="flex border-y border-border text-xs text-muted-foreground">
          <PropertyMenu db={db} prop={titleProp} view={view}>
            <button type="button" className="sticky left-0 z-10 flex h-8 w-[280px] shrink-0 items-center gap-1.5 bg-background px-2 text-left hover:bg-accent">
              <PropertyIcon type="title" />
              <span className="truncate">{titleProp.name}</span>
            </button>
          </PropertyMenu>
          {cols.map((p) => (
            <PropertyMenu key={p.id} db={db} prop={p} view={view}>
              <button
                type="button"
                style={{ width: colWidth(p) }}
                className="flex h-8 shrink-0 items-center gap-1.5 border-l border-border px-2 text-left hover:bg-accent"
              >
                <PropertyIcon type={p.type} />
                <span className="truncate">{p.name}</span>
              </button>
            </PropertyMenu>
          ))}
          <div className="flex h-8 w-12 shrink-0 items-center justify-center border-l border-border">
            <AddPropertyButton db={db} view={view} />
          </div>
        </div>

        {/* Rows */}
        {rows.map((row) => (
          <div key={row.id} className="group flex min-h-9 border-b border-border hover:bg-accent/30">
            <div className="sticky left-0 z-10 flex w-[280px] shrink-0 items-center gap-1 bg-background px-2 group-hover:bg-[color-mix(in_srgb,var(--accent)_30%,var(--background))]">
              <span className="w-5 shrink-0 text-center text-sm">
                {row.icon || <FileText className="mx-auto h-3.5 w-3.5 text-muted-foreground" />}
              </span>
              {editingTitle === row.id ? (
                <TitleInput row={row} autoFocus onDone={() => setEditingTitle(null)} />
              ) : (
                <button
                  type="button"
                  onClick={() => setEditingTitle(row.id)}
                  className={cn('min-w-0 flex-1 truncate py-1.5 text-left font-medium', !row.title && 'text-muted-foreground')}
                >
                  {row.title || 'Sin título'}
                </button>
              )}
              {!!row.commentCount && (
                <span className="flex shrink-0 items-center gap-0.5 text-[11px] text-muted-foreground" title="Comentarios">
                  <MessageSquare className="h-3 w-3" />
                  {row.commentCount}
                </span>
              )}
              <button
                type="button"
                onClick={() => openRow(row.id)}
                className="shrink-0 rounded border border-border bg-background px-1.5 py-0.5 text-[11px] text-muted-foreground opacity-0 hover:bg-accent hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100"
              >
                Abrir
              </button>
              <RowMenu row={row} className="shrink-0 opacity-0 focus-visible:opacity-100 group-hover:opacity-100" />
            </div>
            {cols.map((p) => (
              <div key={p.id} style={{ width: colWidth(p) }} className="flex shrink-0 items-stretch border-l border-border">
                <PropertyCell db={db} row={row} prop={p} variant="table" />
              </div>
            ))}
            <div className="w-12 shrink-0 border-l border-border" />
          </div>
        ))}

        {/* New row */}
        <button
          type="button"
          onClick={async () => {
            const created = await onNew()
            if (created) setEditingTitle(created.id)
          }}
          className="sticky left-0 flex h-9 items-center gap-1.5 px-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <Plus className="h-4 w-4" />
          Nueva fila
        </button>
        <p className="px-2 pb-1 text-[11px] text-muted-foreground">
          {rows.length} {rows.length === 1 ? 'fila' : 'filas'}
        </p>
      </div>
    </div>
  )
}
