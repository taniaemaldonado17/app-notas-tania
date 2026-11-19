'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronRight,
  FileUp,
  Heading,
  LayoutGrid,
  Loader2,
  MoreHorizontal,
  Pencil,
  Plus,
  PlusCircle,
  Settings2,
  Table2,
  Trash2,
  Zap,
} from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { TopBar, CoverBanner } from '@/components/top-bar'
import { DbProvider, useDb, type DbContextValue, type Person } from '@/components/db/db-context'
import { DatabaseBlock } from '@/components/db/database-block'
import { RowPanel } from '@/components/db/row-panel'
import { ImportDialog } from '@/components/db/import-dialog'
import { FilterEditor } from '@/components/db/view-toolbar'
import { ColorDot } from '@/components/db/chips'
import { useDatabasesPage } from '@/hooks/use-databases-page'
import { useWorkspace } from '@/lib/workspace-store'
import { resolveValue, rowMatchesFilters, type ResolveCtx } from '@/lib/db-resolve'
import * as api from '@/lib/api'
import {
  formatNumber,
  getProperty,
  newId,
  OPTION_COLORS,
  type DatabaseDef,
  type LayoutSection,
  type OptionColor,
  type PageLayout,
  type QuickAction,
  type RowValue,
  type StatItem,
} from '@/lib/db-types'
import { cn } from '@/lib/utils'

type Props = {
  pageId: string
  memberCount: number
  onShare: () => void
  onPageMetaChange: (payload: { title?: string; icon?: string | null }) => void
}

export function DatabasesWorkspace({ pageId, memberCount, onShare, onPageMetaChange }: Props) {
  const ws = useDatabasesPage(pageId)
  const selectedRowId = useWorkspace((s) => s.selectedRowId)
  const openRow = useWorkspace((s) => s.openRow)
  const closeRow = useWorkspace((s) => s.closeRow)
  const [people, setPeople] = useState<Person[]>([])
  const { refresh } = ws

  // People who can be assigned: owner + members of this page.
  useEffect(() => {
    let cancelled = false
    api
      .fetchShare(pageId)
      .then((s) => {
        if (!cancelled) setPeople([s.owner, ...s.members])
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [pageId])

  // Pick up collaborators' changes.
  useEffect(() => {
    function onFocus() {
      if (document.visibilityState === 'visible') refresh()
    }
    const timer = window.setInterval(onFocus, 10_000)
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onFocus)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onFocus)
    }
  }, [refresh])

  const page = ws.page
  const databases = useMemo(() => page?.databases ?? [], [page?.databases])
  const value: DbContextValue = useMemo(
    () => ({
      ws,
      ctx: { databases } as ResolveCtx,
      people,
      openRow,
      getDatabase: (id: string) => databases.find((d) => d.id === id),
    }),
    [ws, databases, people, openRow]
  )

  return (
    <DbProvider value={value}>
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar page={page ?? null} memberCount={memberCount} onShare={onShare} showFilter={false} onRestored={() => void ws.refresh()} />
        <main className="flex flex-1 flex-col">
          {ws.error ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 py-20 text-center text-sm text-muted-foreground">
              <p>No se pudo abrir esta página. Puede que ya no tengas acceso.</p>
              <p>Elegí otra en el menú de la izquierda.</p>
            </div>
          ) : ws.loading || !page ? (
            <div className="flex flex-1 items-center justify-center py-20">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              <CoverBanner
                key={page.id}
                page={page}
                onCoverChange={async (url) => ws.updatePageMeta({ coverUrl: url })}
                onTitleChange={async (title) => {
                  onPageMetaChange({ title })
                  await ws.updatePageMeta({ title })
                }}
                onSubtitleChange={async (subtitle) => ws.updatePageMeta({ subtitle })}
                onIconChange={async (icon) => {
                  onPageMetaChange({ icon })
                  await ws.updatePageMeta({ icon })
                }}
              />
              <Dashboard databases={databases} layout={page.layout ?? { sections: [], showSources: true }} />
            </>
          )}
        </main>
        <RowPanel rowId={selectedRowId} onClose={closeRow} />
      </div>
    </DbProvider>
  )
}

