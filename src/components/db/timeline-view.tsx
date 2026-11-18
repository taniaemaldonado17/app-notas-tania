'use client'

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import { useDb } from '@/components/db/db-context'
import { OptionChip } from '@/components/db/chips'
import { resolveValue } from '@/lib/db-resolve'
import { findOption, getProperty, todayISO, type DatabaseDef, type DbRow, type PropertyDef, type RowValue, type ViewDef } from '@/lib/db-types'
import { cn } from '@/lib/utils'

/*
 * Timeline (Gantt) view: each row is a bar from its start to its end date.
 * Bars can be dragged to move them or stretched from either edge.
 */

type Zoom = 'week' | 'month' | 'quarter'

const ZOOMS: { id: Zoom; label: string; dayW: number }[] = [
  { id: 'week', label: 'Semana', dayW: 44 },
  { id: 'month', label: 'Mes', dayW: 18 },
  { id: 'quarter', label: 'Trimestre', dayW: 7 },
]

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const WEEKDAY_LETTERS = ['D', 'L', 'M', 'M', 'J', 'V', 'S']
const ROW_H = 40
const DAY_MS = 86_400_000

/** Option names that mean "finished": those rows never show as late. */
const DONE_RE = /list[oa]|hech[oa]|complet|termin|finaliz|done|cerrad|aprobad|desplegad|entregad|resuelt|cancelad/i

/** 'YYYY-MM-DD' → whole days since epoch (UTC, no timezone drift). */
function dayNum(iso: string): number {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  return Math.round(Date.UTC(y, m - 1, d) / DAY_MS)
}
function isoOf(n: number): string {
  return new Date(n * DAY_MS).toISOString().slice(0, 10)
}
function dateOf(n: number): Date {
  return new Date(n * DAY_MS)
}

type Span = { start: number; end: number }

type Drag = {
  rowId: string
  mode: 'move' | 'start' | 'end'
  x0: number
  s0: number
  e0: number
  span: Span
  moved: boolean
}

