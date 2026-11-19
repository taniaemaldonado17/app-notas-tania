'use client'

import { useRef, useState } from 'react'
import { FileText, GripVertical, MessageSquare, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { useDb } from '@/components/db/db-context'
import { PropertyCell } from '@/components/db/property-value'
import { AddPropertyButton, PropertyIcon, PropertyMenu } from '@/components/db/property-menu'
import { RowMenu, TitleInput } from '@/components/db/row-menu'
import { getProperty, TITLE_PROPERTY_ID, type DatabaseDef, type DbRow, type PropertyDef, type ViewDef } from '@/lib/db-types'
import { cn } from '@/lib/utils'

const TITLE_WIDTH = 280
const MIN_WIDTH = 70
const MAX_WIDTH = 900

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
  const { ws, openRow } = useDb()
  const [editingTitle, setEditingTitle] = useState<string | null>(null)
  /** Row being dragged and the index it would land at. */
  const [drag, setDrag] = useState<{ id: string; at: number } | null>(null)
  const rowsRef = useRef<HTMLDivElement>(null)
  /** Width being dragged right now (saved when the mouse is released). */
  const [live, setLive] = useState<{ id: string; w: number } | null>(null)
  const titleProp = getProperty(db, TITLE_PROPERTY_ID) ?? db.properties.find((p) => p.type === 'title')!
  const cols = view.visibleProperties.map((id) => getProperty(db, id)).filter((p): p is PropertyDef => !!p && p.type !== 'title')

  const widthOf = (p: PropertyDef) => {
    if (live?.id === p.id) return live.w
    const saved = view.columnWidths?.[p.id]
    return typeof saved === 'number' ? saved : p.type === 'title' ? TITLE_WIDTH : colWidth(p)
  }
  const titleWidth = widthOf(titleProp)
  const totalWidth = titleWidth + cols.reduce((s, p) => s + widthOf(p), 0) + 48

  function saveWidth(id: string, w: number | null) {
    const views = db.views.map((v) => {
      if (v.id !== view.id) return v
      const columnWidths = { ...(v.columnWidths ?? {}) }
      if (w === null) delete columnWidths[id]
      else columnWidths[id] = w
      return { ...v, columnWidths }
    })
    ws.updateDatabase(db.id, { views })
  }

  function startResize(e: React.PointerEvent, p: PropertyDef) {
    e.preventDefault()
    e.stopPropagation()
    const x0 = e.clientX
    const w0 = widthOf(p)
    let w = w0
    document.body.classList.add('col-resizing')
    const move = (ev: PointerEvent) => {
      w = Math.round(Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, w0 + ev.clientX - x0)))
      setLive({ id: p.id, w })
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      document.body.classList.remove('col-resizing')
      setLive(null)
      if (w !== w0) saveWidth(p.id, w)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  /** Drag a row by its grip to change the manual order. */
  function startRowDrag(e: React.PointerEvent, row: DbRow) {
    if (e.button !== 0) return
    e.preventDefault()
    if (view.sorts.length > 0) {
      toast('Esta vista está ordenada por una columna', { description: 'Quitá el orden (en "Ordenar") para mover filas a mano.' })
      return
    }
    const from = rows.findIndex((r) => r.id === row.id)
    let at = from
    const indexAt = (y: number) => {
      const els = rowsRef.current?.querySelectorAll<HTMLElement>('[data-row-id]') ?? []
      let i = 0
      for (const el of els) {
        const b = el.getBoundingClientRect()
        if (y > b.top + b.height / 2) i++
      }
      return i
    }
    document.body.classList.add('row-dragging')
    setDrag({ id: row.id, at })
    const move = (ev: PointerEvent) => {
      at = indexAt(ev.clientY)
      setDrag({ id: row.id, at })
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      document.body.classList.remove('row-dragging')
      setDrag(null)
      // Dropping on itself or right below itself changes nothing.
      if (at === from || at === from + 1) return
      void ws.moveRow(row.id, rows[at]?.id ?? null)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  /** Drag handle on the right edge of a header cell; double click resets the width. */
  const resizer = (p: PropertyDef) => (
    <span
      role="separator"
      aria-orientation="vertical"
      aria-label={`Ancho de la columna ${p.name}`}
      title="Arrastrá para cambiar el ancho (doble clic: ancho original)"
      onPointerDown={(e) => startResize(e, p)}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => {
        e.stopPropagation()
        saveWidth(p.id, null)
      }}
      className={cn(
        'absolute -right-1 top-0 z-20 h-full w-2 cursor-col-resize touch-none',
        'after:absolute after:inset-y-1 after:left-1/2 after:w-0.5 after:-translate-x-1/2 after:rounded after:bg-primary/70 after:opacity-0 hover:after:opacity-100',
        live?.id === p.id && 'after:opacity-100'
      )}
    />
  )

  return (
    <div className="notion-scroll overflow-x-auto">
      <div style={{ minWidth: totalWidth }} className="text-sm">
        {/* Header */}
        <div className="flex border-y border-border text-xs text-muted-foreground">
          <div className="sticky left-0 z-10 shrink-0 bg-background" style={{ width: titleWidth }}>
            <PropertyMenu db={db} prop={titleProp} view={view}>
              <button type="button" className="flex h-8 w-full items-center gap-1.5 px-2 text-left hover:bg-accent">
                <PropertyIcon type="title" />
                <span className="truncate">{titleProp.name}</span>
              </button>
            </PropertyMenu>
            {resizer(titleProp)}
          </div>
          {cols.map((p) => (
            <div key={p.id} className="relative shrink-0 border-l border-border" style={{ width: widthOf(p) }}>
              <PropertyMenu db={db} prop={p} view={view}>
                <button type="button" className="flex h-8 w-full items-center gap-1.5 px-2 text-left hover:bg-accent">
                  <PropertyIcon type={p.type} />
                  <span className="truncate">{p.name}</span>
                </button>
              </PropertyMenu>
              {resizer(p)}
            </div>
          ))}
          <div className="flex h-8 w-12 shrink-0 items-center justify-center border-l border-border">
            <AddPropertyButton db={db} view={view} />
          </div>
        </div>

        {/* Rows */}
        <div ref={rowsRef}>
        {rows.map((row, i) => (
          <div
            key={row.id}
            data-row-id={row.id}
            className={cn(
              'group relative flex min-h-9 border-b border-border hover:bg-accent/30',
              drag?.id === row.id && 'opacity-50'
            )}
          >
            {drag && drag.at === i && <div className="pointer-events-none absolute inset-x-0 -top-px z-30 h-0.5 bg-primary" />}
            {drag && drag.at === rows.length && i === rows.length - 1 && (
              <div className="pointer-events-none absolute inset-x-0 -bottom-px z-30 h-0.5 bg-primary" />
            )}
            <div style={{ width: titleWidth }} className="sticky left-0 z-10 flex shrink-0 items-center gap-1 bg-background pl-0.5 pr-2 group-hover:bg-[color-mix(in_srgb,var(--accent)_30%,var(--background))]">
              <span
                role="button"
                aria-label="Arrastrar para mover la fila"
                title="Arrastrá para mover la fila"
                onPointerDown={(e) => startRowDrag(e, row)}
                className="flex h-6 w-4 shrink-0 cursor-grab touch-none items-center justify-center rounded text-muted-foreground opacity-0 hover:bg-accent active:cursor-grabbing group-hover:opacity-100"
              >
                <GripVertical className="h-3.5 w-3.5" />
              </span>
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
              <div key={p.id} style={{ width: widthOf(p) }} className="flex shrink-0 items-stretch border-l border-border">
                <PropertyCell db={db} row={row} prop={p} variant="table" />
              </div>
            ))}
            <div className="w-12 shrink-0 border-l border-border" />
          </div>
        ))}
        </div>

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