/* ------------------------------------------------------------------ */
/* Dashboard                                                            */
/* ------------------------------------------------------------------ */

function Dashboard({ databases, layout }: { databases: DatabaseDef[]; layout: PageLayout }) {
  const { ws } = useDb()
  const hasViews = layout.sections.length > 0
  const [sourcesOpen, setSourcesOpen] = useState(!hasViews)
  const [importOpen, setImportOpen] = useState(false)

  function save(sections: LayoutSection[]) {
    ws.updateLayout({ ...layout, sections })
  }
  function patchSection(id: string, patch: Partial<LayoutSection>) {
    save(layout.sections.map((s) => (s.id === id ? ({ ...s, ...patch } as LayoutSection) : s)))
  }
  function move(id: string, delta: number) {
    const i = layout.sections.findIndex((s) => s.id === id)
    const j = i + delta
    if (i < 0 || j < 0 || j >= layout.sections.length) return
    const next = [...layout.sections]
    ;[next[i], next[j]] = [next[j], next[i]]
    save(next)
  }
  function remove(id: string) {
    save(layout.sections.filter((s) => s.id !== id))
  }

  return (
    <div className="mx-auto w-full max-w-[1800px] space-y-8 px-4 pb-16 sm:px-8">
      {layout.sections.map((s, i) => (
        <SectionFrame
          key={s.id}
          section={s}
          first={i === 0}
          last={i === layout.sections.length - 1}
          onMove={(d) => move(s.id, d)}
          onRemove={() => remove(s.id)}
        >
          {s.type === 'stats' && <StatsSection section={s} databases={databases} onChange={(items) => patchSection(s.id, { items })} />}
          {s.type === 'actions' && <ActionsSection section={s} databases={databases} onChange={(items) => patchSection(s.id, { items })} />}
          {s.type === 'heading' && (
            <input
              defaultValue={s.text}
              onBlur={(e) => {
                const t = e.target.value.trim()
                if (t !== s.text) patchSection(s.id, { text: t })
              }}
              placeholder="Título"
              className="w-full bg-transparent text-2xl font-semibold outline-none"
            />
          )}
          {s.type === 'view' && <ViewSection section={s} databases={databases} onChange={(p) => patchSection(s.id, p)} />}
        </SectionFrame>
      ))}

      <AddSectionMenu databases={databases} onAdd={(section) => save([...layout.sections, section])} />

      {/* Source databases */}
      <section className="space-y-4 border-t border-border pt-6">
        <button
          type="button"
          onClick={() => setSourcesOpen((o) => !o)}
          className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
          aria-expanded={sourcesOpen}
        >
          {sourcesOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          <Settings2 className="h-4 w-4" />
          Bases de datos de origen ({databases.length})
        </button>
        {sourcesOpen && (
          <div className="space-y-10">
            {databases.map((d) => (
              <DatabaseBlock key={d.id} db={d} />
            ))}
            <div className="flex flex-wrap items-center gap-1">
              <button
                type="button"
                onClick={() => ws.createDatabase()}
                className="flex items-center gap-1.5 rounded px-2 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <Plus className="h-4 w-4" />
                Nueva base de datos
              </button>
              <button
                type="button"
                onClick={() => setImportOpen(true)}
                className="flex items-center gap-1.5 rounded px-2 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <FileUp className="h-4 w-4" />
                Importar CSV
              </button>
            </div>
          </div>
        )}
      </section>
      <ImportDialog open={importOpen} onOpenChange={setImportOpen} />
    </div>
  )
}


function SectionFrame({
  section,
  first,
  last,
  onMove,
  onRemove,
  children,
}: {
  section: LayoutSection
  first: boolean
  last: boolean
  onMove: (delta: number) => void
  onRemove: () => void
  children: React.ReactNode
}) {
  const label =
    section.type === 'stats' ? 'indicadores' : section.type === 'actions' ? 'acciones rápidas' : section.type === 'heading' ? 'título' : 'vista'
  return (
    <div className="group/section relative">
      <div className="absolute -top-3 right-0 z-10 flex items-center gap-0.5 rounded-md border border-border bg-popover p-0.5 opacity-0 shadow-sm transition focus-within:opacity-100 group-hover/section:opacity-100">
        <button type="button" disabled={first} onClick={() => onMove(-1)} className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-30" aria-label={`Subir ${label}`} title="Subir">
          <ArrowUp className="h-3.5 w-3.5" />
        </button>
        <button type="button" disabled={last} onClick={() => onMove(1)} className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-30" aria-label={`Bajar ${label}`} title="Bajar">
          <ArrowDown className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={() => {
            if (window.confirm(`¿Quitar este bloque de ${label} de la página? Los datos no se borran.`)) onRemove()
          }}
          className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-destructive"
          aria-label={`Quitar ${label}`}
          title="Quitar de la página"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
      {children}
    </div>
  )
}

/* ------------------------------ View section ------------------------------ */

function ViewSection({
  section,
  databases,
  onChange,
}: {
  section: Extract<LayoutSection, { type: 'view' }>
  databases: DatabaseDef[]
  onChange: (p: Partial<Extract<LayoutSection, { type: 'view' }>>) => void
}) {
  const db = databases.find((d) => d.id === section.databaseId)
  const view = db?.views.find((v) => v.id === section.viewId)
  const [editing, setEditing] = useState(false)

  const heading = (
    <div className="flex min-w-0 items-center gap-2">
      {editing ? (
        <span className="flex items-center gap-1">
          <input
            defaultValue={section.icon ?? ''}
            maxLength={4}
            onBlur={(e) => onChange({ icon: e.target.value.trim() || undefined })}
            className="h-8 w-10 rounded bg-muted/60 text-center text-lg outline-none"
            aria-label="Ícono"
          />
          <input
            autoFocus
            defaultValue={section.title}
            onBlur={(e) => {
              const t = e.target.value.trim()
              if (t && t !== section.title) onChange({ title: t })
              setEditing(false)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
            }}
            className="h-8 rounded bg-muted/60 px-2 text-xl font-semibold outline-none"
          />
        </span>
      ) : (
        <h2 className="flex min-w-0 items-center gap-2 text-xl font-semibold" onDoubleClick={() => setEditing(true)}>
          {section.icon && <span>{section.icon}</span>}
          <span className="truncate">{section.title}</span>
        </h2>
      )}
      {!editing && (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="rounded p-1 text-muted-foreground opacity-0 hover:bg-accent hover:text-foreground focus-visible:opacity-100 group-hover/section:opacity-100"
          aria-label="Cambiar título"
          title="Cambiar título"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  )

  if (!db || !view) {
    return (
      <div className="space-y-2">
        {heading}
        <p className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
          La vista de esta sección ya no existe. Podés quitar el bloque o elegir otra vista.
        </p>
      </div>
    )
  }

  return <DatabaseBlock db={db} fixedViewId={view.id} heading={heading} />
}

/* ------------------------------ Stats section ------------------------------ */

function computeStat(item: StatItem, databases: DatabaseDef[]): string {
  const db = databases.find((d) => d.id === item.databaseId)
  if (!db) return '—'
  const ctx: ResolveCtx = { databases }
  const rows = db.rows.filter((r) => rowMatchesFilters(ctx, db, r, item.filters))
  if (item.aggregate === 'sum') {
    const prop = item.propertyId ? getProperty(db, item.propertyId) : undefined
    if (!prop) return '—'
    const total = rows.reduce((s, r) => {
      const v = resolveValue(ctx, db, r, prop)
      return s + (typeof v === 'number' ? v : 0)
    }, 0)
    // Big round amounts read better without ",00" on a dashboard tile.
    return formatNumber(total, prop.numberFormat).replace(/,00(?=\D*$)/, '')
  }
  return String(rows.length)
}

function StatsSection({
  section,
  databases,
  onChange,
}: {
  section: Extract<LayoutSection, { type: 'stats' }>
  databases: DatabaseDef[]
  onChange: (items: StatItem[]) => void
}) {
  function addStat() {
    const db = databases[0]
    if (!db) return
    onChange([...section.items, { id: newId('stat'), label: 'Total', icon: '📊', color: 'gray', databaseId: db.id, aggregate: 'count', filters: [] }])
  }
  return (
    <div className="space-y-1">
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {section.items.map((item) => (
        <Popover key={item.id}>
          <PopoverTrigger asChild>
            <button
              type="button"
              data-opt-color={item.color}
              className="flex min-h-28 flex-col justify-between rounded-xl p-4 text-left transition hover:brightness-110"
              title="Configurar indicador"
            >
              <span className="flex items-center gap-2 text-sm">
                {item.icon && <span>{item.icon}</span>}
                <span className="truncate">{item.label}</span>
              </span>
              <span className="mt-3 truncate text-[clamp(1.2rem,1.9vw,1.875rem)] font-semibold tabular-nums tracking-tight">{computeStat(item, databases)}</span>
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-[22rem] max-w-[calc(100vw-2rem)] p-3">
            <StatEditor
              item={item}
              databases={databases}
              onChange={(next) => onChange(section.items.map((x) => (x.id === item.id ? next : x)))}
              onRemove={() => onChange(section.items.filter((x) => x.id !== item.id))}
            />
          </PopoverContent>
        </Popover>
      ))}
      {section.items.length === 0 && (
        <button
          type="button"
          onClick={addStat}
          className="flex min-h-28 items-center justify-center gap-1 rounded-xl border border-dashed border-border text-sm text-muted-foreground hover:bg-accent/40 hover:text-foreground"
        >
          <Plus className="h-4 w-4" />
          Indicador
        </button>
      )}
    </div>
      {section.items.length > 0 && (
        <button
          type="button"
          onClick={addStat}
          className="flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-muted-foreground opacity-0 hover:bg-accent hover:text-foreground focus-visible:opacity-100 group-hover/section:opacity-100"
        >
          <Plus className="h-3.5 w-3.5" />
          Agregar indicador
        </button>
      )}
    </div>
  )
}

function StatEditor({
  item,
  databases,
  onChange,
  onRemove,
}: {
  item: StatItem
  databases: DatabaseDef[]
  onChange: (s: StatItem) => void
  onRemove: () => void
}) {
  const db = databases.find((d) => d.id === item.databaseId)
  const numeric = db?.properties.filter((p) => p.type === 'number' || p.type === 'formula') ?? []
  const row = 'flex items-center gap-2 text-sm'
  const field = 'ml-auto rounded bg-muted/60 px-1.5 py-1 text-sm outline-none'
  return (
    <div className="space-y-2">
      <label className={row}>
        <span className="text-muted-foreground">Nombre</span>
        <input defaultValue={item.label} onBlur={(e) => onChange({ ...item, label: e.target.value.trim() || item.label })} className={cn(field, 'w-44')} />
      </label>
      <label className={row}>
        <span className="text-muted-foreground">Ícono</span>
        <input defaultValue={item.icon ?? ''} maxLength={4} onBlur={(e) => onChange({ ...item, icon: e.target.value.trim() || undefined })} className={cn(field, 'w-14 text-center')} />
      </label>
      <div className={row}>
        <span className="text-muted-foreground">Color</span>
        <span className="ml-auto flex flex-wrap justify-end gap-1">
          {OPTION_COLORS.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => onChange({ ...item, color: c.id as OptionColor })}
              className={cn('rounded p-0.5', item.color === c.id && 'ring-2 ring-ring')}
              aria-label={c.label}
              title={c.label}
            >
              <ColorDot color={c.id} />
            </button>
          ))}
        </span>
      </div>
      <label className={row}>
        <span className="text-muted-foreground">Base</span>
        <select value={item.databaseId} onChange={(e) => onChange({ ...item, databaseId: e.target.value, filters: [], propertyId: undefined })} className={field}>
          {databases.map((d) => (
            <option key={d.id} value={d.id}>
              {d.title}
            </option>
          ))}
        </select>
      </label>
      <label className={row}>
        <span className="text-muted-foreground">Cálculo</span>
        <select
          value={item.aggregate === 'sum' ? `sum:${item.propertyId ?? ''}` : 'count'}
          onChange={(e) => {
            const v = e.target.value
            if (v === 'count') onChange({ ...item, aggregate: 'count', propertyId: undefined })
            else onChange({ ...item, aggregate: 'sum', propertyId: v.slice(4) })
          }}
          className={field}
        >
          <option value="count">Cantidad de filas</option>
          {numeric.map((p) => (
            <option key={p.id} value={`sum:${p.id}`}>
              Suma de {p.name}
            </option>
          ))}
        </select>
      </label>
      {db && (
        <div className="space-y-1 border-t border-border pt-2">
          <p className="text-[11px] font-medium text-muted-foreground">Contar solo las filas que cumplen</p>
          <FilterEditor db={db} filters={item.filters} onChange={(filters) => onChange({ ...item, filters })} />
        </div>
      )}
      <button type="button" onClick={onRemove} className="flex items-center gap-1.5 rounded px-1.5 py-1 text-xs text-destructive hover:bg-accent">
        <Trash2 className="h-3.5 w-3.5" />
        Quitar indicador
      </button>
    </div>
  )
}

