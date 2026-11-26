'use client'

import { useMemo, useState } from 'react'
import { CalendarPlus, ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import { useDb } from '@/components/db/db-context'
import { PropertyDisplay } from '@/components/db/property-value'
import { hasDisplayValue, visibleProps } from '@/components/db/card-views'
import { CalendarSyncDialog } from '@/components/calendar-sync-dialog'
import { resolveValue } from '@/lib/db-resolve'
import { findOption, getProperty, todayISO, type DatabaseDef, type DbRow, type PropertyDef, type RowValue, type ViewDef } from '@/lib/db-types'
import { cn } from '@/lib/utils'

/* Month and week calendar views (weeks start on Monday), with solid
   Google Calendar–style event cards. */

const WEEKDAYS = ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom']
const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const SHORT_MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sept', 'oct', 'nov', 'dic']
const MAX_PER_DAY = 3

type Mode = 'month' | 'week'

function iso(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** Monday of the week containing d. */
function mondayOf(d: Date): Date {
  const m = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  m.setDate(m.getDate() - ((m.getDay() + 6) % 7))
  return m
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d)
  x.setDate(x.getDate() + n)
  return x
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
  const [mode, setMode] = useState<Mode>('month')
  const [anchor, setAnchor] = useState(() => new Date())
  const [syncOpen, setSyncOpen] = useState(false)
  const dateProp = view.dateProperty ? getProperty(db, view.dateProperty) : undefined
  const props = visibleProps(db, view)
  // Events take the colour of the first select/status shown (e.g. Etapa, Tipo).
  const colorProp: PropertyDef | undefined =
    props.find((p) => p.type === 'select' || p.type === 'status') ?? db.properties.find((p) => p.type === 'status' || p.type === 'select')

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

  const today = todayISO()
  const undated = rows.length - Array.from(byDay.values()).reduce((s, l) => s + l.length, 0)
  const editable = dateProp.type === 'date'
  const colorOf = (r: DbRow) => (colorProp ? findOption(colorProp, r.values[colorProp.id])?.color : undefined) ?? 'blue'

  const monthStart = new Date(anchor.getFullYear(), anchor.getMonth(), 1)
  const gridStart = mondayOf(mode === 'month' ? monthStart : anchor)
  const totalDays = (() => {
    if (mode === 'week') return 7
    const last = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0)
    const end = addDays(mondayOf(last), 6)
    return Math.round((end.getTime() - gridStart.getTime()) / 86400000) + 1
  })()
  const days = Array.from({ length: totalDays }, (_, i) => addDays(gridStart, i))
  const shownMonth = mode === 'month' ? anchor.getMonth() : addDays(gridStart, 3).getMonth()
  const shownYear = mode === 'month' ? anchor.getFullYear() : addDays(gridStart, 3).getFullYear()

  function move(dir: -1 | 1) {
    setAnchor((a) => (mode === 'month' ? new Date(a.getFullYear(), a.getMonth() + dir, 1) : addDays(a, 7 * dir)))
  }

  // Google Calendar–style cards: solid colour, white text. Month view shows the
  // title plus one detail; week view the title plus up to three. Text wraps
  // onto the next line instead of being cut off.
  const eventPill = (r: DbRow, big = false) => {
    const details = props.filter((p) => p.id !== colorProp?.id && hasDisplayValue(r, p)).slice(0, big ? 3 : 1)
    return (
      <button
        key={r.id}
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          openRow(r.id)
        }}
        data-evt-color={colorOf(r)}
        className={cn(
          'cal-card flex w-full min-w-0 flex-col rounded-md text-left shadow-sm transition hover:shadow-md hover:brightness-[1.06]',
          big ? 'min-h-[56px] gap-1 px-2 py-1.5 text-[13px] leading-snug' : 'gap-0.5 px-2 py-1 text-xs leading-snug'
        )}
        title={r.title || 'Sin título'}
      >
        <span className="block w-full whitespace-normal break-words font-semibold">
          {r.icon ? `${r.icon} ` : ''}
          {r.title || 'Sin título'}
        </span>
        {details.map((p) => (
          <span key={p.id} className={cn('flex w-full min-w-0 flex-wrap break-words', big ? 'text-xs' : 'text-[11px]')}>
            <PropertyDisplay db={db} row={r} prop={p} />
          </span>
        ))}
      </button>
    )
  }

  return (
    <div className="apple-calendar">
      {/* Header: big month title + glass controls, like Calendar on iPad */}
      <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2">
        <h3 className="text-2xl tracking-tight">
          <span className="font-bold">{MONTHS[shownMonth]}</span> <span className="font-normal">de {shownYear}</span>
        </h3>
        {undated > 0 && <span className="text-xs text-muted-foreground">{undated} sin fecha</span>}

        <div className="ml-auto flex items-center gap-2">
          <div className="glass flex h-9 items-center rounded-full p-1">
            {(['week', 'month'] as Mode[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={cn(
                  'h-7 rounded-full px-3.5 text-[13px] transition',
                  mode === m ? 'bg-foreground/10 font-semibold text-foreground dark:bg-white/15' : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {m === 'week' ? 'Semana' : 'Mes'}
              </button>
            ))}
          </div>
          <div className="glass flex h-9 items-center rounded-full px-1">
            <button type="button" onClick={() => move(-1)} className="flex h-7 w-7 items-center justify-center rounded-full hover:bg-accent" aria-label="Anterior">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button type="button" onClick={() => setAnchor(new Date())} className="h-7 rounded-full px-2.5 text-[13px] font-medium text-[#ff3b30] hover:bg-accent dark:text-[#ff453a]">
              Hoy
            </button>
            <button type="button" onClick={() => move(1)} className="flex h-7 w-7 items-center justify-center rounded-full hover:bg-accent" aria-label="Siguiente">
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          <button
            type="button"
            onClick={() => setSyncOpen(true)}
            className="glass flex h-9 items-center gap-1.5 rounded-full px-3 text-[13px] text-foreground hover:brightness-110"
            title="Ver estas fechas en el Calendario del iPhone / iPad"
          >
            <CalendarPlus className="h-4 w-4 text-primary" />
            <span className="hidden sm:inline">iPhone / iPad</span>
          </button>
        </div>
      </div>

      <div className="notion-scroll overflow-x-auto">
        <div className="min-w-[640px]">
          {/* Weekday header */}
          <div className="grid grid-cols-7 border-b border-border">
            {WEEKDAYS.map((w, i) => {
              const d = days[i]
              const key = iso(d)
              return (
                <div key={w} className={cn('px-2 pb-1.5 text-right text-[13px]', i >= 5 ? 'text-muted-foreground' : 'text-foreground/80')}>
                  {mode === 'week' ? (
                    <span className="inline-flex items-center gap-1.5">
                      {w}
                      <span
                        className={cn(
                          'flex h-7 min-w-7 items-center justify-center rounded-full px-1 text-base',
                          key === today ? 'bg-[#ff3b30] font-semibold text-white dark:bg-[#ff453a]' : 'text-foreground'
                        )}
                      >
                        {d.getDate()}
                      </span>
                    </span>
                  ) : (
                    w
                  )}
                </div>
              )
            })}
          </div>

          {/* Days */}
          <div className="grid grid-cols-7">
            {days.map((d, i) => {
              const key = iso(d)
              const weekend = i % 7 >= 5
              const inMonth = mode === 'week' || d.getMonth() === anchor.getMonth()
              const items = byDay.get(key) ?? []
              const shown = mode === 'week' ? items : items.slice(0, MAX_PER_DAY)
              const isToday = key === today
              return (
                <div
                  key={key}
                  onDoubleClick={() => editable && onNew({ [dateProp.id]: key })}
                  className={cn(
                    'group relative flex flex-col gap-0.5 border-b border-border p-1',
                    i % 7 !== 0 && 'border-l',
                    mode === 'week' ? 'min-h-[420px] pt-2' : 'min-h-[120px]',
                    weekend && 'bg-foreground/[0.025] dark:bg-white/[0.035]'
                  )}
                >
                  {mode === 'month' && (
                    <div className="mb-0.5 flex items-center justify-end gap-1">
                      {editable && (
                        <button
                          type="button"
                          onClick={() => onNew({ [dateProp.id]: key })}
                          className="mr-auto flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground opacity-0 hover:bg-accent hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100"
                          aria-label={`Nueva el ${d.getDate()}`}
                        >
                          <Plus className="h-3.5 w-3.5" />
                        </button>
                      )}
                      <span
                        className={cn(
                          'flex h-7 min-w-7 items-center justify-center rounded-full px-1.5 text-[15px] tabular-nums',
                          isToday
                            ? 'bg-[#ff3b30] font-semibold text-white dark:bg-[#ff453a]'
                            : !inMonth || weekend
                              ? 'text-muted-foreground'
                              : 'text-foreground'
                        )}
                      >
                        {d.getDate() === 1 && !isToday ? `1 ${SHORT_MONTHS[d.getMonth()]}` : d.getDate()}
                      </span>
                    </div>
                  )}
                  <div className={cn('flex min-w-0 flex-col', mode === 'week' ? 'gap-1.5' : 'gap-1', !inMonth && 'opacity-60')}>
                    {shown.map((r) => eventPill(r, mode === 'week'))}
                    {items.length > shown.length && (
                      <button
                        type="button"
                        onClick={() => {
                          setAnchor(d)
                          setMode('week')
                        }}
                        className="px-1.5 text-left text-[11px] font-medium text-muted-foreground hover:text-foreground"
                      >
                        {items.length - shown.length} más
                      </button>
                    )}
                  </div>
                  {mode === 'week' && editable && (
                    <button
                      type="button"
                      onClick={() => onNew({ [dateProp.id]: key })}
                      className="mt-1 flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] text-muted-foreground opacity-0 hover:bg-accent hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100"
                    >
                      <Plus className="h-3 w-3" /> Nueva
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>

      <CalendarSyncDialog open={syncOpen} onOpenChange={setSyncOpen} />
    </div>
  )
}
