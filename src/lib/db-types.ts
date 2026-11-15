/**
 * Notion-style databases: property definitions, views, filters, sorting and
 * value formatting. Shared by the server (templates, validation) and the
 * client (rendering). No server-only imports here.
 */

/* ------------------------------------------------------------------ */
/* Properties                                                          */
/* ------------------------------------------------------------------ */

export type PropertyType =
  | 'title'
  | 'text'
  | 'number'
  | 'select'
  | 'status'
  | 'multi_select'
  | 'date'
  | 'person'
  | 'checkbox'
  | 'url'
  | 'email'
  | 'phone'
  | 'relation'
  | 'backlink'
  | 'formula'
  | 'created_time'
  | 'updated_time'

export type OptionColor =
  | 'default'
  | 'gray'
  | 'brown'
  | 'orange'
  | 'yellow'
  | 'green'
  | 'blue'
  | 'purple'
  | 'pink'
  | 'red'

export type SelectOption = { id: string; name: string; color: OptionColor }

export type NumberFormat = 'number' | 'percent' | 'ars' | 'usd' | 'eur'

export type PropertyDef = {
  id: string
  name: string
  type: PropertyType
  /** select, status, multi_select */
  options?: SelectOption[]
  /** number, formula */
  numberFormat?: NumberFormat
  /** number, formula: show a progress bar (value 0–1 for percent, 0–100 otherwise) */
  showAs?: 'number' | 'bar'
  /** relation: target database (same page) */
  relationDatabaseId?: string
  /** backlink: rows of `backlinkDatabaseId` whose `backlinkPropertyId` points here */
  backlinkDatabaseId?: string
  backlinkPropertyId?: string
  /** formula: expression, e.g. prop("Valor") - prop("Facturado") */
  formula?: string
}

export const TITLE_PROPERTY_ID = 'title'

export const PROPERTY_TYPE_LABELS: Record<PropertyType, string> = {
  title: 'Título',
  text: 'Texto',
  number: 'Número',
  select: 'Selección',
  status: 'Estado',
  multi_select: 'Selección múltiple',
  date: 'Fecha',
  person: 'Persona',
  checkbox: 'Casilla',
  url: 'URL',
  email: 'Email',
  phone: 'Teléfono',
  relation: 'Relación',
  backlink: 'Relacionados (inverso)',
  formula: 'Fórmula',
  created_time: 'Fecha de creación',
  updated_time: 'Última edición',
}

/** Types the user can pick when creating or changing a property. */
export const CREATABLE_TYPES: PropertyType[] = [
  'text',
  'number',
  'select',
  'status',
  'multi_select',
  'date',
  'person',
  'checkbox',
  'url',
  'email',
  'phone',
  'relation',
  'formula',
  'created_time',
  'updated_time',
]

/** Types whose value is computed, not edited. */
export function isComputed(type: PropertyType): boolean {
  return type === 'formula' || type === 'backlink' || type === 'created_time' || type === 'updated_time'
}

export function hasOptions(type: PropertyType): boolean {
  return type === 'select' || type === 'status' || type === 'multi_select'
}

export const OPTION_COLORS: { id: OptionColor; label: string }[] = [
  { id: 'default', label: 'Predeterminado' },
  { id: 'gray', label: 'Gris' },
  { id: 'brown', label: 'Marrón' },
  { id: 'orange', label: 'Naranja' },
  { id: 'yellow', label: 'Amarillo' },
  { id: 'green', label: 'Verde' },
  { id: 'blue', label: 'Azul' },
  { id: 'purple', label: 'Violeta' },
  { id: 'pink', label: 'Rosa' },
  { id: 'red', label: 'Rojo' },
]

export const NUMBER_FORMAT_LABELS: Record<NumberFormat, string> = {
  number: 'Número',
  percent: 'Porcentaje',
  ars: 'Pesos ($)',
  usd: 'Dólares (US$)',
  eur: 'Euros (€)',
}

/* ------------------------------------------------------------------ */
/* Views                                                               */
/* ------------------------------------------------------------------ */

export type ViewType = 'table' | 'board' | 'gallery' | 'calendar' | 'list'

export const VIEW_TYPE_LABELS: Record<ViewType, string> = {
  table: 'Tabla',
  board: 'Tablero',
  gallery: 'Galería',
  calendar: 'Calendario',
  list: 'Lista',
}