/* ----------------------------- Actions section ---------------------------- */

function ActionsSection({
  section,
  databases,
  onChange,
}: {
  section: Extract<LayoutSection, { type: 'actions' }>
  databases: DatabaseDef[]
  onChange: (items: QuickAction[]) => void
}) {
  const { ws, openRow } = useDb()
  return (
    <div className="flex flex-wrap items-center gap-2">
      {section.items.map((a) => (
        <span key={a.id} className="group/qa inline-flex items-center rounded-md border border-border">
          <button
            type="button"
            onClick={async () => {
              const row = await ws.createRow(a.databaseId, { values: a.values })
              if (row) openRow(row.id)
            }}
            className="flex h-8 items-center gap-1.5 rounded-l-md px-2.5 text-sm hover:bg-accent"
          >
            <PlusCircle className="h-4 w-4 text-muted-foreground" />
            {a.label}
          </button>
          <Popover>
            <PopoverTrigger asChild>
              <button type="button" className="flex h-8 w-6 items-center justify-center rounded-r-md text-muted-foreground opacity-50 hover:bg-accent hover:opacity-100" aria-label={`Configurar ${a.label}`}>
                <MoreHorizontal className="h-3.5 w-3.5" />
              </button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-80 p-3">
              <ActionEditor
                action={a}
                databases={databases}
                onChange={(next) => onChange(section.items.map((x) => (x.id === a.id ? next : x)))}
                onRemove={() => onChange(section.items.filter((x) => x.id !== a.id))}
              />
            </PopoverContent>
          </Popover>
        </span>
      ))}
      <button
        type="button"
        onClick={() => databases[0] && onChange([...section.items, { id: newId('qa'), label: 'Nueva fila', databaseId: databases[0].id, values: {} }])}
        className="flex h-8 items-center gap-1 rounded-md px-2 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
      >
        <Plus className="h-3.5 w-3.5" />
        Acción
      </button>
    </div>
  )
}

