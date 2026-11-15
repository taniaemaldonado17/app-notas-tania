'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { es } from 'date-fns/locale'
import { toast } from 'sonner'
import { AlertTriangle, Check, Loader2, Paperclip, Plus, Search, Upload, X } from 'lucide-react'
import * as api from '@/lib/api'
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover'
import { Calendar } from '@/components/ui/calendar'
import { Avatar, OptionChip, ProgressBar, RowChip } from '@/components/db/chips'
import { personLabel, useDb } from '@/components/db/db-context'
import {
  barRatio,
  findOption,
  formatDate,
  formatNumber,
  isComputed,
  isDriveFolderLink,
  newId,
  OPTION_COLORS,
  todayISO,
  type DatabaseDef,
  type DbRow,
  type PropertyDef,
  type RowValue,
  type SelectOption,
} from '@/lib/db-types'
import { formulaResult, resolveValue, rowTitle } from '@/lib/db-resolve'
import { cn } from '@/lib/utils'

/* ------------------------------------------------------------------ */
/* Number parsing (es-AR friendly)                                     */
/* ------------------------------------------------------------------ */

export function parseNumberInput(raw: string): number | null {
  let s = raw.trim().replace(/[\s$€%]|US/gi, '')
  if (!s) return null
  const hasDot = s.includes('.')
  const hasComma = s.includes(',')
  if (hasDot && hasComma) {
    // 1.234,56 (es) or 1,234.56 (en): the last separator is the decimal one
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) s = s.replace(/\./g, '').replace(',', '.')
    else s = s.replace(/,/g, '')
  } else if (hasComma) {
    s = /^-?\d{1,3}(,\d{3})+$/.test(s) ? s.replace(/,/g, '') : s.replace(',', '.')
  } else if (hasDot && /^-?\d{1,3}(\.\d{3})+$/.test(s)) {
    s = s.replace(/\./g, '')
  }
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

/* ------------------------------------------------------------------ */
/* Read-only display                                                    */
/* ------------------------------------------------------------------ */

