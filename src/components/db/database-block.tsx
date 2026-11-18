'use client'

import { useMemo, useState } from 'react'
import {
  Calendar as CalendarIcon,
  Copy,
  FileUp,
  GalleryHorizontalEnd,
  KanbanSquare,
  List,
  MoreHorizontal,
  Pencil,
  Plus,
  Table2,
  Trash2,
} from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useDb } from '@/components/db/db-context'
import { EmojiPicker } from '@/components/emoji-picker'
import { ViewToolbar } from '@/components/db/view-toolbar'
import { ImportDialog } from '@/components/db/import-dialog'
import { TableView } from '@/components/db/table-view'
import { BoardView, CalendarView, GalleryView, ListView } from '@/components/db/card-views'
import { viewRows } from '@/lib/db-resolve'
import {
  makeView,
  newId,
  valuesSatisfyingFilters,
  VIEW_TYPE_LABELS,
  type DatabaseDef,
  type RowValue,
  type ViewDef,
  type ViewType,
} from '@/lib/db-types'
import { cn } from '@/lib/utils'

export const VIEW_ICONS: Record<ViewType, React.ComponentType<{ className?: string }>> = {
  table: Table2,
  board: KanbanSquare,
  gallery: GalleryHorizontalEnd,
  calendar: CalendarIcon,
  list: List,
}

/** Renders one view of a database (no tabs). */
export function ViewBody({ db, view, search }: { db: DatabaseDef; view: ViewDef; search: string }) {
  const { ws, ctx, openRow } = useDb()
  const rows = useMemo(() => viewRows(ctx, db, view, search), [ctx, db, view, search])

  async function create(extra: Record<string, RowValue> = {}, open = false) {
    const values = { ...valuesSatisfyingFilters(db, view.filters), ...extra }
    const row = await ws.createRow(db.id, { values })
    if (row && open) openRow(row.id)
    return row
  }

  switch (view.type) {
    case 'board':
      return <BoardView db={db} view={view} rows={rows} onNew={(v) => create(v, true)} />
    case 'gallery':
      return <GalleryView db={db} view={view} rows={rows} onNew={() => create({}, true)} />
    case 'calendar':
      return <CalendarView db={db} view={view} rows={rows} onNew={(v) => create(v, true)} />
    case 'list':
      return <ListView db={db} view={view} rows={rows} onNew={() => create({}, true)} />
    default:
      return <TableView db={db} view={view} rows={rows} onNew={() => create()} />
  }
}

/**
 * A database block: title, view tabs, toolbar and the active view.
 * With `fixedViewId` it behaves like a Notion "linked view": only that view.
 */
