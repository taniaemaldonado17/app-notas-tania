/**
 * Building databases, properties, views and dashboard sections from what
 * Claude asks for in plain words ("Fecha antes de hoy", "agrupar por
 * Responsable"…). Pure: the connector tools load and save around it.
 */
import {
  describeDateToken,
  filterOpsFor,
  makeView,
  newId,
  TITLE_PROPERTY_ID,
  VIEW_TYPE_LABELS,
  type DatabaseDef,
  type Filter,
  type FilterOp,
  type LayoutSection,
  type NumberFormat,
  type OptionColor,
  type PageLayout,
  type PropertyDef,
  type PropertyType,
  type QuickAction,
  type RowValue,
  type Sort,
  type StatItem,
  type ViewDef,
  type ViewType,
} from '../db-types.ts'

/** Something Claude can fix by asking differently. */
export class StructureError extends Error {}

export type Person = { id: string; name: string }

const loose = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .toLowerCase()

/* --------------------------------- Lookups --------------------------------- */

export function findProperty(db: Pick<DatabaseDef, 'properties' | 'title'>, ref: string): PropertyDef {
  const p = db.properties.find((x) => x.id === ref) ?? db.properties.find((x) => loose(x.name) === loose(ref))
  if (!p) throw new StructureError(`"${db.title}" no tiene la propiedad "${ref}". Tiene: ${db.properties.map((x) => x.name).join(', ')}`)
  return p
}

function findOptionId(prop: PropertyDef, name: unknown): string {
  const n = loose(String(name ?? ''))
  const opt = prop.options?.find((o) => o.id === name) ?? prop.options?.find((o) => loose(o.name) === n)
  if (!opt) throw new StructureError(`"${String(name)}" no es una opción de "${prop.name}". Opciones: ${(prop.options ?? []).map((o) => o.name).join(', ')}`)
  return opt.id
}

export function findView(db: DatabaseDef, ref: string): ViewDef {
  const v = db.views.find((x) => x.id === ref) ?? db.views.find((x) => loose(x.name) === loose(ref))
  if (!v) throw new StructureError(`"${db.title}" no tiene la vista "${ref}". Tiene: ${db.views.map((x) => x.name).join(', ')}`)
  return v
}

/* -------------------------------- Properties ------------------------------- */

const TYPE_ALIASES: Record<string, PropertyType> = {
  texto: 'text', text: 'text',
  numero: 'number', number: 'number', monto: 'number',
  seleccion: 'select', select: 'select',
  estado: 'status', status: 'status',
  seleccion_multiple: 'multi_select', multi_select: 'multi_select', etiquetas: 'multi_select',
  fecha: 'date', date: 'date',
  persona: 'person', personas: 'person', person: 'person',
  casilla: 'checkbox', checkbox: 'checkbox',
  url: 'url', enlace: 'url',
  email: 'email', correo: 'email',
  telefono: 'phone', phone: 'phone',
  relacion: 'relation', relation: 'relation',
  formula: 'formula',
  fecha_de_creacion: 'created_time', fecha_creacion: 'created_time', created_time: 'created_time',
  ultima_edicion: 'updated_time', updated_time: 'updated_time',
}

const PALETTE: OptionColor[] = ['blue', 'green', 'yellow', 'orange', 'purple', 'pink', 'red', 'brown', 'gray']
const COLOR_ALIASES: Record<string, OptionColor> = {
  gris: 'gray', gray: 'gray', marron: 'brown', brown: 'brown', naranja: 'orange', orange: 'orange', amarillo: 'yellow', yellow: 'yellow',
  verde: 'green', green: 'green', azul: 'blue', blue: 'blue', violeta: 'purple', purple: 'purple', rosa: 'pink', pink: 'pink',
  rojo: 'red', red: 'red', predeterminado: 'default', default: 'default',
}
export const colorOf = (v: unknown, i = 0): OptionColor => COLOR_ALIASES[loose(String(v ?? '')).replace(/ /g, '_')] ?? PALETTE[i % PALETTE.length]