export function PropertyDisplay({
  db,
  row,
  prop,
  wrap = false,
}: {
  db: DatabaseDef
  row: DbRow
  prop: PropertyDef
  /** Allow multi-line text (row panel) instead of truncating (table). */
  wrap?: boolean
}) {
  const { ctx, people, openRow } = useDb()
  const value = resolveValue(ctx, db, row, prop)
  const textCls = wrap ? 'whitespace-pre-wrap break-words' : 'truncate'

  switch (prop.type) {
    case 'title':
      return <span className={cn('font-medium', textCls)}>{row.title || 'Sin título'}</span>
    case 'text':
      return typeof value === 'string' && value ? <span className={textCls}>{value}</span> : null
    case 'number': {
      if (typeof value !== 'number') return null
      const label = formatNumber(value, prop.numberFormat)
      return prop.showAs === 'bar' ? <ProgressBar ratio={barRatio(value, prop.numberFormat)} label={label} /> : <span className="tabular-nums">{label}</span>
    }
    case 'formula': {
      const r = formulaResult(ctx, db, row, prop)
      if (r.error) {
        return (
          <span className="inline-flex items-center gap-1 text-xs text-destructive" title={r.error}>
            <AlertTriangle className="h-3 w-3" /> Error
          </span>
        )
      }
      if (typeof r.value === 'number') {
        const label = formatNumber(r.value, prop.numberFormat)
        return prop.showAs === 'bar' ? <ProgressBar ratio={barRatio(r.value, prop.numberFormat)} label={label} /> : <span className="tabular-nums">{label}</span>
      }
      if (typeof r.value === 'boolean') return r.value ? <Check className="h-4 w-4" /> : null
      return r.value ? <span className={textCls}>{String(r.value)}</span> : null
    }
    case 'select':
    case 'status': {
      const o = findOption(prop, value)
      return o ? <OptionChip option={o} /> : null
    }
    case 'multi_select': {
      const ids = Array.isArray(value) ? value : []
      const opts = ids.map((id) => findOption(prop, id)).filter(Boolean) as SelectOption[]
      if (!opts.length) return null
      return (
        <span className={cn('flex gap-1', wrap ? 'flex-wrap' : 'overflow-hidden')}>
          {opts.map((o) => (
            <OptionChip key={o.id} option={o} />
          ))}
        </span>
      )
    }
    case 'date':
      return typeof value === 'string' && value ? <span className="truncate">{formatDate(value)}</span> : null
    case 'created_time':
    case 'updated_time':
      return typeof value === 'string' ? (
        <span className="truncate text-muted-foreground">
          {new Intl.DateTimeFormat('es-AR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))}
        </span>
      ) : null
    case 'checkbox':
      return (
        <span
          className={cn(
            'inline-flex h-4 w-4 items-center justify-center rounded-[3px] border',
            value === true ? 'border-primary bg-primary text-white' : 'border-muted-foreground/50'
          )}
        >
          {value === true && <Check className="h-3 w-3" strokeWidth={3} />}
        </span>
      )
    case 'url':
    case 'email':
    case 'phone': {
      if (typeof value !== 'string' || !value) return null
      const uploaded = prop.type === 'url' && value.startsWith('/api/files/')
      const href =
        prop.type === 'email'
          ? `mailto:${value}`
          : prop.type === 'phone'
            ? `tel:${value.replace(/\s/g, '')}`
            : uploaded || /^https?:\/\//i.test(value)
              ? value
              : `https://${value}`
      if (uploaded) {
        return (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className={cn('inline-flex items-center gap-1 underline decoration-muted-foreground/50 underline-offset-2 hover:decoration-current', textCls)}
          >
            <Paperclip className="h-3 w-3 shrink-0" /> Archivo subido
          </a>
        )
      }
      return (
        <a
          href={href}
          target={prop.type === 'url' ? '_blank' : undefined}
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className={cn('underline decoration-muted-foreground/50 underline-offset-2 hover:decoration-current', textCls)}
        >
          {prop.type === 'url' ? value.replace(/^https?:\/\//i, '') : value}
        </a>
      )
    }
    case 'person': {
      const ids = Array.isArray(value) ? value : []
      if (!ids.length) return null
      return (
        <span className={cn('flex gap-2', wrap ? 'flex-wrap' : 'overflow-hidden')}>
          {ids.map((id) => {
            const p = people.find((x) => x.id === id)
            return (
              <span key={id} className="inline-flex min-w-0 items-center gap-1">
                <Avatar label={personLabel(p)} />
                <span className="truncate text-sm">{personLabel(p)}</span>
              </span>
            )
          })}
        </span>
      )
    }
    case 'relation':
    case 'backlink': {
      const ids = Array.isArray(value) ? value : []
      if (!ids.length) return null
      return (
        <span className={cn('flex gap-1', wrap ? 'flex-wrap' : 'overflow-hidden')}>
          {ids.map((id) => {
            const r = rowTitle(ctx, id)
            if (!r) return null
            return <RowChip key={id} title={r.title} icon={r.icon} onClick={() => openRow(id)} />
          })}
        </span>
      )
    }
    default:
      return null
  }
}

/* ------------------------------------------------------------------ */
/* Editable cell: display + popover editor                              */
/* ------------------------------------------------------------------ */

export function PropertyCell({
  db,
  row,
  prop,
  variant,
  className,
}: {
  db: DatabaseDef
  row: DbRow
  prop: PropertyDef
  variant: 'table' | 'panel'
  className?: string
}) {
  const { ws, ctx } = useDb()
  const [open, setOpen] = useState(false)
  // Backlinks are computed, but Notion lets you edit them from either side.
  const computed = isComputed(prop.type) && prop.type !== 'backlink'
  const resolved = prop.type === 'backlink' ? resolveValue(ctx, db, row, prop) : null
  const isEmpty = prop.type === 'backlink' ? !Array.isArray(resolved) || resolved.length === 0 : !hasValue(row, prop)

  if (prop.type === 'checkbox') {
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          ws.updateRowValues(row.id, { [prop.id]: row.values[prop.id] === true ? null : true })
        }}
        className={cn('flex h-full w-full items-center', variant === 'panel' ? 'min-h-8 px-2' : 'px-2', className)}
        aria-label={`${prop.name}: ${row.values[prop.id] === true ? 'marcada' : 'sin marcar'}`}
      >
        <PropertyDisplay db={db} row={row} prop={prop} />
      </button>
    )
  }

  const display = <PropertyDisplay db={db} row={row} prop={prop} wrap={variant === 'panel'} />

  if (computed) {
    return (
      <div className={cn('flex h-full w-full min-w-0 items-center', variant === 'panel' ? 'min-h-8 px-2 py-1' : 'px-2', className)}>
        {display}
      </div>
    )
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <div
          role="button"
          tabIndex={0}
          onClick={(e) => {
            e.stopPropagation()
            setOpen(true)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') setOpen(true)
          }}
          className={cn(
            'flex h-full w-full min-w-0 cursor-pointer items-center outline-none hover:bg-accent/50 focus-visible:ring-1 focus-visible:ring-ring',
            variant === 'panel' ? 'min-h-8 rounded px-2 py-1' : 'px-2',
            className
          )}
        >
          {display ?? null}
          {variant === 'panel' && isEmpty && <span className="text-sm text-muted-foreground/70">Vacío</span>}
        </div>
      </PopoverAnchor>
      <PopoverContent
        align="start"
        sideOffset={variant === 'table' ? -32 : 4}
        className="w-72 p-0"
        onClick={(e) => e.stopPropagation()}
      >
        <PropertyEditor db={db} row={row} prop={prop} onDone={() => setOpen(false)} />
      </PopoverContent>
    </Popover>
  )
}

function hasValue(row: DbRow, prop: PropertyDef): boolean {
  const v = row.values[prop.id]
  if (v === undefined || v === null || v === '') return false
  if (Array.isArray(v)) return v.length > 0
  return true
}

/* ------------------------------------------------------------------ */
/* Editors                                                              */
/* ------------------------------------------------------------------ */

export function PropertyEditor({
  db,
  row,
  prop,
  onDone,
}: {
  db: DatabaseDef
  row: DbRow
  prop: PropertyDef
  onDone: () => void
}) {
  const { ws } = useDb()
  const value = row.values[prop.id]
  const set = (v: RowValue) => ws.updateRowValues(row.id, { [prop.id]: v })

  switch (prop.type) {
    case 'url':
      return (
        <UrlEditor
          initial={typeof value === 'string' ? value : ''}
          onCommit={(v) => {
            set(v.trim() ? v.trim() : null)
            onDone()
          }}
        />
      )
    case 'text':
    case 'email':
    case 'phone':
      return (
        <TextEditor
          initial={typeof value === 'string' ? value : ''}
          multiline={prop.type === 'text'}
          type={prop.type === 'email' ? 'email' : prop.type === 'phone' ? 'tel' : 'text'}
          placeholder={prop.type === 'email' ? 'nombre@ejemplo.com' : ''}
          onCommit={(v) => {
            set(v.trim() ? v : null)
            onDone()
          }}
        />
      )
    case 'number':
      return (
        <NumberEditor
          initial={typeof value === 'number' ? value : null}
          percent={prop.numberFormat === 'percent'}
          onCommit={(n) => {
            set(n)
            onDone()
          }}
        />
      )
    case 'select':
    case 'status':
    case 'multi_select':
      return <OptionsEditor db={db} prop={prop} row={row} onDone={onDone} />
    case 'date':
      return (
        <DateEditor
          value={typeof value === 'string' ? value : null}
          onChange={(v) => {
            set(v)
            onDone()
          }}
        />
      )
    case 'person':
      return <PersonEditor selected={Array.isArray(value) ? value : []} onChange={(ids) => set(ids.length ? ids : null)} />
    case 'relation':
      return <RelationEditor prop={prop} row={row} selected={Array.isArray(value) ? value : []} onChange={(ids) => set(ids.length ? ids : null)} />
    case 'backlink':
      return <BacklinkEditor prop={prop} row={row} />
    default:
      return <p className="p-3 text-xs text-muted-foreground">Esta propiedad se calcula sola.</p>
  }
}

function TextEditor({
  initial,
  multiline,
  type,
  placeholder,
  onCommit,
}: {
  initial: string
  multiline: boolean
  type: string
  placeholder?: string
  onCommit: (v: string) => void
}) {
  const [draft, setDraft] = useState(initial)
  const committed = useRef(false)
  const draftRef = useRef(draft)
  draftRef.current = draft
  const onCommitRef = useRef(onCommit)
  onCommitRef.current = onCommit
  const commit = () => {
    if (committed.current) return
    committed.current = true
    onCommit(draft)
  }
  // Closing the popover (click outside, Esc) also saves, once.
  useEffect(
    () => () => {
      if (!committed.current && draftRef.current !== initial) onCommitRef.current(draftRef.current)
    },
    []
  )
  return multiline ? (
    <textarea
      autoFocus
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault()
          commit()
        }
      }}
      rows={3}
      placeholder={placeholder}
      className="block min-h-20 w-full resize-y bg-transparent p-2.5 text-sm outline-none"
    />
  ) : (
    <input
      autoFocus
      type={type}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit()
      }}
      placeholder={placeholder}
      className="block h-9 w-full bg-transparent px-2.5 text-sm outline-none"
    />
  )
}