export function TimelineView({
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
  const { ws, ctx, openRow } = useDb()
  const [zoom, setZoom] = useState<Zoom>('month')
  const [drag, setDrag] = useState<Drag | null>(null)
  const dragRef = useRef<Drag | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  const startProp = view.dateProperty ? getProperty(db, view.dateProperty) : undefined
  const endProp = view.endDateProperty ? getProperty(db, view.endDateProperty) : undefined
  const statusProp: PropertyDef | undefined =
    db.properties.find((p) => p.type === 'status') ??
    db.properties.find((p) => p.type === 'select' && /estado|status|etapa/i.test(p.name))
  const doneCheckbox = db.properties.find((p) => p.type === 'checkbox' && /hech|list|complet|termin|done/i.test(p.name))
  const editable = startProp?.type === 'date' && (!endProp || endProp.type === 'date')
  const dayW = ZOOMS.find((z) => z.id === zoom)!.dayW

  const today = dayNum(todayISO())

  /** Each row's span (null = no dates yet). */
  const spans = useMemo(() => {
    const map = new Map<string, Span | null>()
    for (const r of rows) {
      const sv = startProp ? resolveValue(ctx, db, r, startProp) : null
      const ev = endProp ? resolveValue(ctx, db, r, endProp) : null
      const s = typeof sv === 'string' && sv ? dayNum(sv) : null
      const e = typeof ev === 'string' && ev ? dayNum(ev) : null
      if (s === null && e === null) map.set(r.id, null)
      else {
        const a = s ?? e!
        const b = e ?? s!
        map.set(r.id, { start: Math.min(a, b), end: Math.max(a, b) })
      }
    }
    return map
  }, [rows, startProp, endProp, ctx, db])

  // Visible range: all dated rows and today, with margin, from the 1st of a month.
  const range = useMemo(() => {
    let min = today
    let max = today
    for (const s of spans.values()) {
      if (!s) continue
      min = Math.min(min, s.start)
      max = Math.max(max, s.end)
    }
    const first = dateOf(min - 45)
    const from = dayNum(isoOf(Math.round(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), 1) / DAY_MS)))
    const last = dateOf(max + 120)
    const to = Math.round(Date.UTC(last.getUTCFullYear(), last.getUTCMonth() + 1, 0) / DAY_MS)
    return { from, to, days: to - from + 1 }
  }, [spans, today])

  const width = range.days * dayW

  function scrollToDay(n: number, smooth = false) {
    const el = scrollRef.current
    if (!el) return
    const left = (n - range.from) * dayW - el.clientWidth / 3
    el.scrollTo({ left: Math.max(0, left), behavior: smooth ? 'smooth' : 'auto' })
  }

  // Start with today in view, and keep it there when zooming.
  const lastZoom = useRef<Zoom | null>(null)
  useLayoutEffect(() => {
    if (lastZoom.current === zoom) return
    lastZoom.current = zoom
    scrollToDay(today)
  }, [zoom, dayW])

  // Month label of what is on screen (updates while scrolling).
  const [visibleDay, setVisibleDay] = useState(today)
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const onScroll = () => setVisibleDay(range.from + Math.floor((el.scrollLeft + el.clientWidth / 3) / dayW))
    onScroll()
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [range.from, dayW])

  if (!startProp) {
    return <p className="px-2 py-6 text-sm text-muted-foreground">Elegí la fecha de inicio (y de fin) en la configuración de la vista (⚙).</p>
  }

  /* ------------------------------ Dragging ------------------------------ */

  function beginDrag(e: React.PointerEvent, row: DbRow, span: Span, mode: Drag['mode']) {
    if (e.button !== 0) return
    e.stopPropagation()
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    const d: Drag = { rowId: row.id, mode, x0: e.clientX, s0: span.start, e0: span.end, span, moved: false }
    dragRef.current = d
    setDrag(d)
  }

  function moveDrag(e: React.PointerEvent) {
    const d = dragRef.current
    if (!d) return
    const dx = e.clientX - d.x0
    const delta = Math.round(dx / dayW)
    let span: Span
    if (!editable) span = { start: d.s0, end: d.e0 }
    else if (d.mode === 'move') span = { start: d.s0 + delta, end: d.e0 + delta }
    else if (d.mode === 'start') span = { start: Math.min(d.s0 + delta, d.e0), end: d.e0 }
    else span = { start: d.s0, end: Math.max(d.e0 + delta, d.s0) }
    const next = { ...d, span, moved: d.moved || Math.abs(dx) > 3 }
    dragRef.current = next
    setDrag(next)
  }

  function endDrag() {
    const d = dragRef.current
    dragRef.current = null
    setDrag(null)
    if (!d) return
    if (!d.moved) {
      openRow(d.rowId)
      return
    }
    if (!editable || (d.span.start === d.s0 && d.span.end === d.e0)) return
    const patch: Record<string, RowValue> = { [startProp!.id]: isoOf(d.span.start) }
    if (endProp) patch[endProp.id] = isoOf(d.span.end)
    ws.updateRowValues(d.rowId, patch)
  }

  function schedule(row: DbRow) {
    if (!editable) return openRow(row.id)
    const patch: Record<string, RowValue> = { [startProp!.id]: isoOf(today) }
    if (endProp) patch[endProp.id] = isoOf(today + 6)
    ws.updateRowValues(row.id, patch)
  }

  function newItem() {
    if (!editable) return onNew()
    const values: Record<string, RowValue> = { [startProp!.id]: isoOf(today) }
    if (endProp) values[endProp.id] = isoOf(today + 6)
    onNew(values)
  }

  /* ------------------------------ Header ------------------------------ */

  const months: { left: number; width: number; label: string }[] = []
  {
    let n = range.from
    while (n <= range.to) {
      const d = dateOf(n)
      const next = Math.round(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1) / DAY_MS)
      const endN = Math.min(next, range.to + 1)
      const label = zoom === 'quarter' ? MONTHS[d.getUTCMonth()].slice(0, 3) : MONTHS[d.getUTCMonth()]
      months.push({
        left: (n - range.from) * dayW,
        width: (endN - n) * dayW,
        label: d.getUTCMonth() === 0 || n === range.from ? `${label} ${d.getUTCFullYear()}` : label,
      })
      n = endN
    }
  }

  const ticks: { n: number; label: string; sub?: string }[] = []
  for (let n = range.from; n <= range.to; n++) {
    const d = dateOf(n)
    if (zoom === 'week') ticks.push({ n, label: String(d.getUTCDate()), sub: WEEKDAY_LETTERS[d.getUTCDay()] })
    else if (d.getUTCDay() === 1) ticks.push({ n, label: String(d.getUTCDate()) })
  }

  const weekends: number[] = []
  if (dayW >= 18) {
    for (let n = range.from; n <= range.to; n++) {
      const wd = dateOf(n).getUTCDay()
      if (wd === 0 || wd === 6) weekends.push(n)
    }
  }

  const vd = dateOf(visibleDay)
  const undated = rows.filter((r) => !spans.get(r.id)).length
  const todayLeft = (today - range.from) * dayW + dayW / 2

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h3 className="text-lg tracking-tight">
          <span className="font-semibold">{MONTHS[vd.getUTCMonth()]}</span> <span className="text-muted-foreground">{vd.getUTCFullYear()}</span>
        </h3>
        {undated > 0 && <span className="text-xs text-muted-foreground">{undated} sin fecha</span>}
        <div className="ml-auto flex items-center gap-2">
          <div className="glass flex h-8 items-center rounded-full p-1">
            {ZOOMS.map((z) => (
              <button
                key={z.id}
                type="button"
                onClick={() => setZoom(z.id)}
                className={cn(
                  'h-6 rounded-full px-3 text-xs transition',
                  zoom === z.id ? 'bg-foreground/10 font-semibold text-foreground dark:bg-white/15' : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {z.label}
              </button>
            ))}
          </div>
          <div className="glass flex h-8 items-center rounded-full px-1">
            <button
              type="button"
              onClick={() => scrollRef.current?.scrollBy({ left: -(scrollRef.current.clientWidth * 0.7), behavior: 'smooth' })}
              className="flex h-6 w-6 items-center justify-center rounded-full hover:bg-accent"
              aria-label="Anterior"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button type="button" onClick={() => scrollToDay(today, true)} className="h-6 rounded-full px-2.5 text-xs font-medium text-[#ff3b30] hover:bg-accent dark:text-[#ff453a]">
              Hoy
            </button>
            <button
              type="button"
              onClick={() => scrollRef.current?.scrollBy({ left: scrollRef.current.clientWidth * 0.7, behavior: 'smooth' })}
              className="flex h-6 w-6 items-center justify-center rounded-full hover:bg-accent"
              aria-label="Siguiente"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      <div ref={scrollRef} className="notion-scroll overflow-x-auto rounded-lg border border-border">
        <div className="relative select-none" style={{ width }}>
          {/* Months + day ticks */}
          <div className="relative h-6 border-b border-border">
            {months.map((m) => (
              <span
                key={m.left}
                className="absolute top-0 flex h-6 items-center truncate border-l border-border px-1.5 text-[11px] font-medium capitalize text-muted-foreground"
                style={{ left: m.left, width: m.width }}
              >
                {m.label}
              </span>
            ))}
          </div>
          <div className={cn('relative border-b border-border', zoom === 'week' ? 'h-9' : 'h-6')}>
            {ticks.map((t) => (
              <span
                key={t.n}
                className="absolute top-0 flex flex-col items-center justify-center text-[11px] leading-tight tabular-nums text-muted-foreground"
                style={{ left: (t.n - range.from) * dayW, width: zoom === 'week' ? dayW : undefined, height: '100%' }}
              >
                {t.sub && <span className="text-[10px] opacity-70">{t.sub}</span>}
                <span className={cn(zoom !== 'week' && 'pl-1')}>{t.label}</span>
              </span>
            ))}
            {today >= range.from && today <= range.to && (
              <span
                className="absolute bottom-0.5 z-10 flex h-5 min-w-5 -translate-x-1/2 items-center justify-center rounded-full bg-[#ff3b30] px-1 text-[11px] font-semibold text-white dark:bg-[#ff453a]"
                style={{ left: todayLeft }}
              >
                {dateOf(today).getUTCDate()}
              </span>
            )}
          </div>

          {/* Body */}
          <div className="relative" style={{ height: Math.max(rows.length, 1) * ROW_H + 8 }}>
            {weekends.map((n) => (
              <div key={n} className="absolute inset-y-0 bg-foreground/[0.025] dark:bg-white/[0.035]" style={{ left: (n - range.from) * dayW, width: dayW }} />
            ))}
            {zoom !== 'week' &&
              ticks.map((t) => (
                <div key={t.n} className="absolute inset-y-0 border-l border-border/50" style={{ left: (t.n - range.from) * dayW }} />
              ))}
            <div className="absolute inset-y-0 z-10 w-px bg-[#ff3b30] dark:bg-[#ff453a]" style={{ left: todayLeft }} />

            {rows.map((r, i) => {
              const top = i * ROW_H + 6
              const base = spans.get(r.id) ?? null
              const span = drag?.rowId === r.id ? drag.span : base
              const statusOpt = statusProp ? findOption(statusProp, r.values[statusProp.id]) : undefined
              const color = statusOpt?.color ?? 'blue'
              const title = r.title || 'Sin título'

              if (!span) {
                return (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => schedule(r)}
                    className="absolute z-20 flex h-7 items-center gap-1.5 rounded-md border border-dashed border-border bg-background/70 px-2 text-xs text-muted-foreground hover:text-foreground"
                    style={{ top, left: Math.max(0, todayLeft - 8) }}
                    title={editable ? 'Programar desde hoy' : 'Abrir'}
                  >
                    <Plus className="h-3 w-3" />
                    <span className="max-w-60 truncate">{title}</span>
                    <span className="opacity-70">· sin fecha</span>
                  </button>
                )
              }

              const left = (span.start - range.from) * dayW
              const barW = Math.max(dayW, (span.end - span.start + 1) * dayW)
              const done = (statusOpt && DONE_RE.test(statusOpt.name)) || (doneCheckbox && r.values[doneCheckbox.id] === true)
              const late = !done && span.end < today ? today - span.end : 0
              const lateBy = drag?.rowId === r.id ? 0 : late

              return (
                <div key={r.id} className="absolute z-20 flex items-center gap-2" style={{ top, left, height: 28 }}>
                  <div
                    role="button"
                    tabIndex={0}
                    onPointerDown={(e) => beginDrag(e, r, span, 'move')}
                    onPointerMove={moveDrag}
                    onPointerUp={endDrag}
                    onPointerCancel={endDrag}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') openRow(r.id)
                    }}
                    data-opt-color={color}
                    className={cn(
                      'group/bar relative h-7 shrink-0 rounded-md shadow-sm ring-1 ring-black/5 transition-[filter] hover:brightness-105 dark:ring-white/10',
                      editable ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer',
                      drag?.rowId === r.id && drag.moved && 'brightness-110'
                    )}
                    style={{ width: barW }}
                    title={`${title}\n${isoOf(span.start)}${span.end !== span.start ? ` → ${isoOf(span.end)}` : ''}`}
                  >
                    {editable && endProp && (
                      <>
                        <span
                          onPointerDown={(e) => beginDrag(e, r, span, 'start')}
                          onPointerMove={moveDrag}
                          onPointerUp={endDrag}
                          className="absolute inset-y-0 left-0 w-2 cursor-ew-resize rounded-l-md opacity-0 group-hover/bar:bg-current/20 group-hover/bar:opacity-100"
                        />
                        <span
                          onPointerDown={(e) => beginDrag(e, r, span, 'end')}
                          onPointerMove={moveDrag}
                          onPointerUp={endDrag}
                          className="absolute inset-y-0 right-0 w-2 cursor-ew-resize rounded-r-md opacity-0 group-hover/bar:bg-current/20 group-hover/bar:opacity-100"
                        />
                      </>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => openRow(r.id)}
                    className="flex min-w-0 items-center gap-2 whitespace-nowrap rounded px-1 text-left text-[13px] font-medium hover:bg-accent/60"
                  >
                    <span>
                      {r.icon ? `${r.icon} ` : ''}
                      {title}
                    </span>
                    {statusOpt && <OptionChip option={statusOpt} className="text-[11px] leading-4" />}
                    {lateBy > 0 && (
                      <span className="flex items-center gap-1 text-[11px] font-semibold text-[#ff3b30] dark:text-[#ff453a]">
                        <AlertTriangle className="h-3 w-3" />
                        {lateBy} {lateBy === 1 ? 'día' : 'días'} de retraso
                      </span>
                    )}
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={newItem}
        className="flex items-center gap-1.5 rounded px-2 py-1 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
      >
        <Plus className="h-4 w-4" />
        Nuevo ítem
      </button>
    </div>
  )
}
