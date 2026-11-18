'use client'

import { useState } from 'react'
import { ArrowUpDown, Download, Eye, EyeOff, FileText, ListFilter, Plus, Search, SlidersHorizontal, X } from 'lucide-react'
import { viewRows } from '@/lib/db-resolve'
import { exportFileName, printHtml, viewPrintHtml } from '@/lib/db-export'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { PropertyIcon } from '@/components/db/property-menu'
import { OptionChip } from '@/components/db/chips'
import { personLabel, useDb } from '@/components/db/db-context'
import {
  filterOpsFor,
  getProperty,
  makeView,
  newId,
  VIEW_TYPE_LABELS,
  type DatabaseDef,
  type Filter,
  type FilterOp,
  type PropertyDef,
  type Sort,
  type ViewDef,
  type ViewType,
} from '@/lib/db-types'
import { cn } from '@/lib/utils'

/* ------------------------------------------------------------------ */
/* Filter editor (also used by dashboard stat cards)                   */
/* ------------------------------------------------------------------ */

export function FilterEditor({
  db,
  filters,
  onChange,
}: {
  db: DatabaseDef
  filters: Filter[]
  onChange: (filters: Filter[]) => void
}) {
  const filterable = db.properties
  function addFilter() {
    const prop = filterable.find((p) => p.type === 'select' || p.type === 'status') ?? filterable[0]
    if (!prop) return
    onChange([...filters, { id: newId('f'), propertyId: prop.id, op: filterOpsFor(prop.type)[0].op, value: null }])
  }
  function patch(id: string, p: Partial<Filter>) {
    onChange(filters.map((f) => (f.id === id ? { ...f, ...p } : f)))
  }
  return (
    <div className="space-y-2">
      {filters.length === 0 && <p className="text-xs text-muted-foreground">Sin filtros: se muestran todas las filas.</p>}
      {filters.map((f, i) => {
        const prop = getProperty(db, f.propertyId)
        const ops = prop ? filterOpsFor(prop.type) : []
        const opDef = ops.find((o) => o.op === f.op)
        return (
          <div key={f.id} className="flex flex-wrap items-center gap-1 rounded border border-border p-1.5">
            <span className="w-6 text-[11px] text-muted-foreground">{i === 0 ? 'Si' : 'y'}</span>
            <select
              value={f.propertyId}
              onChange={(e) => {
                const np = getProperty(db, e.target.value)
                if (np) patch(f.id, { propertyId: np.id, op: filterOpsFor(np.type)[0].op, value: null })
              }}
              className="max-w-32 truncate rounded bg-muted/60 px-1 py-1 text-xs outline-none"
              aria-label="Propiedad"
            >
              {filterable.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <select
              value={f.op}
              onChange={(e) => patch(f.id, { op: e.target.value as FilterOp })}
              className="rounded bg-muted/60 px-1 py-1 text-xs outline-none"
              aria-label="Condición"
            >
              {ops.map((o) => (
                <option key={o.op} value={o.op}>
                  {o.label}
                </option>
              ))}
            </select>
            {prop && opDef?.needsValue && (
              <FilterValueInput prop={prop} value={f.value ?? null} onChange={(value) => patch(f.id, { value })} />
            )}
            <button
              type="button"
              onClick={() => onChange(filters.filter((x) => x.id !== f.id))}
              className="ml-auto rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
              aria-label="Quitar filtro"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )
      })}
      <button
        type="button"
        onClick={addFilter}
        className="flex items-center gap-1 rounded px-1.5 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
      >
        <Plus className="h-3.5 w-3.5" />
        Agregar filtro
      </button>
    </div>
  )
}

function FilterValueInput({
  prop,
  value,
  onChange,
}: {
  prop: PropertyDef
  value: string | number | null
  onChange: (v: string | number | null) => void
}) {
  const { people, getDatabase } = useDb()
  const cls = 'min-w-0 flex-1 rounded bg-muted/60 px-1.5 py-1 text-xs outline-none'
  if (prop.options) {
    return (
      <select value={value ?? ''} onChange={(e) => onChange(e.target.value || null)} className={cls} aria-label="Valor">
        <option value="">Elegí…</option>
        {prop.options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </select>
    )
  }
  if (prop.type === 'person') {
    return (
      <select value={value ?? ''} onChange={(e) => onChange(e.target.value || null)} className={cls} aria-label="Valor">
        <option value="">Elegí…</option>
        {people.map((p) => (
          <option key={p.id} value={p.id}>
            {personLabel(p)}
          </option>
        ))}
      </select>
    )
  }
  if (prop.type === 'relation') {
    const target = prop.relationDatabaseId ? getDatabase(prop.relationDatabaseId) : undefined
    return (
      <select value={value ?? ''} onChange={(e) => onChange(e.target.value || null)} className={cls} aria-label="Valor">
        <option value="">Elegí…</option>
        {(target?.rows ?? []).map((r) => (
          <option key={r.id} value={r.id}>
            {r.title || 'Sin título'}
          </option>
        ))}
      </select>
    )
  }
  if (prop.type === 'date' || prop.type === 'created_time' || prop.type === 'updated_time') {
    return (
      <span className="flex min-w-0 flex-1 items-center gap-1">
        <select
          value={value === 'today' ? 'today' : 'exact'}
          onChange={(e) => onChange(e.target.value === 'today' ? 'today' : null)}
          className="rounded bg-muted/60 px-1 py-1 text-xs outline-none"
          aria-label="Tipo de fecha"
        >
          <option value="today">hoy</option>
          <option value="exact">fecha exacta</option>
        </select>
        {value !== 'today' && (
          <input type="date" value={typeof value === 'string' ? value : ''} onChange={(e) => onChange(e.target.value || null)} className={cls} />
        )}
      </span>
    )
  }
  if (prop.type === 'number' || prop.type === 'formula') {
    return (
      <input
        type="number"
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
        className={cls}
        aria-label="Valor"
      />
    )
  }
  return (
    <input value={value ?? ''} onChange={(e) => onChange(e.target.value)} placeholder="Valor" className={cls} aria-label="Valor" />
  )
}

/* ------------------------------------------------------------------ */
/* Toolbar                                                              */
/* ------------------------------------------------------------------ */

export function ViewToolbar({
  db,
  view,
  search,
  onSearch,
  onNew,
}: {
  db: DatabaseDef
  view: ViewDef
  search: string
  onSearch: (q: string) => void
  onNew: () => void
}) {
  const { ws, ctx, people } = useDb()
  const [searchOpen, setSearchOpen] = useState(!!search)
  const [downloadOpen, setDownloadOpen] = useState(false)

  /** Exactly what the view shows (filters, sorts and search applied). */
  function downloadPdf() {
    setDownloadOpen(false)
    const rows = viewRows(ctx, db, view, search)
    const fileName = exportFileName(db, view)
    printHtml(viewPrintHtml({ ctx, db, view, rows, people, pageTitle: ws.page?.title, docTitle: fileName }), fileName)
  }

  function patchView(patch: Partial<ViewDef>) {
    ws.updateDatabase(db.id, { views: db.views.map((v) => (v.id === view.id ? { ...v, ...patch } : v)) })
  }

  const btn = 'flex h-7 items-center gap-1 rounded px-1.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground'

  return (
    <div className="flex items-center gap-0.5">
      <Popover>
        <PopoverTrigger asChild>
          <button type="button" className={cn(btn, view.filters.length > 0 && 'text-primary')} title="Filtrar">
            <ListFilter className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Filtrar</span>
            {view.filters.length > 0 && <span className="tabular-nums">{view.filters.length}</span>}
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-[22rem] max-w-[calc(100vw-2rem)] p-3">
          <FilterEditor db={db} filters={view.filters} onChange={(filters) => patchView({ filters })} />
        </PopoverContent>
      </Popover>

      <Popover>
        <PopoverTrigger asChild>
          <button type="button" className={cn(btn, view.sorts.length > 0 && 'text-primary')} title="Ordenar">
            <ArrowUpDown className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Ordenar</span>
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-80 max-w-[calc(100vw-2rem)] p-3">
          <SortEditor db={db} sorts={view.sorts} onChange={(sorts) => patchView({ sorts })} />
        </PopoverContent>
      </Popover>

      {searchOpen ? (
        <div className="flex h-7 items-center gap-1 rounded border border-border px-1.5">
          <Search className="h-3.5 w-3.5 text-muted-foreground" />
          <input
            autoFocus
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                onSearch('')
                setSearchOpen(false)
              }
            }}
            placeholder="Buscar…"
            className="w-28 bg-transparent text-xs outline-none"
          />
          <button
            type="button"
            onClick={() => {
              onSearch('')
              setSearchOpen(false)
            }}
            className="text-muted-foreground hover:text-foreground"
            aria-label="Cerrar búsqueda"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      ) : (
        <button type="button" className={btn} onClick={() => setSearchOpen(true)} title="Buscar en esta vista" aria-label="Buscar en esta vista">
          <Search className="h-3.5 w-3.5" />
        </button>
      )}

      <Popover open={downloadOpen} onOpenChange={setDownloadOpen}>
        <PopoverTrigger asChild>
          <button type="button" className={btn} title="Descargar esta vista" aria-label="Descargar esta vista">
            <Download className="h-3.5 w-3.5" />
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-64 p-1">
          <p className="px-2 pb-1 pt-1.5 text-[11px] font-medium text-muted-foreground">Descargar «{view.name}»</p>
          <button
            type="button"
            onClick={downloadPdf}
            className="flex w-full items-start gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-accent"
          >
            <FileText className="mt-0.5 h-4 w-4 shrink-0 text-[#ff3b30]" />
            <span>
              PDF
              <span className="block text-[11px] text-muted-foreground">En el diálogo elegí «Guardar como PDF»</span>
            </span>
          </button>
        </PopoverContent>
      </Popover>

      <Popover>
        <PopoverTrigger asChild>
          <button type="button" className={btn} title="Configurar vista" aria-label="Configurar vista">
            <SlidersHorizontal className="h-3.5 w-3.5" />
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-72 p-0">
          <ViewSettings db={db} view={view} onChange={patchView} />
        </PopoverContent>
      </Popover>

      <Button size="sm" className="ml-1 h-7 bg-primary px-2.5 text-xs text-white hover:bg-primary/90" onClick={onNew}>
        Nuevo
      </Button>
    </div>
  )
}