function UrlEditor({ initial, onCommit }: { initial: string; onCommit: (v: string) => void }) {
  const [draft, setDraft] = useState(initial)
  const [uploading, setUploading] = useState(false)
  const committed = useRef(false)
  const draftRef = useRef(draft)
  draftRef.current = draft
  const onCommitRef = useRef(onCommit)
  onCommitRef.current = onCommit
  const fileRef = useRef<HTMLInputElement>(null)

  const commit = (v: string) => {
    if (committed.current) return
    committed.current = true
    onCommit(v)
  }
  // Closing the popover (click outside, Esc) also saves, once.
  useEffect(
    () => () => {
      if (!committed.current && draftRef.current !== initial) onCommitRef.current(draftRef.current)
    },
    []
  )

  async function upload(file: File) {
    if (file.size > 4 * 1024 * 1024) {
      toast.error('El archivo supera los 4 MB')
      return
    }
    setUploading(true)
    try {
      const res = await api.uploadFile(file)
      commit(res.url)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo subir el archivo')
    } finally {
      setUploading(false)
    }
  }

  const folder = isDriveFolderLink(draft)
  const drive = /drive\.google\.com|docs\.google\.com/i.test(draft)

  return (
    <div>
      <div className="flex items-center gap-1 pr-1">
        <input
          autoFocus
          type="url"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit(draft)
          }}
          placeholder="Pegá un enlace…"
          className="block h-9 w-full bg-transparent px-2.5 text-sm outline-none"
        />
        {draft && (
          <button
            type="button"
            onClick={() => setDraft('')}
            className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
            aria-label="Borrar enlace"
            title="Borrar"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      {folder ? (
        <p className="border-t border-border px-2.5 py-2 text-xs text-amber-600 dark:text-amber-400">
          Es el enlace de una <b>carpeta</b> de Drive: sirve como link, pero no se puede mostrar como imagen. Para una portada, abrí la
          imagen en Drive → Compartir → «Cualquier persona con el enlace» y pegá ese enlace, o subila acá abajo.
        </p>
      ) : drive ? (
        <p className="border-t border-border px-2.5 py-2 text-xs text-muted-foreground">
          Para que se vea como portada, la imagen tiene que estar compartida con «Cualquier persona con el enlace».
        </p>
      ) : null}
      <div className="border-t border-border p-1">
        <input
          ref={fileRef}
          type="file"
          accept="image/*,application/pdf"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            e.target.value = ''
            if (f) void upload(f)
          }}
        />
        <button
          type="button"
          disabled={uploading}
          onClick={() => fileRef.current?.click()}
          className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-accent disabled:opacity-60"
        >
          {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5 text-muted-foreground" />}
          {uploading ? 'Subiendo…' : 'Subir imagen o archivo (máx. 4 MB)'}
        </button>
      </div>
    </div>
  )
}