export type FilterOp =
  | 'contains'
  | 'not_contains'
  | 'is'
  | 'is_not'
  | 'is_empty'
  | 'is_not_empty'
  | 'eq'
  | 'neq'
  | 'gt'
  | 'lt'
  | 'gte'
  | 'lte'
  | 'before'
  | 'after'
  | 'on_or_before'
  | 'on_or_after'
  | 'checked'
  | 'unchecked'

export type Filter = {
  id: string
  propertyId: string
  op: FilterOp
  /** string | number | option id | date 'YYYY-MM-DD' | 'today' */
  value?: string | number | null
}

export type Sort = { propertyId: string; direction: 'asc' | 'desc' }

export type ViewDef = {
  id: string
  name: string
  type: ViewType
  icon?: string
  filters: Filter[]
  sorts: Sort[]
  /** Property ids shown (in order). The title is always shown. */
  visibleProperties: string[]
  /** board: select/status/multi_select/person/checkbox property to group by */
  groupBy?: string
  /** calendar: date property */
  dateProperty?: string
  /** gallery: url property used as cover image */
  coverProperty?: string
}

/* ------------------------------------------------------------------ */
/* Rows                                                                */
/* ------------------------------------------------------------------ */

export type RowValue = string | number | boolean | string[] | null

export type DbRow = {
  id: string
  databaseId: string
  title: string
  icon: string | null
  values: Record<string, RowValue>
  position: number
  createdById: string | null
  createdAt: string
  updatedAt: string
  commentCount?: number
}

export type DatabaseDef = {
  id: string
  pageId: string
  title: string
  icon: string | null
  properties: PropertyDef[]
  views: ViewDef[]
  position: number
  rows: DbRow[]
}

/* ------------------------------------------------------------------ */
/* Dashboard layout of a 'databases' page                              */
/* ------------------------------------------------------------------ */

export type StatItem = {
  id: string
  label: string
  icon?: string
  color: OptionColor
  databaseId: string
  filters: Filter[]
  aggregate: 'count' | 'sum'
  /** sum: number or formula property */
  propertyId?: string
}

export type QuickAction = {
  id: string
  label: string
  databaseId: string
  /** Values set on the new row, e.g. { tipo: 'opt_plano' } */
  values: Record<string, RowValue>
}

export type LayoutSection =
  | { id: string; type: 'actions'; items: QuickAction[] }
  | { id: string; type: 'stats'; items: StatItem[] }
  | { id: string; type: 'view'; title: string; icon?: string; databaseId: string; viewId: string }
  | { id: string; type: 'heading'; text: string }

export type PageLayout = {
  sections: LayoutSection[]
  /** Show the full source databases (all views) at the bottom. */
  showSources: boolean
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

export function newId(prefix = 'id'): string {
  const rand =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().replace(/-/g, '').slice(0, 12)
      : Math.random().toString(36).slice(2, 14)
  return `${prefix}_${rand}`
}

export function getProperty(db: Pick<DatabaseDef, 'properties'>, id: string): PropertyDef | undefined {
  return db.properties.find((p) => p.id === id)
}

export function findOption(prop: PropertyDef | undefined, optionId: unknown): SelectOption | undefined {
  if (!prop?.options || typeof optionId !== 'string') return undefined
  return prop.options.find((o) => o.id === optionId)
}

/** Default view for a new database or a new view of a given type. */
export function makeView(type: ViewType, db: Pick<DatabaseDef, 'properties'>, name?: string): ViewDef {
  const visible = db.properties.filter((p) => p.type !== 'title').map((p) => p.id)
  const view: ViewDef = {
    id: newId('view'),
    name: name ?? VIEW_TYPE_LABELS[type],
    type,
    filters: [],
    sorts: [],
    visibleProperties: type === 'table' ? visible : visible.slice(0, 3),
  }
  if (type === 'board') {
    view.groupBy = db.properties.find((p) => p.type === 'status' || p.type === 'select')?.id
  }
  if (type === 'calendar') {
    view.dateProperty = db.properties.find((p) => p.type === 'date')?.id
  }
  if (type === 'gallery') {
    view.coverProperty = db.properties.find((p) => p.type === 'url')?.id
  }
  return view
}

/** Properties a new, empty database starts with. */
export function defaultProperties(): PropertyDef[] {
  return [
    { id: TITLE_PROPERTY_ID, name: 'Nombre', type: 'title' },
    {
      id: newId('prop'),
      name: 'Estado',
      type: 'status',
      options: [
        { id: newId('opt'), name: 'Sin empezar', color: 'gray' },
        { id: newId('opt'), name: 'En curso', color: 'blue' },
        { id: newId('opt'), name: 'Listo', color: 'green' },
      ],
    },
    { id: newId('prop'), name: 'Fecha', type: 'date' },
    { id: newId('prop'), name: 'Notas', type: 'text' },
  ]
}

/* ------------------------------------------------------------------ */
/* Formatting                                                          */
/* ------------------------------------------------------------------ */

export function formatNumber(value: number | null | undefined, format: NumberFormat = 'number'): string {
  if (value === null || value === undefined || Number.isNaN(value)) return ''
  switch (format) {
    case 'percent':
      return `${new Intl.NumberFormat('es-AR', { maximumFractionDigits: 1 }).format(value * 100)} %`
    case 'ars':
      return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 2 }).format(value)
    case 'usd':
      return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(value)
    case 'eur':
      return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 }).format(value)
    default:
      return new Intl.NumberFormat('es-AR', { maximumFractionDigits: 4 }).format(value)
  }
}

