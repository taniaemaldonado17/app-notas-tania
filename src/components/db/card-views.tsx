'use client'

import { useMemo, useState } from 'react'
import {
  DndContext,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import { ChevronLeft, ChevronRight, FileText, MessageSquare, Plus } from 'lucide-react'
import { personLabel, useDb } from '@/components/db/db-context'
import { OptionChip, Avatar } from '@/components/db/chips'
import { PropertyDisplay } from '@/components/db/property-value'
import { RowMenu } from '@/components/db/row-menu'
import { resolveValue } from '@/lib/db-resolve'
import {
  getProperty,
  imageSrcFromLink,
  todayISO,
  type DatabaseDef,
  type DbRow,
  type PropertyDef,
  type RowValue,
  type ViewDef,
} from '@/lib/db-types'
import { cn } from '@/lib/utils'

/* ------------------------------------------------------------------ */
/* Shared card                                                          */
/* ------------------------------------------------------------------ */

function visibleProps(db: DatabaseDef, view: ViewDef): PropertyDef[] {
  return view.visibleProperties
    .map((id) => getProperty(db, id))
    .filter((p): p is PropertyDef => !!p && p.type !== 'title' && p.id !== view.coverProperty)
}

function hasDisplayValue(row: DbRow, prop: PropertyDef): boolean {
  if (prop.type === 'formula' || prop.type === 'backlink' || prop.type === 'created_time' || prop.type === 'updated_time') return true
  const v = row.values[prop.id]
  if (v === undefined || v === null || v === '' || v === false) return false
  return !(Array.isArray(v) && v.length === 0)
}

function CardCover({ src, icon }: { src: string | null; icon: string | null }) {
  // Remember which src failed so a broken link shows the icon instead of a broken image.
  const [failed, setFailed] = useState<string | null>(null)
  return (
    <div className="h-32 w-full bg-muted/60">
      {src && failed !== src ? (
        <img
          src={src}
          alt=""
          className="h-full w-full object-cover"
          draggable={false}
          referrerPolicy="no-referrer"
          onError={() => setFailed(src)}
        />
      ) : (
        <div className="flex h-full items-center justify-center text-3xl opacity-50">{icon || '📄'}</div>
      )}
    </div>
  )
}

function RowCard({
  db,
  view,
  row,
  cover,
  dragging,
}: {
  db: DatabaseDef
  view: ViewDef
  row: DbRow
  cover?: boolean
  dragging?: boolean
}) {
  const { openRow } = useDb()
  const props = visibleProps(db, view).filter((p) => hasDisplayValue(row, p))
  const coverUrl = cover && view.coverProperty ? row.values[view.coverProperty] : null

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => openRow(row.id)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') openRow(row.id)
      }}
      className={cn(
        'group relative w-full cursor-pointer overflow-hidden rounded-lg border border-border bg-card text-left shadow-sm transition hover:bg-accent/40',
        dragging && 'opacity-60 shadow-lg'
      )}
    >
      {cover && <CardCover src={imageSrcFromLink(coverUrl)} icon={row.icon} />}
      <div className="space-y-1.5 p-2.5">
        <div className="flex items-start gap-1.5 pr-6">
          {row.icon && <span className="shrink-0 text-sm leading-5">{row.icon}</span>}
          <span className={cn('min-w-0 flex-1 text-sm font-medium leading-5', !row.title && 'text-muted-foreground')}>
            {row.title || 'Sin título'}
          </span>
        </div>
        {props.map((p) => (
          <div key={p.id} className="flex min-h-5 min-w-0 items-center text-xs">
            <PropertyDisplay db={db} row={row} prop={p} />
          </div>
        ))}
        {!!row.commentCount && (
          <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <MessageSquare className="h-3 w-3" />
            {row.commentCount}
          </span>
        )}
      </div>
      <RowMenu row={row} className="absolute right-1.5 top-1.5 bg-background/80 opacity-0 focus-visible:opacity-100 group-hover:opacity-100" />
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Board                                                                */
/* ------------------------------------------------------------------ */

