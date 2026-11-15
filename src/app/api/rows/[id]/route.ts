import { NextResponse } from 'next/server'
import type { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { getAuthUserId } from '@/lib/auth-helpers'
import { findAccessibleRow, rowSelect, sanitizeValues, serializeRow } from '@/lib/db-server'

/** Row with its page content and comments (opened in the side panel). */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getAuthUserId()
  if (!userId) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }
  const { id } = await params
  if (!(await findAccessibleRow(userId, id))) {
    return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
  }

  const row = await db.dbRow.findUnique({
    where: { id },
    select: {
      ...rowSelect,
      content: true,
      database: { select: { pageId: true } },
      comments: {
        orderBy: { createdAt: 'asc' },
        select: { id: true, text: true, createdAt: true, user: { select: { name: true, email: true } } },
      },
    },
  })
  if (!row) {
    return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
  }
  const { content, comments, database, ...rest } = row
  return NextResponse.json({
    row: serializeRow(rest),
    pageId: database.pageId,
    content,
    comments: comments.map((c) => ({ ...c, createdAt: c.createdAt.toISOString() })),
  })
}

/**
 * Update a row. `values` is merged key by key, so two people editing
 * different properties of the same row don't overwrite each other.
 * Body: { title?, icon?, values?, content?, position? }
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getAuthUserId()
  if (!userId) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }
  const { id } = await params
  if (!(await findAccessibleRow(userId, id))) {
    return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
  }

  try {
    const body = await req.json()
    const data: Prisma.DbRowUpdateInput = {}
    if (typeof body.title === 'string') data.title = body.title.slice(0, 2000)
    if (body.icon === null || typeof body.icon === 'string') data.icon = body.icon ? String(body.icon).slice(0, 16) : null
    if (body.content === null || typeof body.content === 'string') data.content = body.content || null
    if (typeof body.position === 'number' && Number.isFinite(body.position)) data.position = body.position

    let patch: Record<string, unknown> | null = null
    if (body.values !== undefined) {
      patch = sanitizeValues(body.values)
      if (!patch) {
        return NextResponse.json({ error: 'Valores inválidos' }, { status: 400 })
      }
    }

    const updated = await db.$transaction(async (tx) => {
      if (patch && Object.keys(patch).length > 0) {
        const current = await tx.dbRow.findUnique({ where: { id }, select: { values: true } })
        const base =
          current?.values && typeof current.values === 'object' && !Array.isArray(current.values)
            ? (current.values as Record<string, unknown>)
            : {}
        const merged: Record<string, unknown> = { ...base }
        for (const [k, v] of Object.entries(patch)) {
          if (v === null) delete merged[k]
          else merged[k] = v
        }
        data.values = merged as Prisma.InputJsonValue
      }
      return tx.dbRow.update({ where: { id }, data, select: rowSelect })
    })
    return NextResponse.json({ row: serializeRow(updated) })
  } catch (err) {
    console.error('[rows PATCH]', err)
    return NextResponse.json({ error: 'No se pudo guardar' }, { status: 500 })
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getAuthUserId()
  if (!userId) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }
  const { id } = await params
  if (!(await findAccessibleRow(userId, id))) {
    return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
  }
  await db.dbRow.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