function ActionEditor({
  action,
  databases,
  onChange,
  onRemove,
}: {
  action: QuickAction
  databases: DatabaseDef[]
  onChange: (a: QuickAction) => void
  onRemove: () => void
}) {
  const db = databases.find((d) => d.id === action.databaseId)
  const selectProps = db?.properties.filter((p) => p.type === 'select' || p.type === 'status') ?? []
  const field = 'ml-auto max-w-44 truncate rounded bg-muted/60 px-1.5 py-1 text-sm outline-none'
  return (
    <div className="space-y-2">
      <label className="flex items-center gap-2 text-sm">
        <span className="text-muted-foreground">Texto</span>
        <input defaultValue={action.label} onBlur={(e) => onChange({ ...action, label: e.target.value.trim() || action.label })} className={field} />
      </label>
      <label className="flex items-center gap-2 text-sm">
        <span className="text-muted-foreground">Crea una fila en</span>
        <select value={action.databaseId} onChange={(e) => onChange({ ...action, databaseId: e.target.value, values: {} })} className={field}>
          {databases.map((d) => (
            <option key={d.id} value={d.id}>
              {d.title}
            </option>
          ))}
        </select>
      </label>
      {selectProps.length > 0 && <p className="border-t border-border pt-2 text-[11px] font-medium text-muted-foreground">Con estos valores</p>}
      {selectProps.map((p) => (
        <label key={p.id} className="flex items-center gap-2 text-sm">
          <span className="truncate text-muted-foreground">{p.name}</span>
          <select
            value={typeof action.values[p.id] === 'string' ? (action.values[p.id] as string) : ''}
            onChange={(e) => {
              const values: Record<string, RowValue> = { ...action.values }
              if (e.target.value) values[p.id] = e.target.value
              else delete values[p.id]
              onChange({ ...action, values })
            }}
            className={field}
          >
            <option value="">—</option>
            {(p.options ?? []).map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </label>
      ))}
      <button type="button" onClick={onRemove} className="flex items-center gap-1.5 rounded px-1.5 py-1 text-xs text-destructive hover:bg-accent">
        <Trash2 className="h-3.5 w-3.5" />
        Quitar acción
      </button>
    </div>
  )
}

/* ------------------------------ Add section ------------------------------- */

function AddSectionMenu({ databases, onAdd }: { databases: DatabaseDef[]; onAdd: (s: LayoutSection) => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className="flex items-center gap-1.5 rounded px-2 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-foreground">
          <Plus className="h-4 w-4" />
          Agregar bloque
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-60">
        <DropdownMenuSub>
          <DropdownMenuSubTrigger className="gap-2 text-sm">
            <Table2 className="h-3.5 w-3.5" />
            Vista de una base
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="max-h-80 w-60 overflow-y-auto">
            {databases.map((d) => (
              <div key={d.id}>
                <DropdownMenuLabel className="text-xs text-muted-foreground">
                  {d.icon} {d.title}
                </DropdownMenuLabel>
                {d.views.map((v) => (
                  <DropdownMenuItem
                    key={v.id}
                    onClick={() => onAdd({ id: newId('sec'), type: 'view', title: v.name, icon: v.icon, databaseId: d.id, viewId: v.id })}
                    className="cursor-pointer pl-4 text-sm"
                  >
                    {v.icon ? `${v.icon} ` : ''}
                    {v.name}
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
              </div>
            ))}
            {databases.length === 0 && <p className="p-2 text-xs text-muted-foreground">Primero creá una base de datos.</p>}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuItem
          onClick={() => onAdd({ id: newId('sec'), type: 'stats', items: [] })}
          disabled={databases.length === 0}
          className="cursor-pointer gap-2 text-sm"
        >
          <LayoutGrid className="h-3.5 w-3.5" />
          Indicadores
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => onAdd({ id: newId('sec'), type: 'actions', items: [] })}
          disabled={databases.length === 0}
          className="cursor-pointer gap-2 text-sm"
        >
          <Zap className="h-3.5 w-3.5" />
          Acciones rápidas
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onAdd({ id: newId('sec'), type: 'heading', text: 'Título' })} className="cursor-pointer gap-2 text-sm">
          <Heading className="h-3.5 w-3.5" />
          Título
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