function NumberEditor({
  initial,
  percent,
  onCommit,
}: {
  initial: number | null
  percent: boolean
  onCommit: (n: number | null) => void
}) {
  // Percent values are stored as 0–1 but typed as 0–100.
  const shown = initial === null ? '' : String(percent ? Math.round(initial * 10000) / 100 : initial).replace('.', ',')
  const [draft, setDraft] = useState(shown)
  const done = useRef(false)
  const draftRef = useRef(draft)
  draftRef.current = draft
  const onCommitRef = useRef(onCommit)
  onCommitRef.current = onCommit
  const parse = (text: string) => {
    const n = parseNumberInput(text)
    return n === null ? null : percent ? n / 100 : n
  }
  const commit = () => {
    if (done.current) return
    done.current = true
    onCommit(parse(draft))
  }
  // Closing the popover also saves, once.
  useEffect(
    () => () => {
      if (!done.current && draftRef.current !== shown) onCommitRef.current(parse(draftRef.current))
    },
    []
  )
  return (
    <div className="flex items-center gap-1 px-2.5">
      <input
        autoFocus
        inputMode="decimal"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit()
        }}
        className="block h-9 w-full bg-transparent text-sm tabular-nums outline-none"
        placeholder={percent ? 'Ej: 75' : 'Ej: 1.250.000,50'}
      />
      {percent && <span className="text-sm text-muted-foreground">%</span>}
    </div>
  )
}

