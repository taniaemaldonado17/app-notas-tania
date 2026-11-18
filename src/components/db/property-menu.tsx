'use client'

import { useState } from 'react'
import {
  ArrowDown,
  ArrowUp,
  Calendar,
  CheckSquare,
  ChevronDown,
  Circle,
  Clock,
  EyeOff,
  Hash,
  Link2,
  List,
  Mail,
  Phone,
  Plus,
  Sigma,
  Tag,
  Text,
  Trash2,
  Type,
  User,
  ArrowUpRight,
  X,
} from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ColorDot, OptionChip } from '@/components/db/chips'
import { useDb } from '@/components/db/db-context'
import {
  CREATABLE_TYPES,
  hasOptions,
  newId,
  NUMBER_FORMAT_LABELS,
  OPTION_COLORS,
  PROPERTY_TYPE_LABELS,
  type DatabaseDef,
  type NumberFormat,
  type PropertyDef,
  type PropertyType,
  type ViewDef,
} from '@/lib/db-types'
import { checkFormula, FORMULA_HELP } from '@/lib/formula'
import { cn } from '@/lib/utils'

export const TYPE_ICONS: Record<PropertyType, React.ComponentType<{ className?: string }>> = {
  title: Type,
  text: Text,
  number: Hash,
  select: ChevronDown,
  status: Circle,
  multi_select: List,
  date: Calendar,
  person: User,
  checkbox: CheckSquare,
  url: Link2,
  email: Mail,
  phone: Phone,
  relation: ArrowUpRight,
  backlink: ArrowUpRight,
  formula: Sigma,
  created_time: Clock,
  updated_time: Clock,
}

export function PropertyIcon({ type, className }: { type: PropertyType; className?: string }) {
  const Icon = TYPE_ICONS[type] ?? Tag
  return <Icon className={cn('h-3.5 w-3.5 shrink-0 text-muted-foreground', className)} />
}

/** Remove a property from the schema and from every view that uses it. */
export function removeProperty(db: DatabaseDef, propId: string): { properties: PropertyDef[]; views: ViewDef[] } {
  return {
    properties: db.properties.filter((p) => p.id !== propId),
    views: db.views.map((v) => ({
      ...v,
      visibleProperties: v.visibleProperties.filter((id) => id !== propId),
      filters: v.filters.filter((f) => f.propertyId !== propId),
      sorts: v.sorts.filter((s) => s.propertyId !== propId),
      groupBy: v.groupBy === propId ? undefined : v.groupBy,
      dateProperty: v.dateProperty === propId ? undefined : v.dateProperty,
      endDateProperty: v.endDateProperty === propId ? undefined : v.endDateProperty,
      coverProperty: v.coverProperty === propId ? undefined : v.coverProperty,
    })),
  }
}

/**
 * Header menu of a property: rename, change type and settings, sort,
 * hide in the current view, delete.
 */
export function PropertyMenu({
  db,
  prop,
  view,
  children,
  align = 'start',
}: {
  db: DatabaseDef
  prop: PropertyDef
  /** Current view (sort / hide actions). Omit in the row panel. */
  view?: ViewDef
  children: React.ReactNode
  align?: 'start' | 'center' | 'end'
}) {
  const [open, setOpen] = useState(false)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent align={align} className="w-72 p-0" onClick={(e) => e.stopPropagation()}>
        <PropertySettings db={db} prop={prop} view={view} onClose={() => setOpen(false)} />
      </PopoverContent>
    </Popover>
  )
}