const FORMATS: Record<string, NumberFormat> = { numero: 'number', number: 'number', porcentaje: 'percent', percent: 'percent', pesos: 'ars', ars: 'ars', dolares: 'usd', usd: 'usd', euros: 'eur', eur: 'eur' }

export type PropertySpec = {
  nombre: string
  tipo: string
  opciones?: (string | { nombre: string; color?: string })[]
  /** relation: id or name of the target database (same page) */
  relacion_con?: string
  /** relation: name of the property that lists them back in the target database */
  inversa?: string
  formato?: string
  formula?: string
}

/**
 * A new property for `db`, plus (for relations) the property to add to the
 * target database so it lists them back.
 */
export function buildProperty(
  db: Pick<DatabaseDef, 'id' | 'properties' | 'title'>,
  spec: PropertySpec,
  databases: Pick<DatabaseDef, 'id' | 'title' | 'properties'>[]
): { property: PropertyDef; backlink?: { databaseId: string; property: PropertyDef } } {
  const name = String(spec.nombre ?? '').trim().slice(0, 200)
  if (!name) throw new StructureError('Cada propiedad necesita un nombre')
  if (db.properties.some((p) => loose(p.name) === loose(name))) throw new StructureError(`"${db.title}" ya tiene una propiedad "${name}"`)
  const type = TYPE_ALIASES[loose(String(spec.tipo ?? '')).replace(/ /g, '_')]
  if (!type) throw new StructureError(`Tipo de propiedad desconocido: "${spec.tipo}". Tipos: texto, numero, seleccion, estado, seleccion_multiple, fecha, persona, casilla, url, email, telefono, relacion, formula, fecha_de_creacion, ultima_edicion`)
  const property: PropertyDef = { id: newId('prop'), name, type }
  if (type === 'select' || type === 'status' || type === 'multi_select') {
    property.options = (spec.opciones ?? []).map((o, i) => {
      const n = typeof o === 'string' ? o : o?.nombre
      return { id: newId('opt'), name: String(n ?? '').trim().slice(0, 200) || `Opción ${i + 1}`, color: colorOf(typeof o === 'string' ? undefined : o?.color, i) }
    })
  }
  if (type === 'number' && spec.formato) property.numberFormat = FORMATS[loose(spec.formato)] ?? 'number'
  if (type === 'formula') {
    if (!spec.formula) throw new StructureError('Las fórmulas necesitan "formula", por ejemplo prop("Valor") - prop("Facturado")')
    property.formula = String(spec.formula).slice(0, 2000)
    if (spec.formato) property.numberFormat = FORMATS[loose(spec.formato)] ?? 'number'
  }
  if (type !== 'relation') return { property }

  const target = spec.relacion_con
    ? databases.find((d) => d.id === spec.relacion_con) ?? databases.find((d) => loose(d.title) === loose(spec.relacion_con!))
    : undefined
  if (!target) throw new StructureError(`Las relaciones necesitan "relacion_con": una base de esta página (${databases.map((d) => d.title).join(', ')})`)
  property.relationDatabaseId = target.id
  if (target.id === db.id) return { property }
  let back = String(spec.inversa ?? db.title).trim().slice(0, 200) || db.title
  if (target.properties.some((p) => loose(p.name) === loose(back))) back = `${back} (${db.title})`
  return {
    property,
    backlink: {
      databaseId: target.id,
      property: { id: newId('prop'), name: back, type: 'backlink', backlinkDatabaseId: db.id, backlinkPropertyId: property.id },
    },
  }
}

/** Title property of a new database. */
export const titleProperty = (name?: string): PropertyDef => ({ id: TITLE_PROPERTY_ID, name: name?.trim().slice(0, 200) || 'Nombre', type: 'title' })