function SortEditor({ db, sorts, onChange }: { db: DatabaseDef; sorts: Sort[]; onChange: (s: Sort[]) => void }) {
  return (
    <div className="space-y-2">
      {sorts.length === 0 && <p className="text-xs text-muted-foreground">Sin orden: se respeta el orden de creación.</p>}
      {sorts.map((s, i) => (
        <div key={`${s.propertyId}-${i}`} className="flex items-center gap-1">
          <select
            value={s.propertyId}
            onChange={(e) => onChange(sorts.map((x, j) => (j === i ? { ...x, propertyId: e.target.value } : x)))}
            className="min-w-0 flex-1 truncate rounded bg-muted/60 px-1 py-1 text-xs outline-none"
            aria-label="Propiedad"
          >
            {db.properties.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <select
            value={s.direction}
            onChange={(e) => onChange(sorts.map((x, j) => (j === i ? { ...x, direction: e.target.value as Sort['direction'] } : x)))}
            className="rounded bg-muted/60 px-1 py-1 text-xs outline-none"
            aria-label="Dirección"
          >
            <option value="asc">Ascendente</option>
            <option value="desc">Descendente</option>
          </select>
          <button
            type="button"
            onClick={() => onChange(sorts.filter((_, j) => j !== i))}
            className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
            aria-label="Quitar orden"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => {
          const used = new Set(sorts.map((s) => s.propertyId))
          const prop = db.properties.find((p) => !used.has(p.id)) ?? db.properties[0]
          onChange([...sorts, { propertyId: prop.id, direction: 'asc' }])
        }}
        className="flex items-center gap-1 rounded px-1.5 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
      >
        <Plus className="h-3.5 w-3.5" />
        Agregar orden
      </button>
    </div>
  )
}

const VIEW_TYPES: ViewType[] = ['table', 'board', 'gallery', 'calendar', 'timeline', 'list']

function ViewSettings({ db, view, onChange }: { db: DatabaseDef; view: ViewDef; onChange: (p: Partial<ViewDef>) => void }) {
  const groupable = db.properties.filter((p) => p.type === 'select' || p.type === 'status' || p.type === 'checkbox' || p.type === 'person')
  const dates = db.properties.filter((p) => p.type === 'date' || p.type === 'created_time' || p.type === 'updated_time')
  const urls = db.properties.filter((p) => p.type === 'url')
  const nonTitle = db.properties.filter((p) => p.type !== 'title')
  const visible = new Set(view.visibleProperties)
  const ordered = [
    ...view.visibleProperties.map((id) => getProperty(db, id)).filter(Boolean),
    ...nonTitle.filter((p) => !visible.has(p.id)),
  ] as PropertyDef[]
  const selectCls = 'ml-auto max-w-36 truncate rounded bg-muted/60 px-1.5 py-1 text-sm outline-none'

  return (
    <div className="max-h-[70vh] overflow-y-auto">
      <div className="space-y-1 border-b border-border p-2">
        <label className="flex items-center gap-2 px-2 text-sm">
          <span className="text-muted-foreground">Nombre</span>
          <input
            defaultValue={view.name}
            onBlur={(e) => {
              const v = e.target.value.trim()
              if (v && v !== view.name) onChange({ name: v })
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
            }}
            className="ml-auto h-7 w-36 rounded bg-muted/60 px-1.5 text-sm outline-none"
          />
        </label>
        <label className="flex items-center gap-2 px-2 text-sm">
          <span className="text-muted-foreground">Ícono</span>
          <input
            defaultValue={view.icon ?? ''}
            maxLength={4}
            onBlur={(e) => onChange({ icon: e.target.value.trim() || undefined })}
            placeholder="🙂"
            className="ml-auto h-7 w-14 rounded bg-muted/60 px-1.5 text-center text-sm outline-none"
          />
        </label>
        <label className="flex items-center gap-2 px-2 text-sm">
          <span className="text-muted-foreground">Diseño</span>
          <select
            value={view.type}
            onChange={(e) => {
              const type = e.target.value as ViewType
              const patch: Partial<ViewDef> = { type }
              if (type === 'board' && !view.groupBy) patch.groupBy = groupable[0]?.id
              if (type === 'calendar' && !view.dateProperty) patch.dateProperty = dates[0]?.id
              if (type === 'gallery' && !view.coverProperty) patch.coverProperty = urls[0]?.id
              if (type === 'timeline' && !view.dateProperty) {
                const v = makeView('timeline', db)
                patch.dateProperty = v.dateProperty
                patch.endDateProperty = v.endDateProperty
              }
              onChange(patch)
            }}
            className={selectCls}
          >
            {VIEW_TYPES.map((t) => (
              <option key={t} value={t}>
                {VIEW_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </label>
        {view.type === 'board' && (
          <label className="flex items-center gap-2 px-2 text-sm">
            <span className="text-muted-foreground">Agrupar por</span>
            <select value={view.groupBy ?? ''} onChange={(e) => onChange({ groupBy: e.target.value || undefined })} className={selectCls}>
              <option value="">Elegí…</option>
              {groupable.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
        )}
        {view.type === 'calendar' && (
          <label className="flex items-center gap-2 px-2 text-sm">
            <span className="text-muted-foreground">Fecha</span>
            <select value={view.dateProperty ?? ''} onChange={(e) => onChange({ dateProperty: e.target.value || undefined })} className={selectCls}>
              <option value="">Elegí…</option>
              {dates.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
        )}
        {view.type === 'timeline' && (
          <>
            <label className="flex items-center gap-2 px-2 text-sm">
              <span className="text-muted-foreground">Inicio</span>
              <select value={view.dateProperty ?? ''} onChange={(e) => onChange({ dateProperty: e.target.value || undefined })} className={selectCls}>
                <option value="">Elegí…</option>
                {dates.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2 px-2 text-sm">
              <span className="text-muted-foreground">Fin</span>
              <select value={view.endDateProperty ?? ''} onChange={(e) => onChange({ endDateProperty: e.target.value || undefined })} className={selectCls}>
                <option value="">Sin fecha de fin</option>
                {dates
                  .filter((p) => p.id !== view.dateProperty)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
              </select>
            </label>
          </>
        )}
        {view.type === 'gallery' && (
          <label className="flex items-center gap-2 px-2 text-sm">
            <span className="text-muted-foreground">Portada</span>
            <select value={view.coverProperty ?? ''} onChange={(e) => onChange({ coverProperty: e.target.value || undefined })} className={selectCls}>
              <option value="">Sin portada</option>
              {urls.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      <div className="p-2">
        <p className="px-2 pb-1 text-[11px] font-medium text-muted-foreground">Propiedades visibles</p>
        {ordered.map((p) => {
          const on = visible.has(p.id)
          return (
            <button
              key={p.id}
              type="button"
              onClick={() =>
                onChange({
                  visibleProperties: on ? view.visibleProperties.filter((id) => id !== p.id) : [...view.visibleProperties, p.id],
                })
              }
              className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-sm hover:bg-accent"
            >
              <PropertyIcon type={p.type} />
              <span className={cn('min-w-0 flex-1 truncate', !on && 'text-muted-foreground')}>{p.name}</span>
              {on ? <Eye className="h-3.5 w-3.5 text-muted-foreground" /> : <EyeOff className="h-3.5 w-3.5 text-muted-foreground/60" />}
            </button>
          )
        })}
      </div>
    </div>
  )
}

/** Compact description of active filters (shown under linked views). */
export function FilterSummary({ db, filters }: { db: DatabaseDef; filters: Filter[] }) {
  if (!filters.length) return null
  return (
    <span className="flex flex-wrap items-center gap-1 text-[11px] text-muted-foreground">
      {filters.map((f) => {
        const prop = getProperty(db, f.propertyId)
        const op = prop ? filterOpsFor(prop.type).find((o) => o.op === f.op) : undefined
        const option = prop?.options?.find((o) => o.id === f.value)
        return (
          <span key={f.id} className="inline-flex items-center gap-1 rounded-full border border-border px-1.5 py-px">
            {prop?.name} {op?.label} {option ? <OptionChip option={option} className="py-0 text-[10px] leading-4" /> : op?.needsValue ? String(f.value ?? '') : ''}
          </span>
        )
      })}
    </span>
  )
}
