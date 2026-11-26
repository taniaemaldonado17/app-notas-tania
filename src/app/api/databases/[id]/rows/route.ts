import { NextResponse } from 'next/server'
import { saveVersionBeforeChange } from '@/lib/versions'
import { db } from '@/lib/db'
import { getAuthUserId } from '@/lib/auth-helpers'
import { findAccessibleDatabase, rowSelect, sanitizeValues, serializeRow } from '@/lib/db-server'

/** Create a row. Body: { title?, icon?, values?, position?, content? } (content: initial page, e.g. from a template) */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getAuthUserId()
  if (!userId) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }
  const { id } = await params
  const found = await findAccessibleDatabase(userId, id)
  if (!found) {
    return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
  }
  await saveVersionBeforeChange(found.pageId, userId)

  try {
    const body = await req.json().catch(() => ({}))
    const values = body?.values === undefined ? {} : sanitizeValues(body.values)
    if (!values) {
      return NextResponse.json({ error: 'Valores inválidos' }, { status: 400 })
    }
    let position = typeof body?.position === 'number' && Number.isFinite(body.position) ? body.position : null
    if (position === null) {
      const last = await db.dbRow.aggregate({ where: { databaseId: id }, _max: { position: true } })
      position = (last._max.position ?? -1) + 1
    }

    const row = await db.dbRow.create({
      data: {
        databaseId: id,
        title: typeof body?.title === 'string' ? body.title.slice(0, 2000) : '',
        icon: typeof body?.icon === 'string' && body.icon ? body.icon.slice(0, 16) : null,
        values,
        position,
        createdById: userId,
        content: typeof body?.content === 'string' && body.content && body.content.length <= 1_000_000 ? body.content : null,
      },
      select: rowSelect,
    })
    return NextResponse.json({ row: serializeRow(row) })
  } catch (err) {
    console.error('[rows POST]', err)
    return NextResponse.json({ error: 'No se pudo crear la fila' }, { status: 500 })
  }
}