/* --------------------------------- Filters --------------------------------- */

const OP_ALIASES: Record<string, FilterOp> = {
  es: 'is', is: 'is', igual: 'is',
  no_es: 'is_not', is_not: 'is_not', distinto: 'is_not',
  contiene: 'contains', contains: 'contains', incluye: 'contains',
  no_contiene: 'not_contains', not_contains: 'not_contains',
  vacio: 'is_empty', esta_vacio: 'is_empty', is_empty: 'is_empty',
  no_vacio: 'is_not_empty', no_esta_vacio: 'is_not_empty', is_not_empty: 'is_not_empty',
  '=': 'eq', eq: 'eq', '!=': 'neq', '≠': 'neq', neq: 'neq',
  '>': 'gt', gt: 'gt', mayor: 'gt', '<': 'lt', lt: 'lt', menor: 'lt',
  '>=': 'gte', '≥': 'gte', gte: 'gte', '<=': 'lte', '≤': 'lte', lte: 'lte',
  antes: 'before', antes_de: 'before', before: 'before',
  despues: 'after', despues_de: 'after', after: 'after',
  hasta: 'on_or_before', en_o_antes: 'on_or_before', on_or_before: 'on_or_before',
  desde: 'on_or_after', en_o_despues: 'on_or_after', on_or_after: 'on_or_after',
  marcada: 'checked', checked: 'checked', sin_marcar: 'unchecked', unchecked: 'unchecked',
}

/** 'hoy', 'hoy+7', 'hoy-3', 'today+7' or 'YYYY-MM-DD' → stored filter value. */
export function dateValue(v: unknown): string {
  const s = String(v ?? '').trim().toLowerCase().replace(/\s+/g, '')
  const rel = /^(?:hoy|today)(?:([+-])(\d{1,4}))?$/.exec(s)
  if (rel) return rel[1] ? `today${rel[1]}${rel[2]}` : 'today'
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  throw new StructureError(`Fecha no válida: "${String(v)}". Usá AAAA-MM-DD, "hoy", "hoy+7" o "hoy-7"`)
}

export type FilterSpec = { propiedad: string; op: string; valor?: unknown }

export function buildFilter(db: DatabaseDef, spec: FilterSpec, databases: DatabaseDef[], people: Person[]): Filter {
  const prop = findProperty(db, String(spec.propiedad ?? ''))
  const op = OP_ALIASES[String(spec.op ?? '').trim().toLowerCase().replace(/\s+/g, '_')]
  const allowed = filterOpsFor(prop.type)
  const def = allowed.find((o) => o.op === op)
  if (!op || !def) throw new StructureError(`"${spec.op}" no sirve para "${prop.name}" (${prop.type}). Opciones: ${allowed.map((o) => o.op).join(', ')}`)
  const filter: Filter = { id: newId('f'), propertyId: prop.id, op }
  if (!def.needsValue) return filter
  const v = spec.valor
  if (v === undefined || v === null || v === '') throw new StructureError(`El filtro de "${prop.name}" necesita un valor`)
  switch (prop.type) {
    case 'select':
    case 'status':
    case 'multi_select':
      filter.value = findOptionId(prop, v)
      break
    case 'person': {
      const n = loose(String(v))
      const person = people.find((p) => p.id === v) ?? people.find((p) => loose(p.name) === n) ?? people.find((p) => loose(p.name).startsWith(n))
      if (!person) throw new StructureError(`No encontré a "${String(v)}" entre las personas de la página: ${people.map((p) => p.name).join(', ')}`)
      filter.value = person.id
      break
    }
    case 'relation':
    case 'backlink': {
      const targetId = prop.type === 'relation' ? prop.relationDatabaseId : prop.backlinkDatabaseId
      const rows = databases.find((d) => d.id === targetId)?.rows ?? []
      const row = rows.find((r) => r.id === v) ?? rows.find((r) => loose(r.title) === loose(String(v)))
      if (!row) throw new StructureError(`No encontré la fila "${String(v)}" para filtrar "${prop.name}"`)
      filter.value = row.id
      break
    }
    case 'date':
    case 'created_time':
    case 'updated_time':
      filter.value = dateValue(v)
      break
    case 'number':
    case 'formula': {
      const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'))
      if (!Number.isFinite(n)) throw new StructureError(`El filtro de "${prop.name}" espera un número`)
      filter.value = n
      break
    }
    default:
      filter.value = String(v).slice(0, 500)
  }
  return filter
}