const COLOR_CYCLE = OPTION_COLORS.map((c) => c.id).filter((c) => c !== 'default')

function OptionsEditor({ db, prop, row, onDone }: { db: DatabaseDef; prop: PropertyDef; row: DbRow; onDone: () => void }) {
  const { ws } = useDb()
  const [query, setQuery] = useState('')
  const multi = prop.type === 'multi_select'
  const current = row.values[prop.id]
  const selected: string[] = multi ? (Array.isArray(current) ? current : []) : typeof current === 'string' ? [current] : []
  const options = prop.options ?? []
  const q = query.trim().toLowerCase()
  const filtered = q ? options.filter((o) => o.name.toLowerCase().includes(q)) : options
  const exact = options.some((o) => o.name.toLowerCase() === q)

  function choose(id: string) {
    if (multi) {
      const next = selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]
      ws.updateRowValues(row.id, { [prop.id]: next.length ? next : null })
      setQuery('')
    } else {
      ws.updateRowValues(row.id, { [prop.id]: selected[0] === id ? null : id })
      onDone()
    }
  }

  function create() {
    const name = query.trim()
    if (!name) return
    const option: SelectOption = { id: newId('opt'), name, color: COLOR_CYCLE[options.length % COLOR_CYCLE.length] }
    ws.updateDatabase(db.id, {
      properties: db.properties.map((p) => (p.id === prop.id ? { ...p, options: [...options, option] } : p)),
    })
    choose(option.id)
  }

  return (
    <div className="flex max-h-80 flex-col">
      <div className="flex flex-wrap items-center gap-1 border-b border-border p-2">
        {selected.map((id) => {
          const o = findOption(prop, id)
          return o ? <OptionChip key={id} option={o} onRemove={() => choose(id)} /> : null
        })}
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              if (filtered[0] && (exact || !q)) choose(filtered[0].id)
              else if (q) create()
            }
          }}
          placeholder={selected.length ? '' : 'Buscar o crear una opción'}
          className="min-w-20 flex-1 bg-transparent text-sm outline-none"
        />
      </div>
      <div className="overflow-y-auto p-1">
        <p className="px-2 py-1 text-[11px] text-muted-foreground">
          {multi ? 'Elegí una o más opciones' : 'Elegí una opción'}
        </p>
        {filtered.map((o) => (
          <button
            key={o.id}
            type="button"
            onClick={() => choose(o.id)}
            className="flex w-full items-center gap-2 rounded px-2 py-1 text-left hover:bg-accent"
          >
            <OptionChip option={o} />
            {selected.includes(o.id) && <Check className="ml-auto h-3.5 w-3.5 text-muted-foreground" />}
          </button>
        ))}
        {q && !exact && (
          <button
            type="button"
            onClick={create}
            className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-sm hover:bg-accent"
          >
            <Plus className="h-3.5 w-3.5 text-muted-foreground" />
            Crear <OptionChip option={{ name: query.trim(), color: COLOR_CYCLE[options.length % COLOR_CYCLE.length] }} />
          </button>
        )}
      </div>
    </div>
  )
}

