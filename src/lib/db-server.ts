import type { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { accessiblePageWhere } from '@/lib/auth-helpers'
import {
  defaultProperties,
  makeView,
  newId,
  type DatabaseDef,
  type PageLayout,
  type PropertyDef,
  type RowValue,
  type ViewDef,
} from '@/lib/db-types'
import type { BuiltTemplate } from '@/lib/templates/arquitectura'

/** Max JSON size accepted for a database schema (properties + views). */
const MAX_SCHEMA_BYTES = 200_000
/** Max JSON size of one row's values. */
const MAX_VALUES_BYTES = 50_000

/* ------------------------------ Serialisation ------------------------------ */

const rowSelect = {
  id: true,
  databaseId: true,
  title: true,
  icon: true,
  values: true,
  position: true,
  createdById: true,
  createdAt: true,
  updatedAt: true,
  _count: { select: { comments: true } },
} satisfies Prisma.DbRowSelect

type RowRecord = Prisma.DbRowGetPayload<{ select: typeof rowSelect }>

export function serializeRow(r: RowRecord) {
  return {
    id: r.id,
    databaseId: r.databaseId,
    title: r.title,
    icon: r.icon,
    values: (r.values && typeof r.values === 'object' && !Array.isArray(r.values) ? r.values : {}) as Record<string, RowValue>,
    position: r.position,
    createdById: r.createdById,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    commentCount: r._count.comments,
  }
}

export const databaseInclude = {
  rows: { select: rowSelect, orderBy: [{ position: 'asc' }, { createdAt: 'asc' }] },
} satisfies Prisma.DatabaseInclude

type DatabaseRecord = Prisma.DatabaseGetPayload<{ include: typeof databaseInclude }>

export function serializeDatabase(d: DatabaseRecord): DatabaseDef {
  return {
    id: d.id,
    pageId: d.pageId,
    title: d.title,
    icon: d.icon,
    position: d.position,
    properties: Array.isArray(d.properties) ? (d.properties as unknown as PropertyDef[]) : [],
    views: Array.isArray(d.views) ? (d.views as unknown as ViewDef[]) : [],
    rows: d.rows.map(serializeRow) as DatabaseDef['rows'],
  }
}

export { rowSelect }

/* ------------------------------- Validation -------------------------------- */

function sizeOf(v: unknown): number {
  return JSON.stringify(v ?? null).length
}

export function validProperties(v: unknown): v is PropertyDef[] {
  return (
    Array.isArray(v) &&
    v.length > 0 &&
    v.length <= 200 &&
    v.every((p) => p && typeof p === 'object' && typeof p.id === 'string' && typeof p.name === 'string' && typeof p.type === 'string') &&
    v.some((p) => p.type === 'title') &&
    sizeOf(v) <= MAX_SCHEMA_BYTES
  )
}

export function validViews(v: unknown): v is ViewDef[] {
  return (
    Array.isArray(v) &&
    v.length > 0 &&
    v.length <= 50 &&
    v.every((x) => x && typeof x === 'object' && typeof x.id === 'string' && typeof x.type === 'string') &&
    sizeOf(v) <= MAX_SCHEMA_BYTES
  )
}

export function validLayout(v: unknown): v is PageLayout {
  return (
    !!v &&
    typeof v === 'object' &&
    Array.isArray((v as PageLayout).sections) &&
    (v as PageLayout).sections.length <= 100 &&
    sizeOf(v) <= MAX_SCHEMA_BYTES
  )
}

/** Keeps only plain JSON values (string, number, boolean, null, string[]). */
export function sanitizeValues(v: unknown): Record<string, RowValue> | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null
  const out: Record<string, RowValue> = {}
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    if (k.length > 100) continue
    if (val === null || typeof val === 'string' || typeof val === 'boolean') out[k] = val as RowValue
    else if (typeof val === 'number' && Number.isFinite(val)) out[k] = val
    else if (Array.isArray(val) && val.every((x) => typeof x === 'string')) out[k] = (val as string[]).slice(0, 500)
  }
  if (sizeOf(out) > MAX_VALUES_BYTES) return null
  return out
}

/* ------------------------------- Access ------------------------------------ */

export async function findAccessibleDatabase(userId: string, databaseId: string) {
  return db.database.findFirst({
    where: { id: databaseId, page: accessiblePageWhere(userId) },
    select: { id: true, pageId: true },
  })
}

export async function findAccessibleRow(userId: string, rowId: string) {
  return db.dbRow.findFirst({
    where: { id: rowId, database: { page: accessiblePageWhere(userId) } },
    select: { id: true, databaseId: true, values: true, database: { select: { pageId: true } } },
  })
}

/* ------------------------------- Creation ---------------------------------- */

/** A fresh database with a few starter properties and a table view. */
export function blankDatabase(title = 'Base de datos') {
  const properties = defaultProperties()
  const table = makeView('table', { properties }, 'Tabla')
  return { title, icon: '🗃️', properties, views: [table] }
}

export async function createDatabasesPage(
  userId: string,
  opts: { title: string; icon: string | null; subtitle: string | null; template: BuiltTemplate | null }
) {
  const { template } = opts
  const pageId = newId('page').replace('page_', 'pg')

  const databases = template
    ? template.databases
    : [{ id: newId('db'), position: 0, ...blankDatabase(), rows: [] }]

  const layout: PageLayout = template
    ? template.layout
    : {
        showSources: true,
        sections: [],
      }

  await db.$transaction([
    db.page.create({
      data: {
        id: pageId,
        kind: 'databases',
        title: template?.title ?? opts.title,
        icon: template?.icon ?? opts.icon,
        subtitle: template?.subtitle ?? opts.subtitle,
        layout: layout as unknown as Prisma.InputJsonValue,
        userId,
      },
    }),
    ...databases.map((d) =>
      db.database.create({
        data: {
          id: d.id,
          pageId,
          title: d.title,
          icon: d.icon,
          position: d.position,
          properties: d.properties as unknown as Prisma.InputJsonValue,
          views: d.views as unknown as Prisma.InputJsonValue,
        },
      })
    ),
    ...databases.flatMap((d) =>
      d.rows.length
        ? [
            db.dbRow.createMany({
              data: d.rows.map((r) => ({
                id: r.id,
                databaseId: d.id,
                title: r.title,
                icon: r.icon,
                position: r.position,
                values: r.values as Prisma.InputJsonValue,
                content: r.content ?? null,
                createdById: userId,
              })),
            }),
          ]
        : []
    ),
  ])

  return pageId
}