/* ---------------------------------- Views ---------------------------------- */

const VIEW_ALIASES: Record<string, ViewType> = {
  tabla: 'table', table: 'table', tablero: 'board', board: 'board', kanban: 'board', galeria: 'gallery', gallery: 'gallery',
  calendario: 'calendar', calendar: 'calendar', cronograma: 'timeline', timeline: 'timeline', gantt: 'timeline', lista: 'list', list: 'list',
}

export type ViewSpec = {
  nombre: string
  tipo: string
  icono?: string
  filtros?: FilterSpec[]
  orden?: { propiedad: string; direccion?: string }[]
  agrupar_por?: string
  fecha?: string
  fecha_fin?: string
  portada?: string
  propiedades_visibles?: string[]
}

export function buildView(db: DatabaseDef, spec: ViewSpec, databases: DatabaseDef[], people: Person[]): ViewDef {
  const type = VIEW_ALIASES[loose(String(spec.tipo ?? ''))]
  if (!type) throw new StructureError(`Tipo de vista desconocido: "${spec.tipo}". Tipos: tabla, tablero, galeria, calendario, cronograma, lista`)
  const name = String(spec.nombre ?? '').trim().slice(0, 200) || VIEW_TYPE_LABELS[type]
  const view = makeView(type, db, name)
  if (spec.icono) view.icon = String(spec.icono).slice(0, 16)
  view.filters = (spec.filtros ?? []).map((f) => buildFilter(db, f, databases, people))
  view.sorts = (spec.orden ?? []).map((o): Sort => ({
    propertyId: findProperty(db, o.propiedad).id,
    direction: /^desc|^des|^z/i.test(String(o.direccion ?? '')) ? 'desc' : 'asc',
  }))
  if (spec.propiedades_visibles) {
    view.visibleProperties = spec.propiedades_visibles.map((n) => findProperty(db, n)).filter((p) => p.type !== 'title').map((p) => p.id)
  }
  if (spec.agrupar_por) {
    const p = findProperty(db, spec.agrupar_por)
    if (!['select', 'status', 'multi_select', 'person', 'checkbox'].includes(p.type)) {
      throw new StructureError(`Solo se puede agrupar por selección, estado, selección múltiple, persona o casilla ("${p.name}" es ${p.type})`)
    }
    view.groupBy = p.id
  }
  if (type === 'board' && !view.groupBy) throw new StructureError('Los tableros necesitan "agrupar_por"')
  const dateProp = (ref: string) => {
    const p = findProperty(db, ref)
    if (!['date', 'created_time', 'updated_time'].includes(p.type)) throw new StructureError(`"${p.name}" no es una fecha`)
    return p.id
  }
  if (spec.fecha) view.dateProperty = dateProp(spec.fecha)
  if (spec.fecha_fin) view.endDateProperty = dateProp(spec.fecha_fin)
  if ((type === 'calendar' || type === 'timeline') && !view.dateProperty) throw new StructureError(`Las vistas de ${VIEW_TYPE_LABELS[type].toLowerCase()} necesitan "fecha"`)
  if (spec.portada) view.coverProperty = findProperty(db, spec.portada).id
  return view
}

/* --------------------------- Dashboard (layout) ---------------------------- */

