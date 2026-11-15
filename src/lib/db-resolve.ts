/**
 * Resolves row values (including computed properties: formulas, backlinks,
 * created/edited time) and applies a view's filters and sorts.
 */
import {
  compareValues,
  findOption,
  getProperty,
  matchesFilter,
  type DatabaseDef,
  type DbRow,
  type Filter,
  type PropertyDef,
  type ResolvedValue,
  type ViewDef,
} from '@/lib/db-types'
import { evaluateFormula, type FormulaValue } from '@/lib/formula'

export type ResolveCtx = {
  /** All databases of the page (for relations and backlinks). */
  databases: DatabaseDef[]
}

const MAX_DEPTH = 6

function backlinkIds(ctx: ResolveCtx, prop: PropertyDef, row: DbRow): string[] {
  const source = ctx.databases.find((d) => d.id === prop.backlinkDatabaseId)
  if (!source || !prop.backlinkPropertyId) return []
  const pid = prop.backlinkPropertyId
  return source.rows
    .filter((r) => {
      const v = r.values[pid]
      return Array.isArray(v) && v.includes(row.id)
    })
    .map((r) => r.id)
}

/** Value of a property as used by filters, sorts and display. */
export function resolveValue(
  ctx: ResolveCtx,
  db: DatabaseDef,
  row: DbRow,
  prop: PropertyDef,
  depth = 0
): ResolvedValue {
  switch (prop.type) {
    case 'title':
      return row.title
    case 'created_time':
      return row.createdAt
    case 'updated_time':
      return row.updatedAt
    case 'backlink':
      return backlinkIds(ctx, prop, row)
    case 'formula': {
      const r = formulaResult(ctx, db, row, prop, depth)
      return r.error ? null : r.value
    }
    default: {
      const v = row.values[prop.id]
      return v === undefined ? null : v
    }
  }
}

/** Value of a property as seen from inside a formula. */
function formulaInput(
  ctx: ResolveCtx,
  db: DatabaseDef,
  row: DbRow,
  prop: PropertyDef,
  depth: number
): FormulaValue {
  const v = resolveValue(ctx, db, row, prop, depth + 1)
  switch (prop.type) {
    case 'select':
    case 'status':
      return findOption(prop, v)?.name ?? ''
    case 'multi_select':
      return Array.isArray(v)
        ? v.map((id) => findOption(prop, id)?.name).filter(Boolean).join(', ')
        : ''
    case 'relation':
    case 'backlink':
    case 'person':
      return Array.isArray(v) ? v.length : 0
    case 'created_time':
    case 'updated_time':
      return typeof v === 'string' ? v.slice(0, 10) : null
    case 'checkbox':
      return v === true
    case 'number':
      return typeof v === 'number' ? v : null
    default:
      if (Array.isArray(v)) return v.join(', ')
      return v === null || v === undefined ? '' : (v as FormulaValue)
  }
}

export function formulaResult(
  ctx: ResolveCtx,
  db: DatabaseDef,
  row: DbRow,
  prop: PropertyDef,
  depth = 0
): { value: FormulaValue; error: string | null } {
  if (depth > MAX_DEPTH) return { value: null, error: 'Fórmula circular' }
  try {
    const value = evaluateFormula(prop.formula ?? '', (name) => {
      const target = db.properties.find(
        (p) => p.name.trim().toLowerCase() === name.trim().toLowerCase()
      )
      if (!target) return undefined
      if (target.id === prop.id) throw new Error('La fórmula se usa a sí misma')
      return formulaInput(ctx, db, row, target, depth)
    })
    return { value, error: null }
  } catch (err) {
    return { value: null, error: err instanceof Error ? err.message : 'Error' }
  }
}

export function rowMatchesFilters(ctx: ResolveCtx, db: DatabaseDef, row: DbRow, filters: Filter[]): boolean {
  return filters.every((f) => {
    const prop = getProperty(db, f.propertyId)
    if (!prop) return true
    return matchesFilter(prop, resolveValue(ctx, db, row, prop), f)
  })
}

/** Rows of a view: filtered, searched and sorted. */
export function viewRows(ctx: ResolveCtx, db: DatabaseDef, view: ViewDef, search = ''): DbRow[] {
  const q = search.trim().toLowerCase()
  let rows = db.rows.filter((r) => rowMatchesFilters(ctx, db, r, view.filters))
  if (q) {
    rows = rows.filter((r) => {
      if (r.title.toLowerCase().includes(q)) return true
      return Object.values(r.values).some((v) =>
        typeof v === 'string' ? v.toLowerCase().includes(q) : false
      )
    })
  }
  const sorts = view.sorts.filter((s) => getProperty(db, s.propertyId))
  if (sorts.length === 0) {
    return [...rows].sort((a, b) => a.position - b.position || a.createdAt.localeCompare(b.createdAt))
  }
  return [...rows].sort((a, b) => {
    for (const s of sorts) {
      const prop = getProperty(db, s.propertyId)
      const c = compareValues(prop, resolveValue(ctx, db, a, prop!), resolveValue(ctx, db, b, prop!))
      if (c !== 0) {
        // Empty values stay last in both directions.
        const va = resolveValue(ctx, db, a, prop!)
        const vb = resolveValue(ctx, db, b, prop!)
        const emptyA = va === null || va === '' || (Array.isArray(va) && va.length === 0)
        const emptyB = vb === null || vb === '' || (Array.isArray(vb) && vb.length === 0)
        if (emptyA !== emptyB) return c
        return s.direction === 'desc' ? -c : c
      }
    }
    return a.position - b.position
  })
}

/** Title of a row in any database of the page (for relation chips). */
export function rowTitle(ctx: ResolveCtx, rowId: string): { title: string; icon: string | null } | null {
  for (const d of ctx.databases) {
    const r = d.rows.find((x) => x.id === rowId)
    if (r) return { title: r.title, icon: r.icon }
  }
  return null
}
