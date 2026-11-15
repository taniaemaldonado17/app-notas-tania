import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getAuthUserId } from '@/lib/auth-helpers'

type CardMove = {
  id: string
  columnId: string
  position: number
}

/**
 * Bulk-reorder/move cards in a single transaction.
 *
 * Body: { moves: CardMove[] }
 * Each move must point to a card+column owned by the authenticated user.
 */
export async function POST(req: Request) {
  const userId = await getAuthUserId()
  if (!userId) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  try {
    const body = await req.json()
    const moves: CardMove[] = Array.isArray(body?.moves) ? body.moves : []
    if (moves.length === 0) {
      return NextResponse.json({ ok: true, updated: 0 })
    }

    // Verify ownership of every card and every destination column.
    const cardIds = moves.map((m) => m.id)
    const columnIds = Array.from(new Set(moves.map((m) => m.columnId)))

    const cards = await db.card.findMany({
      where: { id: { in: cardIds } },
      select: {
        id: true,
        column: { select: { page: { select: { userId: true } } } },
      },
    })
    const columns = await db.column.findMany({
      where: { id: { in: columnIds } },
      select: { id: true, page: { select: { userId: true } } },
    })

    const cardOwners = new Map(cards.map((c) => [c.id, c.column.page.userId]))
    const columnOwners = new Map(columns.map((c) => [c.id, c.page.userId]))

    for (const move of moves) {
      if (cardOwners.get(move.id) !== userId) {
        return NextResponse.json({ error: 'Tarjeta no autorizada' }, { status: 403 })
      }
      if (columnOwners.get(move.columnId) !== userId) {
        return NextResponse.json({ error: 'Columna destino no autorizada' }, { status: 403 })
      }
    }

    await db.$transaction(
      moves.map((m) =>
        db.card.update({
          where: { id: m.id },
          data: { columnId: m.columnId, position: m.position },
        })
      )
    )

    return NextResponse.json({ ok: true, updated: moves.length })
  } catch (err) {
    console.error('[cards reorder]', err)
    return NextResponse.json(
      { error: 'No se pudo reordenar' },
      { status: 500 }
    )
  }
}