const sectionLabel = (s: LayoutSection) =>
  s.type === 'view' ? s.title : s.type === 'heading' ? s.text : s.type === 'actions' ? 'acciones rápidas' : 'indicadores'

/** Where to put a new section: 'inicio', 'final' (default) or 'despues_de:<título>'. */
export function insertSection(layout: PageLayout, section: LayoutSection, position?: string): PageLayout {
  const sections = [...layout.sections]
  const pos = String(position ?? 'final').trim()
  let at = sections.length
  if (/^inicio$/i.test(pos)) at = 0
  else if (/^(despues_de|antes_de):/i.test(pos)) {
    const [kind, ...rest] = pos.split(':')
    const n = loose(rest.join(':'))
    const i = sections.findIndex((s) => loose(sectionLabel(s)) === n) >= 0 ? sections.findIndex((s) => loose(sectionLabel(s)) === n) : sections.findIndex((s) => loose(sectionLabel(s)).includes(n))
    if (i < 0) throw new StructureError(`No encontré la sección "${rest.join(':')}". Secciones: ${sections.map(sectionLabel).join(' · ')}`)
    at = /^despues/i.test(kind) ? i + 1 : i
  } else if (!/^final$/i.test(pos)) {
    throw new StructureError('posicion tiene que ser "inicio", "final", "despues_de:<título>" o "antes_de:<título>"')
  }
  sections.splice(at, 0, section)
  return { ...layout, sections }
}

/** Adds an item to the first section of that kind (creating it if there's none). */
export function addToGroup(layout: PageLayout, kind: 'actions' | 'stats', item: QuickAction | StatItem): PageLayout {
  const i = layout.sections.findIndex((s) => s.type === kind)
  if (i >= 0) {
    const sections = layout.sections.map((s, k) => (k === i ? ({ ...s, items: [...(s as { items: unknown[] }).items, item] } as LayoutSection) : s))
    return { ...layout, sections }
  }
  const section = { id: newId('sec'), type: kind, items: [item] } as LayoutSection
  // Actions go first; stats right after the actions.
  const at = kind === 'actions' ? 0 : layout.sections.findIndex((s) => s.type === 'actions') + 1
  const sections = [...layout.sections]
  sections.splice(at, 0, section)
  return { ...layout, sections }
}

/** Values for a quick action: by property name, options by name, dates may be 'hoy+N'. */
export function actionValues(db: DatabaseDef, input: Record<string, unknown> | undefined, people: Person[], databases: DatabaseDef[]): Record<string, RowValue> {
  const out: Record<string, RowValue> = {}
  for (const [k, v] of Object.entries(input ?? {})) {
    const prop = findProperty(db, k)
    switch (prop.type) {
      case 'select':
      case 'status':
        out[prop.id] = findOptionId(prop, v)
        break
      case 'multi_select':
        out[prop.id] = (Array.isArray(v) ? v : [v]).map((x) => findOptionId(prop, x))
        break
      case 'date':
        out[prop.id] = dateValue(v)
        break
      case 'checkbox':
        out[prop.id] = v === true || /^(si|sí|true|1|x)$/i.test(String(v))
        break
      case 'number':
        out[prop.id] = Number(v)
        break
      case 'person':
        out[prop.id] = (Array.isArray(v) ? v : [v]).map((x) => buildFilter(db, { propiedad: prop.id, op: 'contiene', valor: x }, databases, people).value as string)
        break
      case 'relation':
        out[prop.id] = (Array.isArray(v) ? v : [v]).map((x) => buildFilter(db, { propiedad: prop.id, op: 'contiene', valor: x }, databases, people).value as string)
        break
      case 'title':
      case 'formula':
      case 'backlink':
      case 'created_time':
      case 'updated_time':
        throw new StructureError(`"${prop.name}" no se puede completar desde una acción rápida`)
      default:
        out[prop.id] = String(v)
    }
  }
  return out
}

/* ------------------------------- Description ------------------------------- */