export function DatabaseBlock({
  db,
  fixedViewId,
  heading,
  showTitle = true,
}: {
  db: DatabaseDef
  fixedViewId?: string
  /** Replaces the database title (linked views have their own heading). */
  heading?: React.ReactNode
  showTitle?: boolean
}) {
  const { ws, openRow } = useDb()
  const [activeId, setActiveId] = useState<string | null>(fixedViewId ?? null)
  const [search, setSearch] = useState('')
  const [renaming, setRenaming] = useState(false)

  const view = db.views.find((v) => v.id === (fixedViewId ?? activeId)) ?? db.views[0]
  if (!view) return null

  async function addView(type: ViewType) {
    const v = makeView(type, db, VIEW_TYPE_LABELS[type])
    ws.updateDatabase(db.id, { views: [...db.views, v] })
    setActiveId(v.id)
  }

  function duplicateView(v: ViewDef) {
    const copy: ViewDef = { ...v, id: newId('view'), name: `${v.name} (copia)` }
    const idx = db.views.findIndex((x) => x.id === v.id)
    const views = [...db.views]
    views.splice(idx + 1, 0, copy)
    ws.updateDatabase(db.id, { views })
    setActiveId(copy.id)
  }

  function deleteView(v: ViewDef) {
    if (db.views.length <= 1) return
    if (!window.confirm(`¿Eliminar la vista "${v.name}"? Las filas no se borran.`)) return
    const views = db.views.filter((x) => x.id !== v.id)
    ws.updateDatabase(db.id, { views })
    setActiveId(views[0].id)
  }

  async function createFromToolbar() {
    const values = valuesSatisfyingFilters(db, view.filters)
    const row = await ws.createRow(db.id, { values })
    if (row) openRow(row.id)
  }

  return (
    <section className="space-y-2">
      {showTitle && (
        <div className="group/db flex items-center gap-2">
          {heading ?? (
            <>
              <EmojiPicker onSelect={(e) => ws.updateDatabase(db.id, { icon: e })}>
                <button type="button" className="rounded-md p-0.5 text-lg leading-none hover:bg-accent" title="Cambiar ícono" aria-label="Cambiar ícono">
                  {db.icon || '🗃️'}
                </button>
              </EmojiPicker>
              {renaming ? (
                <input
                  autoFocus
                  defaultValue={db.title}
                  onBlur={(e) => {
                    const t = e.target.value.trim()
                    if (t && t !== db.title) ws.updateDatabase(db.id, { title: t })
                    setRenaming(false)
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === 'Escape') (e.target as HTMLInputElement).blur()
                  }}
                  className="min-w-0 flex-1 bg-transparent text-lg font-semibold outline-none"
                />
              ) : (
                <h3 className="min-w-0 truncate text-lg font-semibold" onDoubleClick={() => setRenaming(true)}>
                  {db.title}
                </h3>
              )}
              <DatabaseMenu db={db} onRename={() => setRenaming(true)} />
            </>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-1 border-b border-border pb-1">
        {fixedViewId ? (
          <span className="flex items-center gap-1.5 px-1 text-xs text-muted-foreground">
            <ViewIcon view={view} />
            {view.name}
            <span className="text-muted-foreground/60">· {db.title}</span>
          </span>
        ) : (
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-0.5">
            {db.views.map((v) => (
              <ViewTab
                key={v.id}
                view={v}
                active={v.id === view.id}
                canDelete={db.views.length > 1}
                onSelect={() => setActiveId(v.id)}
                onDuplicate={() => duplicateView(v)}
                onDelete={() => deleteView(v)}
              />
            ))}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button type="button" className="flex h-7 items-center gap-1 rounded px-1.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground" aria-label="Agregar vista" title="Agregar vista">
                  <Plus className="h-3.5 w-3.5" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-44">
                {(Object.keys(VIEW_TYPE_LABELS) as ViewType[]).map((t) => {
                  const Icon = VIEW_ICONS[t]
                  return (
                    <DropdownMenuItem key={t} onClick={() => addView(t)} className="cursor-pointer gap-2 text-sm">
                      <Icon className="h-3.5 w-3.5" />
                      {VIEW_TYPE_LABELS[t]}
                    </DropdownMenuItem>
                  )
                })}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
        <div className="ml-auto">
          <ViewToolbar db={db} view={view} search={search} onSearch={setSearch} onNew={createFromToolbar} />
        </div>
      </div>

      <ViewBody db={db} view={view} search={search} />
    </section>
  )
}

function ViewIcon({ view, className }: { view: ViewDef; className?: string }) {
  if (view.icon) return <span className={cn('text-xs leading-none', className)}>{view.icon}</span>
  const Icon = VIEW_ICONS[view.type] ?? Table2
  return <Icon className={cn('h-3.5 w-3.5', className)} />
}

function ViewTab({
  view,
  active,
  canDelete,
  onSelect,
  onDuplicate,
  onDelete,
}: {
  view: ViewDef
  active: boolean
  canDelete: boolean
  onSelect: () => void
  onDuplicate: () => void
  onDelete: () => void
}) {
  const tab = (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'flex h-7 items-center gap-1.5 rounded px-2 text-xs',
        active ? 'bg-accent font-medium text-foreground' : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground'
      )}
      aria-pressed={active}
    >
      <ViewIcon view={view} />
      {view.name}
    </button>
  )
  if (!active) return tab
  return (
    <span className="flex items-center">
      {tab}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" className="flex h-7 w-5 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground" aria-label={`Opciones de la vista ${view.name}`}>
            <MoreHorizontal className="h-3.5 w-3.5" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-44">
          <DropdownMenuItem onClick={onDuplicate} className="cursor-pointer gap-2 text-sm">
            <Copy className="h-3.5 w-3.5" />
            Duplicar vista
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={onDelete} disabled={!canDelete} className="cursor-pointer gap-2 text-sm text-destructive focus:text-destructive">
            <Trash2 className="h-3.5 w-3.5" />
            Eliminar vista
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </span>
  )
}

function DatabaseMenu({ db, onRename }: { db: DatabaseDef; onRename: () => void }) {
  const { ws } = useDb()
  const [importOpen, setImportOpen] = useState(false)
  return (
    <>
    <ImportDialog open={importOpen} onOpenChange={setImportOpen} target={db} />
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground opacity-0 hover:bg-accent hover:text-foreground focus-visible:opacity-100 group-hover/db:opacity-100 data-[state=open]:opacity-100"
          aria-label={`Opciones de ${db.title}`}
        >
          <MoreHorizontal className="h-4 w-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-52">
        <DropdownMenuItem onClick={onRename} className="cursor-pointer gap-2 text-sm">
          <Pencil className="h-3.5 w-3.5" />
          Cambiar nombre
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setImportOpen(true)} className="cursor-pointer gap-2 text-sm">
          <FileUp className="h-3.5 w-3.5" />
          Importar filas (CSV)
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => {
            if (window.confirm(`¿Eliminar la base "${db.title}" con todas sus filas (${db.rows.length})? No se puede deshacer.`)) {
              ws.deleteDatabase(db.id)
            }
          }}
          className="cursor-pointer gap-2 text-sm text-destructive focus:text-destructive"
        >
          <Trash2 className="h-3.5 w-3.5" />
          Eliminar base de datos
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
    </>
  )
}