function PropertySettings({
  db,
  prop,
  view,
  onClose,
}: {
  db: DatabaseDef
  prop: PropertyDef
  view?: ViewDef
  onClose: () => void
}) {
  const { ws, ctx } = useDb()
  const [name, setName] = useState(prop.name)

  function patchProp(patch: Partial<PropertyDef>) {
    ws.updateDatabase(db.id, {
      properties: db.properties.map((p) => (p.id === prop.id ? { ...p, ...patch } : p)),
    })
  }

  function patchView(patch: Partial<ViewDef>) {
    if (!view) return
    ws.updateDatabase(db.id, { views: db.views.map((v) => (v.id === view.id ? { ...v, ...patch } : v)) })
  }

  function commitName() {
    const n = name.trim()
    if (n && n !== prop.name) patchProp({ name: n })
  }

  function changeType(type: PropertyType) {
    const patch: Partial<PropertyDef> = { type }
    if (hasOptions(type) && !prop.options) patch.options = []
    if (type === 'number' && !prop.numberFormat) patch.numberFormat = 'number'
    if (type === 'formula' && !prop.formula) patch.formula = ''
    if (type === 'relation' && !prop.relationDatabaseId) patch.relationDatabaseId = db.id
    patchProp(patch)
  }

  function deleteProp() {
    const ok = window.confirm(`¿Eliminar la propiedad "${prop.name}"? Se borra de todas las vistas.`)
    if (!ok) return
    ws.updateDatabase(db.id, removeProperty(db, prop.id))
    // Backlinks in other databases that mirrored this relation.
    if (prop.type === 'relation') {
      for (const other of ctx.databases) {
        const mirrored = other.properties.filter((p) => p.type === 'backlink' && p.backlinkPropertyId === prop.id)
        for (const m of mirrored) ws.updateDatabase(other.id, removeProperty(other, m.id))
      }
    }
    onClose()
  }

  const isTitle = prop.type === 'title'

  return (
    <div className="max-h-[70vh] overflow-y-auto">
      <div className="space-y-2 border-b border-border p-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={commitName}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              commitName()
              onClose()
            }
          }}
          className="h-8 w-full rounded border border-border bg-muted/40 px-2 text-sm outline-none focus:ring-1 focus:ring-ring"
          aria-label="Nombre de la propiedad"
        />
        {!isTitle && prop.type !== 'backlink' && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="flex h-8 w-full items-center gap-2 rounded px-2 text-left text-sm hover:bg-accent"
              >
                <span className="text-muted-foreground">Tipo</span>
                <span className="ml-auto flex items-center gap-1.5">
                  <PropertyIcon type={prop.type} />
                  {PROPERTY_TYPE_LABELS[prop.type]}
                </span>
                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="max-h-80 w-52 overflow-y-auto">
              {CREATABLE_TYPES.map((t) => (
                <DropdownMenuItem key={t} onClick={() => changeType(t)} className="cursor-pointer gap-2 text-sm">
                  <PropertyIcon type={t} />
                  {PROPERTY_TYPE_LABELS[t]}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {hasOptions(prop.type) && <OptionsSettings prop={prop} onChange={(options) => patchProp({ options })} />}

      {(prop.type === 'number' || prop.type === 'formula') && (
        <div className="space-y-1 border-b border-border p-2">
          <label className="flex items-center gap-2 px-2 text-sm">
            <span className="text-muted-foreground">Formato</span>
            <select
              value={prop.numberFormat ?? 'number'}
              onChange={(e) => patchProp({ numberFormat: e.target.value as NumberFormat })}
              className="ml-auto rounded bg-muted/60 px-1.5 py-1 text-sm outline-none"
            >
              {Object.entries(NUMBER_FORMAT_LABELS).map(([k, label]) => (
                <option key={k} value={k}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex cursor-pointer items-center gap-2 px-2 py-1 text-sm">
            <span className="text-muted-foreground">Mostrar como barra</span>
            <input
              type="checkbox"
              checked={prop.showAs === 'bar'}
              onChange={(e) => patchProp({ showAs: e.target.checked ? 'bar' : 'number' })}
              className="ml-auto"
            />
          </label>
        </div>
      )}

      {prop.type === 'formula' && <FormulaSettings db={db} prop={prop} onChange={(formula) => patchProp({ formula })} />}

      {prop.type === 'relation' && <RelationSettings db={db} prop={prop} onChange={patchProp} />}

      {prop.type === 'backlink' && (
        <p className="border-b border-border p-3 text-xs leading-relaxed text-muted-foreground">
          Muestra las filas de{' '}
          <span className="text-foreground">
            {ctx.databases.find((d) => d.id === prop.backlinkDatabaseId)?.title ?? 'otra base'}
          </span>{' '}
          que apuntan a esta fila. Se edita desde esa base.
        </p>
      )}

      <div className="p-1">
        {view && (
          <>
            <MenuButton
              icon={ArrowUp}
              label="Ordenar ascendente"
              onClick={() => {
                patchView({ sorts: [{ propertyId: prop.id, direction: 'asc' }] })
                onClose()
              }}
            />
            <MenuButton
              icon={ArrowDown}
              label="Ordenar descendente"
              onClick={() => {
                patchView({ sorts: [{ propertyId: prop.id, direction: 'desc' }] })
                onClose()
              }}
            />
            {!isTitle && (
              <MenuButton
                icon={EyeOff}
                label="Ocultar en esta vista"
                onClick={() => {
                  patchView({ visibleProperties: view.visibleProperties.filter((id) => id !== prop.id) })
                  onClose()
                }}
              />
            )}
          </>
        )}
        {!isTitle && (
          <MenuButton icon={Trash2} label="Eliminar propiedad" danger onClick={deleteProp} />
        )}
      </div>
    </div>
  )
}

function MenuButton({
  icon: Icon,
  label,
  onClick,
  danger,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  onClick: () => void
  danger?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-accent',
        danger && 'text-destructive'
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </button>
  )
}

function OptionsSettings({
  prop,
  onChange,
}: {
  prop: PropertyDef
  onChange: (options: NonNullable<PropertyDef['options']>) => void
}) {
  const options = prop.options ?? []
  const [newName, setNewName] = useState('')

  function add() {
    const name = newName.trim()
    if (!name) return
    const colors = OPTION_COLORS.map((c) => c.id).filter((c) => c !== 'default')
    onChange([...options, { id: newId('opt'), name, color: colors[options.length % colors.length] }])
    setNewName('')
  }

  return (
    <div className="border-b border-border p-2">
      <p className="px-2 pb-1 text-[11px] font-medium text-muted-foreground">Opciones</p>
      <ul className="space-y-0.5">
        {options.map((o, i) => (
          <li key={o.id} className="group flex items-center gap-1 rounded px-1 hover:bg-accent/50">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button type="button" className="rounded p-1 hover:bg-accent" aria-label={`Color de ${o.name}`}>
                  <ColorDot color={o.color} />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-44">
                {OPTION_COLORS.map((c) => (
                  <DropdownMenuItem
                    key={c.id}
                    onClick={() => onChange(options.map((x) => (x.id === o.id ? { ...x, color: c.id } : x)))}
                    className="cursor-pointer gap-2 text-sm"
                  >
                    <ColorDot color={c.id} />
                    {c.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <input
              defaultValue={o.name}
              onBlur={(e) => {
                const v = e.target.value.trim()
                if (v && v !== o.name) onChange(options.map((x) => (x.id === o.id ? { ...x, name: v } : x)))
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
              }}
              className="h-7 min-w-0 flex-1 bg-transparent text-sm outline-none"
              aria-label="Nombre de la opción"
            />
            <button
              type="button"
              onClick={() => {
                if (i === 0) return
                const next = [...options]
                ;[next[i - 1], next[i]] = [next[i], next[i - 1]]
                onChange(next)
              }}
              className="rounded p-1 text-muted-foreground opacity-0 hover:bg-accent hover:text-foreground group-hover:opacity-100 disabled:hidden"
              disabled={i === 0}
              aria-label="Subir"
              title="Subir"
            >
              <ArrowUp className="h-3 w-3" />
            </button>
            <button
              type="button"
              onClick={() => onChange(options.filter((x) => x.id !== o.id))}
              className="rounded p-1 text-muted-foreground opacity-0 hover:bg-accent hover:text-destructive group-hover:opacity-100"
              aria-label={`Eliminar ${o.name}`}
              title="Eliminar opción"
            >
              <X className="h-3 w-3" />
            </button>
          </li>
        ))}
      </ul>
      <div className="mt-1 flex items-center gap-1 px-1">
        <Plus className="h-3.5 w-3.5 text-muted-foreground" />
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') add()
          }}
          placeholder="Agregar opción"
          className="h-7 flex-1 bg-transparent text-sm outline-none"
        />
        {newName.trim() && (
          <button type="button" onClick={add} className="text-xs text-muted-foreground hover:text-foreground">
            <OptionChip option={{ name: 'Agregar', color: 'default' }} />
          </button>
        )}
      </div>
    </div>
  )
}

function FormulaSettings({
  db,
  prop,
  onChange,
}: {
  db: DatabaseDef
  prop: PropertyDef
  onChange: (formula: string) => void
}) {
  const [draft, setDraft] = useState(prop.formula ?? '')
  const error = draft.trim() ? checkFormula(draft) : null
  const others = db.properties.filter((p) => p.id !== prop.id)
  return (
    <div className="space-y-2 border-b border-border p-2">
      <p className="px-1 text-[11px] font-medium text-muted-foreground">Fórmula</p>
      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          if (!error && draft !== prop.formula) onChange(draft)
        }}
        rows={3}
        spellCheck={false}
        placeholder={'prop("Valor") - prop("Facturado")'}
        className="block w-full resize-y rounded border border-border bg-muted/40 p-2 font-mono text-xs outline-none focus:ring-1 focus:ring-ring"
      />
      {error ? (
        <p className="px-1 text-xs text-destructive">{error}</p>
      ) : (
        <p className="px-1 text-[11px] text-muted-foreground">Se guarda al salir del cuadro.</p>
      )}
      <details className="px-1 text-xs">
        <summary className="cursor-pointer text-muted-foreground hover:text-foreground">Propiedades y funciones</summary>
        <div className="mt-1 flex flex-wrap gap-1">
          {others.map((p) => (
            <button
              key={p.id}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => setDraft((d) => `${d}prop("${p.name}")`)}
              className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] hover:bg-accent"
            >
              {p.name}
            </button>
          ))}
        </div>
        <ul className="mt-2 space-y-0.5 text-muted-foreground">
          {FORMULA_HELP.map((h) => (
            <li key={h.sig}>
              <code className="text-foreground">{h.sig}</code> — {h.desc}
            </li>
          ))}
        </ul>
      </details>
    </div>
  )
}

function RelationSettings({
  db,
  prop,
  onChange,
}: {
  db: DatabaseDef
  prop: PropertyDef
  onChange: (patch: Partial<PropertyDef>) => void
}) {
  const { ctx, ws } = useDb()
  const target = ctx.databases.find((d) => d.id === prop.relationDatabaseId)
  const mirrored = target?.properties.find((p) => p.type === 'backlink' && p.backlinkPropertyId === prop.id)

  function toggleMirror() {
    if (!target) return
    if (mirrored) {
      ws.updateDatabase(target.id, removeProperty(target, mirrored.id))
      return
    }
    const backlink: PropertyDef = {
      id: newId('prop'),
      name: db.title,
      type: 'backlink',
      backlinkDatabaseId: db.id,
      backlinkPropertyId: prop.id,
    }
    ws.updateDatabase(target.id, {
      properties: [...target.properties, backlink],
      views: target.views.map((v) => (v.type === 'table' ? { ...v, visibleProperties: [...v.visibleProperties, backlink.id] } : v)),
    })
  }

  return (
    <div className="space-y-1 border-b border-border p-2">
      <label className="flex items-center gap-2 px-2 text-sm">
        <span className="text-muted-foreground">Relacionada con</span>
        <select
          value={prop.relationDatabaseId ?? ''}
          onChange={(e) => onChange({ relationDatabaseId: e.target.value })}
          className="ml-auto max-w-36 truncate rounded bg-muted/60 px-1.5 py-1 text-sm outline-none"
        >
          {ctx.databases.map((d) => (
            <option key={d.id} value={d.id}>
              {d.title}
            </option>
          ))}
        </select>
      </label>
      {target && target.id !== db.id && (
        <label className="flex cursor-pointer items-center gap-2 px-2 py-1 text-sm">
          <span className="text-muted-foreground">Mostrar también en {target.title}</span>
          <input type="checkbox" checked={!!mirrored} onChange={toggleMirror} className="ml-auto" />
        </label>
      )}
    </div>
  )
}

/** "+" button at the end of a table header: adds a text property. */
export function AddPropertyButton({
  db,
  view,
  className,
  label,
}: {
  db: DatabaseDef
  view?: ViewDef
  className?: string
  label?: string
}) {
  const { ws } = useDb()
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn('flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground', className)}
          aria-label="Agregar propiedad"
          title="Agregar propiedad"
        >
          <Plus className="h-4 w-4" />
          {label}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="max-h-80 w-52 overflow-y-auto">
        {CREATABLE_TYPES.map((t) => (
          <DropdownMenuItem
            key={t}
            className="cursor-pointer gap-2 text-sm"
            onClick={() => {
              const prop: PropertyDef = {
                id: newId('prop'),
                name: PROPERTY_TYPE_LABELS[t],
                type: t,
                ...(hasOptions(t) ? { options: [] } : {}),
                ...(t === 'number' ? { numberFormat: 'number' as const } : {}),
                ...(t === 'formula' ? { formula: '' } : {}),
                ...(t === 'relation' ? { relationDatabaseId: db.id } : {}),
              }
              ws.updateDatabase(db.id, {
                properties: [...db.properties, prop],
                // Show it in the view where it was added (and in all table views).
                views: db.views.map((v) =>
                  v.id === view?.id || v.type === 'table'
                    ? { ...v, visibleProperties: [...v.visibleProperties, prop.id] }
                    : v
                ),
              })
            }}
          >
            <PropertyIcon type={t} />
            {PROPERTY_TYPE_LABELS[t]}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