function DateEditor({ value, onChange }: { value: string | null; onChange: (v: string | null) => void }) {
  const selected = value ? new Date(`${value.slice(0, 10)}T12:00:00`) : undefined
  const pad = (n: number) => String(n).padStart(2, '0')
  return (
    <div>
      <Calendar
        mode="single"
        locale={es}
        selected={selected}
        defaultMonth={selected}
        onSelect={(d) => onChange(d ? `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` : null)}
        className="mx-auto"
      />
      <div className="flex justify-between border-t border-border p-1.5">
        <button type="button" onClick={() => onChange(todayISO())} className="rounded px-2 py-1 text-xs hover:bg-accent">
          Hoy
        </button>
        <button type="button" onClick={() => onChange(null)} className="rounded px-2 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground">
          Borrar
        </button>
      </div>
    </div>
  )
}

function PersonEditor({ selected, onChange }: { selected: string[]; onChange: (ids: string[]) => void }) {
  const { people } = useDb()
  if (!people.length) return <p className="p-3 text-xs text-muted-foreground">Cargando personas…</p>
  return (
    <div className="max-h-72 overflow-y-auto p-1">
      <p className="px-2 py-1 text-[11px] text-muted-foreground">Personas con acceso a esta página</p>
      {people.map((p) => {
        const on = selected.includes(p.id)
        return (
          <button
            key={p.id}
            type="button"
            onClick={() => onChange(on ? selected.filter((x) => x !== p.id) : [...selected, p.id])}
            className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-accent"
          >
            <Avatar label={personLabel(p)} />
            <span className="min-w-0 flex-1 truncate">{personLabel(p)}</span>
            {on && <Check className="h-3.5 w-3.5 text-muted-foreground" />}
          </button>
        )
      })}
    </div>
  )
}

function RelationEditor({
  prop,
  row,
  selected,
  onChange,
}: {
  prop: PropertyDef
  row: DbRow
  selected: string[]
  onChange: (ids: string[]) => void
}) {
  const { getDatabase, ws } = useDb()
  const [query, setQuery] = useState('')
  const target = prop.relationDatabaseId ? getDatabase(prop.relationDatabaseId) : undefined
  const candidates = useMemo(() => {
    const q = query.trim().toLowerCase()
    return (target?.rows ?? [])
      .filter((r) => r.id !== row.id)
      .filter((r) => !q || r.title.toLowerCase().includes(q))
      .slice(0, 50)
  }, [target, query, row.id])

  if (!target) {
    return <p className="p-3 text-xs text-muted-foreground">Elegí la base relacionada en el menú de la propiedad.</p>
  }

  return (
    <div className="flex max-h-80 flex-col">
      <div className="flex items-center gap-2 border-b border-border px-2.5">
        <Search className="h-3.5 w-3.5 text-muted-foreground" />
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={`Buscar en ${target.title}`}
          className="h-9 flex-1 bg-transparent text-sm outline-none"
        />
      </div>
      <div className="overflow-y-auto p-1">
        {candidates.map((r) => {
          const on = selected.includes(r.id)
          return (
            <button
              key={r.id}
              type="button"
              onClick={() => onChange(on ? selected.filter((x) => x !== r.id) : [...selected, r.id])}
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-accent"
            >
              <span className="w-4 shrink-0 text-center text-xs">{r.icon || '📄'}</span>
              <span className="min-w-0 flex-1 truncate">{r.title || 'Sin título'}</span>
              {on && <Check className="h-3.5 w-3.5 text-muted-foreground" />}
            </button>
          )
        })}
        {query.trim() && !candidates.some((r) => r.title.toLowerCase() === query.trim().toLowerCase()) && (
          <button
            type="button"
            onClick={async () => {
              const created = await ws.createRow(target.id, { title: query.trim() })
              if (created) onChange([...selected, created.id])
              setQuery('')
            }}
            className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-accent"
          >
            <Plus className="h-3.5 w-3.5 text-muted-foreground" />
            Crear «{query.trim()}» en {target.title}
          </button>
        )}
        {!candidates.length && !query.trim() && (
          <p className="px-2 py-2 text-xs text-muted-foreground">{target.title} todavía no tiene filas.</p>
        )}
      </div>
    </div>
  )
}