/** The page's databases, views and dashboard, as Claude reads them. */
export function describeStructure(databases: DatabaseDef[], layout: PageLayout | null, people: Person[]) {
  const dbTitle = (id?: string) => databases.find((d) => d.id === id)?.title ?? id
  const propName = (db: DatabaseDef | undefined, id?: string) => db?.properties.find((p) => p.id === id)?.name ?? id
  const filterText = (db: DatabaseDef, f: Filter) => {
    const prop = db.properties.find((p) => p.id === f.propertyId)
    const op = prop ? filterOpsFor(prop.type).find((o) => o.op === f.op)?.label ?? f.op : f.op
    let v = ''
    if (f.value !== undefined && f.value !== null && f.value !== '') {
      if (prop?.options) v = prop.options.find((o) => o.id === f.value)?.name ?? String(f.value)
      else if (prop?.type === 'person') v = people.find((p) => p.id === f.value)?.name ?? String(f.value)
      else if (prop && ['date', 'created_time', 'updated_time'].includes(prop.type)) v = describeDateToken(f.value)
      else if (prop?.type === 'relation' || prop?.type === 'backlink') {
        v = databases.flatMap((d) => d.rows).find((r) => r.id === f.value)?.title ?? String(f.value)
      } else v = String(f.value)
    }
    return `${prop?.name ?? f.propertyId} ${op}${v ? ` ${v}` : ''}`
  }
  return {
    bases: databases.map((d) => ({
      id: d.id,
      titulo: d.title,
      icono: d.icon,
      filas: d.rows.length,
      propiedades: d.properties.map((p) => ({
        nombre: p.name,
        tipo: p.type,
        ...(p.options ? { opciones: p.options.map((o) => o.name) } : {}),
        ...(p.relationDatabaseId ? { relacion_con: dbTitle(p.relationDatabaseId) } : {}),
        ...(p.type === 'backlink' ? { lista_de: dbTitle(p.backlinkDatabaseId) } : {}),
        ...(p.formula ? { formula: p.formula } : {}),
      })),
      vistas: d.views.map((v) => ({
        id: v.id,
        nombre: v.name,
        tipo: VIEW_TYPE_LABELS[v.type] ?? v.type,
        ...(v.filters.length ? { filtros: v.filters.map((f) => filterText(d, f)) } : {}),
        ...(v.sorts.length ? { orden: v.sorts.map((s) => `${propName(d, s.propertyId)} ${s.direction === 'desc' ? '↓' : '↑'}`) } : {}),
        ...(v.groupBy ? { agrupar_por: propName(d, v.groupBy) } : {}),
        ...(v.dateProperty ? { fecha: propName(d, v.dateProperty) } : {}),
      })),
    })),
    tablero: (layout?.sections ?? []).map((s) => {
      if (s.type === 'view') return { seccion: 'vista', titulo: s.title, base: dbTitle(s.databaseId), vista: databases.find((d) => d.id === s.databaseId)?.views.find((v) => v.id === s.viewId)?.name ?? s.viewId }
      if (s.type === 'heading') return { seccion: 'título', texto: s.text }
      if (s.type === 'actions') return { seccion: 'acciones rápidas', acciones: s.items.map((a) => `${a.label} → ${dbTitle(a.databaseId)}${a.content ? ' (con plantilla)' : ''}`) }
      return {
        seccion: 'indicadores',
        indicadores: s.items.map((it) => {
          const d = databases.find((x) => x.id === it.databaseId)
          const filters = d ? it.filters.map((f) => filterText(d, f)) : []
          return `${it.label}: ${it.aggregate === 'sum' ? `suma de ${propName(d, it.propertyId)}` : 'cantidad'} en ${dbTitle(it.databaseId)}${filters.length ? ` (${filters.join(', ')})` : ''}`
        }),
      }
    }),
    personas: people.map((p) => p.name),
  }
}

