import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getAuthUserId, verifyPageOwnership } from '@/lib/auth-helpers'

type ColumnMove = {
  id: string
  position: number
}

/**
 * Bulk-reorder columns in a single transaction.
 *
 * Body: { pageId: string, moves: ColumnMove[] }
 */
export async function POST(req: Request) {
  const userId = await getAuthUserId()
  if (!userId) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  try {
    const body = await req.json()
    const pageId = (body?.pageId ?? '').toString()
    const moves: ColumnMove[] = Array.isArray(body?.moves) ? body.moves : []

    if (!pageId) {
      return NextResponse.json({ error: 'pageId requerido' }, { status: 400 })
    }
    const owns = await verifyPageOwnership(userId, pageId)
    if (!owns) {
      return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
    }

    if (moves.length === 0) {
      return NextResponse.json({ ok: true, updated: 0 })
    }

    // Verify ownership of each column
    const columns = await db.column.findMany({
      where: { id: { in: moves.map((m) => m.id) } },
      select: { id: true, pageId: true },
    })
    for (const move of moves) {
      const col = columns.find((c) => c.id === move.id)
      if (!col || col.pageId !== pageId) {
        return NextResponse.json({ error: 'Columna no válida' }, { status: 400 })
      }
    }

    await db.$transaction(
      moves.map((m) =>
        db.column.update({
          where: { id: m.id },
          data: { position: m.position },
        })
      )
    )

    return NextResponse.json({ ok: true, updated: moves.length })
  } catch (err) {
    console.error('[columns reorder]', err)
    return NextResponse.json(
      { error: 'No se pudo reordenar' },
      { status: 500 }
    )
  }
}