/**
 * Edits a backlink from the "other side": linking a row here sets this row in
 * the source row's relation property (e.g. a task's "Proyecto").
 */
function BacklinkEditor({ prop, row }: { prop: PropertyDef; row: DbRow }) {
  const { getDatabase, ws } = useDb()
  const [query, setQuery] = useState('')
  const source = prop.backlinkDatabaseId ? getDatabase(prop.backlinkDatabaseId) : undefined
  const pid = prop.backlinkPropertyId
  const relationProp = source?.properties.find((p) => p.id === pid)

  const linkedIds = (r: DbRow): string[] => {
    const v = pid ? r.values[pid] : null
    return Array.isArray(v) ? v : []
  }

  const candidates = useMemo(() => {
    const q = query.trim().toLowerCase()
    const rows = (source?.rows ?? []).filter((r) => !q || r.title.toLowerCase().includes(q))
    // Linked rows first, then the rest in their usual order.
    return [...rows]
      .sort((a, b) => Number(linkedIds(b).includes(row.id)) - Number(linkedIds(a).includes(row.id)) || a.position - b.position)
      .slice(0, 80)
  }, [source, query, row.id, pid])

  if (!source || !pid || !relationProp) {
    return <p className="p-3 text-xs text-muted-foreground">La relación de origen ya no existe.</p>
  }

  function toggle(r: DbRow) {
    const cur = linkedIds(r)
    const next = cur.includes(row.id) ? cur.filter((x) => x !== row.id) : [...cur, row.id]
    ws.updateRowValues(r.id, { [pid!]: next.length ? next : null })
  }

  return (
    <div className="flex max-h-80 flex-col">
      <div className="flex items-center gap-2 border-b border-border px-2.5">
        <Search className="h-3.5 w-3.5 text-muted-foreground" />
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={`Buscar o crear en ${source.title}`}
          className="h-9 flex-1 bg-transparent text-sm outline-none"
        />
      </div>
      <div className="overflow-y-auto p-1">
        <p className="px-2 py-1 text-[11px] text-muted-foreground">
          Vincular filas de {source.icon} {source.title} (completa su «{relationProp.name}»)
        </p>
        {candidates.map((r) => {
          const on = linkedIds(r).includes(row.id)
          return (
            <button
              key={r.id}
              type="button"
              onClick={() => toggle(r)}
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-accent"
            >
              <span className="w-4 shrink-0 text-center text-xs">{r.icon || '📄'}</span>
              <span className="min-w-0 flex-1 truncate">{r.title || 'Sin título'}</span>
              {on && <Check className="h-3.5 w-3.5 text-muted-foreground" />}
            </button>
          )
        })}
        {query.trim() && !candidates.some((r) => r.title.toLowerCase() === query.trim().toLowerCase()) && (
          <button
            type="button"
            onClick={async () => {
              await ws.createRow(source.id, { title: query.trim(), values: { [pid]: [row.id] } })
              setQuery('')
            }}
            className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-accent"
          >
            <Plus className="h-3.5 w-3.5 text-muted-foreground" />
            Crear «{query.trim()}» en {source.title}
          </button>
        )}
        {!candidates.length && !query.trim() && (
          <p className="px-2 py-2 text-xs text-muted-foreground">Escribí un nombre para crear la primera.</p>
        )}
      </div>
    </div>
  )
}