/** Progress (0–1) for a number shown as a bar. */
export function barRatio(value: number | null | undefined, format: NumberFormat = 'number'): number {
  if (value === null || value === undefined || Number.isNaN(value)) return 0
  const ratio = format === 'percent' ? value : value / 100
  return Math.max(0, Math.min(1, ratio))
}

const dateFmt = new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })

/** 'YYYY-MM-DD' → '15 nov 2026' */
export function formatDate(value: unknown): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(value)) return ''
  const d = new Date(`${value.slice(0, 10)}T00:00:00Z`)
  return Number.isNaN(d.getTime()) ? '' : dateFmt.format(d)
}

/** Today as 'YYYY-MM-DD' in the user's local time. */
export function todayISO(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/* ------------------------------------------------------------------ */
/* Filtering & sorting                                                 */
/* ------------------------------------------------------------------ */

type OpDef = { op: FilterOp; label: string; needsValue: boolean }

export function filterOpsFor(type: PropertyType): OpDef[] {
  switch (type) {
    case 'number':
    case 'formula':
      return [
        { op: 'eq', label: '=', needsValue: true },
        { op: 'neq', label: '≠', needsValue: true },
        { op: 'gt', label: '>', needsValue: true },
        { op: 'lt', label: '<', needsValue: true },
        { op: 'gte', label: '≥', needsValue: true },
        { op: 'lte', label: '≤', needsValue: true },
        { op: 'is_empty', label: 'está vacío', needsValue: false },
        { op: 'is_not_empty', label: 'no está vacío', needsValue: false },
      ]
    case 'select':
    case 'status':
      return [
        { op: 'is', label: 'es', needsValue: true },
        { op: 'is_not', label: 'no es', needsValue: true },
        { op: 'is_empty', label: 'está vacío', needsValue: false },
        { op: 'is_not_empty', label: 'no está vacío', needsValue: false },
      ]
    case 'multi_select':
    case 'person':
    case 'relation':
    case 'backlink':
      return [
        { op: 'contains', label: 'contiene', needsValue: true },
        { op: 'not_contains', label: 'no contiene', needsValue: true },
        { op: 'is_empty', label: 'está vacío', needsValue: false },
        { op: 'is_not_empty', label: 'no está vacío', needsValue: false },
      ]
    case 'date':
    case 'created_time':
    case 'updated_time':
      return [
        { op: 'is', label: 'es', needsValue: true },
        { op: 'before', label: 'antes de', needsValue: true },
        { op: 'after', label: 'después de', needsValue: true },
        { op: 'on_or_before', label: 'en o antes de', needsValue: true },
        { op: 'on_or_after', label: 'en o después de', needsValue: true },
        { op: 'is_empty', label: 'está vacío', needsValue: false },
        { op: 'is_not_empty', label: 'no está vacío', needsValue: false },
      ]
    case 'checkbox':
      return [
        { op: 'checked', label: 'marcada', needsValue: false },
        { op: 'unchecked', label: 'sin marcar', needsValue: false },
      ]
    default:
      return [
        { op: 'contains', label: 'contiene', needsValue: true },
        { op: 'not_contains', label: 'no contiene', needsValue: true },
        { op: 'is', label: 'es', needsValue: true },
        { op: 'is_not', label: 'no es', needsValue: true },
        { op: 'is_empty', label: 'está vacío', needsValue: false },
        { op: 'is_not_empty', label: 'no está vacío', needsValue: false },
      ]
  }
}

/** A row value resolved for filtering/sorting/display (computed props included). */
export type ResolvedValue = string | number | boolean | string[] | null

function isEmptyValue(v: ResolvedValue): boolean {
  if (v === null || v === undefined || v === '') return true
  if (Array.isArray(v)) return v.length === 0
  if (typeof v === 'number') return Number.isNaN(v)
  return false
}

function resolveDateToken(v: unknown): string {
  if (v === 'today') return todayISO()
  return typeof v === 'string' ? v.slice(0, 10) : ''
}

export function matchesFilter(prop: PropertyDef | undefined, value: ResolvedValue, f: Filter): boolean {
  if (!prop) return true
  if (f.op === 'is_empty') return isEmptyValue(value)
  if (f.op === 'is_not_empty') return !isEmptyValue(value)
  if (f.op === 'checked') return value === true
  if (f.op === 'unchecked') return value !== true

  const target = f.value
  // An unfinished filter (no value yet) doesn't hide anything, like Notion.
  if (target === undefined || target === null || target === '') return true

  switch (prop.type) {
    case 'number':
    case 'formula': {
      const n = typeof value === 'number' ? value : Number.NaN
      const t = Number(target)
      if (Number.isNaN(t)) return true
      if (Number.isNaN(n)) return f.op === 'neq'
      switch (f.op) {
        case 'eq': return n === t
        case 'neq': return n !== t
        case 'gt': return n > t
        case 'lt': return n < t
        case 'gte': return n >= t
        case 'lte': return n <= t
        default: return true
      }
    }
    case 'select':
    case 'status':
      if (f.op === 'is') return value === target
      if (f.op === 'is_not') return value !== target
      return true
    case 'multi_select':
    case 'person':
    case 'relation':
    case 'backlink': {
      const arr = Array.isArray(value) ? value : []
      if (f.op === 'contains') return arr.includes(String(target))
      if (f.op === 'not_contains') return !arr.includes(String(target))
      return true
    }
    case 'date':
    case 'created_time':
    case 'updated_time': {
      const d = typeof value === 'string' ? value.slice(0, 10) : ''
      const t = resolveDateToken(target)
      if (!d) return false
      switch (f.op) {
        case 'is': return d === t
        case 'before': return d < t
        case 'after': return d > t
        case 'on_or_before': return d <= t
        case 'on_or_after': return d >= t
        default: return true
      }
    }
    default: {
      const s = (value === null || value === undefined ? '' : String(value)).toLowerCase()
      const t = String(target).toLowerCase()
      switch (f.op) {
        case 'contains': return s.includes(t)
        case 'not_contains': return !s.includes(t)
        case 'is': return s === t
        case 'is_not': return s !== t
        default: return true
      }
    }
  }
}

/** Compare two resolved values; empties always last. */
export function compareValues(prop: PropertyDef | undefined, a: ResolvedValue, b: ResolvedValue): number {
  const ea = isEmptyValue(a)
  const eb = isEmptyValue(b)
  if (ea && eb) return 0
  if (ea) return 1
  if (eb) return -1
  if (prop && (prop.type === 'select' || prop.type === 'status') && prop.options) {
    // Option order, like Notion.
    const ia = prop.options.findIndex((o) => o.id === a)
    const ib = prop.options.findIndex((o) => o.id === b)
    return ia - ib
  }
  if (typeof a === 'number' && typeof b === 'number') return a - b
  if (typeof a === 'boolean' && typeof b === 'boolean') return Number(a) - Number(b)
  const sa = Array.isArray(a) ? a.join(', ') : String(a)
  const sb = Array.isArray(b) ? b.join(', ') : String(b)
  return sa.localeCompare(sb, 'es', { numeric: true, sensitivity: 'base' })
}

/**
 * Values a new row should start with so it shows up in a filtered view
 * (e.g. "Registro de planos" filters Tipo = Plano → new row gets Tipo = Plano).
 */
export function valuesSatisfyingFilters(db: Pick<DatabaseDef, 'properties'>, filters: Filter[]): Record<string, RowValue> {
  const values: Record<string, RowValue> = {}
  for (const f of filters) {
    const prop = getProperty(db, f.propertyId)
    if (!prop || isComputed(prop.type) || prop.type === 'title') continue
    if ((prop.type === 'select' || prop.type === 'status') && f.op === 'is' && typeof f.value === 'string') {
      values[prop.id] = f.value
    } else if ((prop.type === 'multi_select' || prop.type === 'person' || prop.type === 'relation') && f.op === 'contains' && typeof f.value === 'string') {
      values[prop.id] = [f.value]
    } else if (prop.type === 'checkbox' && f.op === 'checked') {
      values[prop.id] = true
    } else if (prop.type === 'date' && f.op === 'is' && f.value) {
      values[prop.id] = resolveDateToken(f.value)
    }
  }
  return values
}