type Group = { key: string; label: React.ReactNode; value: RowValue }

function DraggableCard({ db, view, row }: { db: DatabaseDef; view: ViewDef; row: DbRow }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: row.id })
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      style={transform ? { transform: `translate(${transform.x}px, ${transform.y}px)`, zIndex: 30, position: 'relative' } : undefined}
    >
      <RowCard db={db} view={view} row={row} dragging={isDragging} />
    </div>
  )
}

function BoardColumn({
  group,
  rows,
  db,
  view,
  onNew,
}: {
  group: Group
  rows: DbRow[]
  db: DatabaseDef
  view: ViewDef
  onNew: (value: RowValue) => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id: group.key })
  return (
    <div ref={setNodeRef} className={cn('flex w-64 shrink-0 flex-col gap-2 rounded-lg p-1.5', isOver ? 'bg-accent/60' : 'bg-muted/30')}>
      <div className="flex items-center gap-2 px-1 pt-0.5 text-xs">
        {group.label}
        <span className="text-muted-foreground tabular-nums">{rows.length}</span>
      </div>
      {rows.map((r) => (
        <DraggableCard key={r.id} db={db} view={view} row={r} />
      ))}
      <button
        type="button"
        onClick={() => onNew(group.value)}
        className="flex items-center gap-1 rounded px-1.5 py-1 text-left text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
      >
        <Plus className="h-3.5 w-3.5" />
        Nueva
      </button>
    </div>
  )
}

export function BoardView({
  db,
  view,
  rows,
  onNew,
}: {
  db: DatabaseDef
  view: ViewDef
  rows: DbRow[]
  onNew: (values?: Record<string, RowValue>) => void
}) {
  const { ws, ctx, people } = useDb()
  const groupProp = view.groupBy ? getProperty(db, view.groupBy) : undefined
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))

  const { groups, byGroup } = useMemo(() => {
    const out: Group[] = []
    const map = new Map<string, DbRow[]>()
    if (!groupProp) return { groups: out, byGroup: map }
    const empty: Group = { key: '__none', label: <span className="text-muted-foreground">Sin {groupProp.name.toLowerCase()}</span>, value: null }
    if (groupProp.type === 'checkbox') {
      out.push({ key: 'true', label: <span>✅ Marcada</span>, value: true }, { key: '__none', label: <span className="text-muted-foreground">Sin marcar</span>, value: null })
    } else if (groupProp.type === 'person') {
      out.push(empty, ...people.map((p) => ({ key: p.id, label: <span className="flex items-center gap-1"><Avatar label={personLabel(p)} />{personLabel(p)}</span>, value: [p.id] as RowValue })))
    } else {
      out.push(empty, ...(groupProp.options ?? []).map((o) => ({ key: o.id, label: <OptionChip option={o} />, value: o.id as RowValue })))
    }
    for (const g of out) map.set(g.key, [])
    for (const r of rows) {
      const v = resolveValue(ctx, db, r, groupProp)
      let key = '__none'
      if (groupProp.type === 'checkbox') key = v === true ? 'true' : '__none'
      else if (Array.isArray(v)) key = v[0] ?? '__none'
      else if (typeof v === 'string' && v) key = v
      ;(map.get(key) ?? map.get('__none'))!.push(r)
    }
    return { groups: out, byGroup: map }
  }, [groupProp, rows, ctx, db, people])

  if (!groupProp) {
    return <p className="px-2 py-6 text-sm text-muted-foreground">Elegí una propiedad para agrupar en la configuración de la vista (⚙).</p>
  }

  function onDragEnd(e: DragEndEvent) {
    if (!e.over || !groupProp) return
    const target = groups.find((g) => g.key === e.over!.id)
    const rowId = String(e.active.id)
    if (!target) return
    const row = rows.find((r) => r.id === rowId)
    if (!row) return
    ws.updateRowValues(rowId, { [groupProp.id]: target.value })
  }

  // Hide the empty "Sin …" column when nothing is in it, like Notion.
  const shown = groups.filter((g) => g.key !== '__none' || (byGroup.get('__none')?.length ?? 0) > 0)

  return (
    <DndContext sensors={sensors} onDragEnd={onDragEnd}>
      <div className="notion-scroll flex items-start gap-2 overflow-x-auto pb-2">
        {shown.map((g) => (
          <BoardColumn
            key={g.key}
            group={g}
            rows={byGroup.get(g.key) ?? []}
            db={db}
            view={view}
            onNew={(value) => onNew(value === null ? {} : { [groupProp.id]: value })}
          />
        ))}
      </div>
    </DndContext>
  )
}

