import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getAuthUserId, verifyColumnOwnership } from '@/lib/auth-helpers'
import { cardInclude } from '@/lib/card-include'

export async function POST(req: Request) {
  const userId = await getAuthUserId()
  if (!userId) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  try {
    const body = await req.json()
    const columnId = (body?.columnId ?? '').toString()
    const title = (body?.title ?? '').toString().trim()
    const description = (body?.description ?? '').toString() || null
    const accentColor = (body?.accentColor ?? '').toString().trim() || null

    if (!columnId) {
      return NextResponse.json({ error: 'columnId requerido' }, { status: 400 })
    }

    const column = await verifyColumnOwnership(userId, columnId)
    if (!column) {
      return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
    }

    const lastPos = await db.card.aggregate({
      where: { columnId },
      _max: { position: true },
    })
    const position = (lastPos._max.position ?? -1) + 1

    const card = await db.card.create({
      data: {
        title: title || 'Nueva tarjeta',
        description,
        accentColor,
        position,
        columnId,
      },
      include: cardInclude,
    })

    return NextResponse.json({ card })
  } catch (err) {
    console.error('[cards POST]', err)
    return NextResponse.json(
      { error: 'No se pudo crear la tarjeta' },
      { status: 500 }
    )
  }
}
