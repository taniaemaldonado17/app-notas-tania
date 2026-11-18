import { NextResponse } from 'next/server'
import type { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { canAccessPage, getAuthUserId } from '@/lib/auth-helpers'
import {
  databaseInclude,
  findAccessibleDatabase,
  sanitizeValues,
  serializeDatabase,
  validProperties,
} from '@/lib/db-server'
import { makeView, newId, type PropertyDef, type RowValue, type ViewDef } from '@/lib/db-types'
import { MAX_IMPORT_ROWS } from '@/lib/db-import'

type IncomingRow = { title?: unknown; values?: unknown }

/**
 * Import a table in one go.
 * - New database: { pageId, title, icon?, properties, rows }
 * - Append to an existing one: { databaseId, properties, rows, addToViews? }
 *   (`properties` is the full, updated list: new columns and options included;
 *   `addToViews` are new property ids to show in the table views.)
 * rows: [{ title, values }]
 */
export async function POST(req: Request) {
  const userId = await getAuthUserId()
  if (!userId) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  try {
    const body = await req.json()
    const properties = body?.properties as PropertyDef[]
    if (!validProperties(properties)) {
      return NextResponse.json({ error: 'Columnas inválidas' }, { status: 400 })
    }
    const incoming: IncomingRow[] = Array.isArray(body?.rows) ? body.rows : []
    if (incoming.length > MAX_IMPORT_ROWS) {
      return NextResponse.json({ error: `Máximo ${MAX_IMPORT_ROWS} filas por importación` }, { status: 400 })
    }
    const rows: { title: string; values: Record<string, RowValue> }[] = []
    for (const r of incoming) {
      const values = sanitizeValues(r?.values ?? {})
      if (!values) {
        return NextResponse.json({ error: 'Hay una fila con datos inválidos o demasiado grande' }, { status: 400 })
      }
      rows.push({ title: typeof r?.title === 'string' ? r.title.slice(0, 2000) : '', values })
    }

    let databaseId: string
    let startPosition = 0

    if (typeof body?.databaseId === 'string' && body.databaseId) {
      // Append to an existing database.
      const found = await findAccessibleDatabase(userId, body.databaseId)
      if (!found) {
        return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
      }
      databaseId = found.id
      const current = await db.database.findUnique({ where: { id: databaseId }, select: { views: true } })
      const addToViews: string[] = Array.isArray(body?.addToViews)
        ? body.addToViews.filter((x: unknown): x is string => typeof x === 'string')
        : []
      const views = (Array.isArray(current?.views) ? (current.views as unknown as ViewDef[]) : []).map((v) =>
        v.type === 'table' && addToViews.length
          ? { ...v, visibleProperties: [...v.visibleProperties, ...addToViews.filter((id) => !v.visibleProperties.includes(id))] }
          : v
      )
      const last = await db.dbRow.aggregate({ where: { databaseId }, _max: { position: true } })
      startPosition = (last._max.position ?? -1) + 1
      await db.database.update({
        where: { id: databaseId },
        data: {
          properties: properties as unknown as Prisma.InputJsonValue,
          views: views as unknown as Prisma.InputJsonValue,
        },
      })
    } else {
      // New database on a 'databases' page.
      const pageId = (body?.pageId ?? '').toString()
      if (!pageId || !(await canAccessPage(userId, pageId))) {
        return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
      }
      const title = (body?.title ?? '').toString().trim().slice(0, 200) || 'Base importada'
      const icon = typeof body?.icon === 'string' && body.icon ? body.icon.slice(0, 16) : '📥'
      const views: ViewDef[] = [makeView('table', { properties }, 'Tabla')]
      if (properties.some((p) => p.type === 'status' || p.type === 'select')) {
        views.push(makeView('board', { properties }, 'Tablero'))
      }
      if (properties.some((p) => p.type === 'date')) {
        views.push(makeView('calendar', { properties }, 'Calendario'))
      }
      const lastDb = await db.database.aggregate({ where: { pageId }, _max: { position: true } })
      databaseId = newId('db')
      await db.database.create({
        data: {
          id: databaseId,
          pageId,
          title,
          icon,
          position: (lastDb._max.position ?? -1) + 1,
          properties: properties as unknown as Prisma.InputJsonValue,
          views: views as unknown as Prisma.InputJsonValue,
        },
      })
    }

    if (rows.length) {
      await db.dbRow.createMany({
        data: rows.map((r, i) => ({
          databaseId,
          title: r.title,
          values: r.values as Prisma.InputJsonValue,
          position: startPosition + i,
          createdById: userId,
        })),
      })
    }

    const saved = await db.database.findUniqueOrThrow({ where: { id: databaseId }, include: databaseInclude })
    return NextResponse.json({ database: serializeDatabase(saved), imported: rows.length })
  } catch (err) {
    console.error('[databases import POST]', err)
    return NextResponse.json({ error: 'No se pudo importar la tabla' }, { status: 500 })
  }
}