/* ------------------------------------------------------------------ */
/* Gallery                                                              */
/* ------------------------------------------------------------------ */

export function GalleryView({
  db,
  view,
  rows,
  onNew,
}: {
  db: DatabaseDef
  view: ViewDef
  rows: DbRow[]
  onNew: () => void
}) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {rows.map((r) => (
        <RowCard key={r.id} db={db} view={view} row={r} cover />
      ))}
      <button
        type="button"
        onClick={onNew}
        className="flex min-h-40 items-center justify-center gap-1 rounded-lg border border-dashed border-border text-sm text-muted-foreground hover:bg-accent/40 hover:text-foreground"
      >
        <Plus className="h-4 w-4" />
        Nueva
      </button>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* List                                                                 */
/* ------------------------------------------------------------------ */

export function ListView({
  db,
  view,
  rows,
  onNew,
}: {
  db: DatabaseDef
  view: ViewDef
  rows: DbRow[]
  onNew: () => void
}) {
  const { openRow } = useDb()
  const props = visibleProps(db, view)
  return (
    <div>
      {rows.map((r) => (
        <div
          key={r.id}
          role="button"
          tabIndex={0}
          onClick={() => openRow(r.id)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') openRow(r.id)
          }}
          className="group flex min-h-9 cursor-pointer items-center gap-2 rounded px-2 hover:bg-accent/50"
        >
          <span className="w-5 shrink-0 text-center text-sm">{r.icon || <FileText className="mx-auto h-3.5 w-3.5 text-muted-foreground" />}</span>
          <span className={cn('min-w-0 flex-1 truncate text-sm font-medium', !r.title && 'text-muted-foreground')}>{r.title || 'Sin título'}</span>
          <span className="hidden min-w-0 items-center gap-3 text-xs sm:flex">
            {props
              .filter((p) => hasDisplayValue(r, p))
              .map((p) => (
                <span key={p.id} className="flex max-w-44 min-w-0 items-center">
                  <PropertyDisplay db={db} row={r} prop={p} />
                </span>
              ))}
          </span>
          <RowMenu row={r} className="shrink-0 opacity-0 focus-visible:opacity-100 group-hover:opacity-100" />
        </div>
      ))}
      <button
        type="button"
        onClick={onNew}
        className="flex h-9 items-center gap-1.5 px-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <Plus className="h-4 w-4" />
        Nueva
      </button>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Calendar                                                             */
/* ------------------------------------------------------------------ */

const WEEKDAYS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']
const monthFmt = new Intl.DateTimeFormat('es-AR', { month: 'long', year: 'numeric' })

function iso(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function CalendarView({
  db,
  view,
  rows,
  onNew,
}: {
  db: DatabaseDef
  view: ViewDef
  rows: DbRow[]
  onNew: (values?: Record<string, RowValue>) => void
}) {
  const { openRow, ctx } = useDb()
  const [month, setMonth] = useState(() => {
    const d = new Date()
    return new Date(d.getFullYear(), d.getMonth(), 1)
  })
  const dateProp = view.dateProperty ? getProperty(db, view.dateProperty) : undefined
  const props = visibleProps(db, view)

  const byDay = useMemo(() => {
    const map = new Map<string, DbRow[]>()
    if (!dateProp) return map
    for (const r of rows) {
      const v = resolveValue(ctx, db, r, dateProp)
      if (typeof v !== 'string' || !v) continue
      const key = v.slice(0, 10)
      map.set(key, [...(map.get(key) ?? []), r])
    }
    return map
  }, [rows, dateProp, ctx, db])

  if (!dateProp) {
    return <p className="px-2 py-6 text-sm text-muted-foreground">Elegí una propiedad de fecha en la configuración de la vista (⚙).</p>
  }

  const start = new Date(month)
  start.setDate(1 - month.getDay())
  const days = Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start)
    d.setDate(start.getDate() + i)
    return d
  })
  // Drop a trailing week that belongs entirely to the next month.
  const weeks = days[35].getMonth() !== month.getMonth() ? 5 : 6
  const today = todayISO()
  const undated = rows.length - Array.from(byDay.values()).reduce((s, l) => s + l.length, 0)
  const editable = dateProp.type === 'date'

  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <span className="text-sm font-medium">
          {(() => {
            const label = monthFmt.format(month)
            return label.charAt(0).toUpperCase() + label.slice(1)
          })()}
        </span>
        {undated > 0 && <span className="text-xs text-muted-foreground">· {undated} sin fecha</span>}
        <div className="ml-auto flex items-center gap-1">
          <button type="button" onClick={() => setMonth((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1))} className="rounded p-1 hover:bg-accent" aria-label="Mes anterior">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => {
              const d = new Date()
              setMonth(new Date(d.getFullYear(), d.getMonth(), 1))
            }}
            className="rounded px-2 py-0.5 text-xs hover:bg-accent"
          >
            Hoy
          </button>
          <button type="button" onClick={() => setMonth((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1))} className="rounded p-1 hover:bg-accent" aria-label="Mes siguiente">
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
      <div className="notion-scroll overflow-x-auto">
        <div className="grid min-w-[640px] grid-cols-7 border-l border-t border-border">
          {WEEKDAYS.map((w) => (
            <div key={w} className="border-b border-r border-border px-2 py-1 text-center text-[11px] text-muted-foreground">
              {w}
            </div>
          ))}
          {days.slice(0, weeks * 7).map((d) => {
            const key = iso(d)
            const inMonth = d.getMonth() === month.getMonth()
            const items = byDay.get(key) ?? []
            return (
              <div key={key} className={cn('group min-h-24 border-b border-r border-border p-1', !inMonth && 'bg-muted/20')}>
                <div className="mb-1 flex items-center justify-between">
                  {editable ? (
                    <button
                      type="button"
                      onClick={() => onNew({ [dateProp.id]: key })}
                      className="rounded p-0.5 text-muted-foreground opacity-0 hover:bg-accent hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100"
                      aria-label={`Nueva el ${d.getDate()}`}
                    >
                      <Plus className="h-3 w-3" />
                    </button>
                  ) : (
                    <span />
                  )}
                  <span
                    className={cn(
                      'flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-xs',
                      key === today ? 'bg-[#eb5757] font-medium text-white' : inMonth ? 'text-foreground' : 'text-muted-foreground'
                    )}
                  >
                    {d.getDate()}
                  </span>
                </div>
                <div className="space-y-1">
                  {items.map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => openRow(r.id)}
                      className="block w-full rounded border border-border bg-card px-1.5 py-1 text-left text-xs shadow-sm hover:bg-accent"
                    >
                      <span className="block truncate font-medium">
                        {r.icon ? `${r.icon} ` : ''}
                        {r.title || 'Sin título'}
                      </span>
                      {props
                        .filter((p) => hasDisplayValue(r, p))
                        .slice(0, 2)
                        .map((p) => (
                          <span key={p.id} className="mt-0.5 flex min-w-0">
                            <PropertyDisplay db={db} row={r} prop={p} />
                          </span>
                        ))}
                    </button>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
