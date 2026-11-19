import { after, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getAuthUserId, verifyCardOwnership, verifyColumnOwnership } from '@/lib/auth-helpers'
import { cardInclude } from '@/lib/card-include'
import { appOrigin, notifyNewMentions } from '@/lib/mentions'

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getAuthUserId()
  if (!userId) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }
  const { id } = await params

  const card = await verifyCardOwnership(userId, id)
  if (!card) {
    return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
  }

  try {
    const body = await req.json()
    const data: {
      title?: string
      description?: string | null
      coverUrl?: string | null
      accentColor?: string | null
      icon?: string | null
      position?: number
      columnId?: string
    } = {}

    if (typeof body.title === 'string') data.title = body.title.trim()
    if (body.description === null || typeof body.description === 'string')
      data.description = body.description || null
    if (typeof body.coverUrl === 'string')
      data.coverUrl = body.coverUrl || null
    if (typeof body.accentColor === 'string')
      data.accentColor = body.accentColor || null
    if (typeof body.icon === 'string') data.icon = body.icon || null
    if (typeof body.position === 'number') data.position = body.position
    if (typeof body.columnId === 'string' && body.columnId !== card.columnId) {
      // Validate destination column ownership before move
      const dest = await verifyColumnOwnership(userId, body.columnId)
      if (!dest) {
        return NextResponse.json(
          { error: 'Columna destino no válida' },
          { status: 400 }
        )
      }
      data.columnId = body.columnId
    }

    const before =
      data.description !== undefined
        ? (await db.card.findUnique({ where: { id }, select: { description: true } }))?.description
        : undefined
    const updated = await db.card.update({
      where: { id },
      data,
      include: cardInclude,
    })
    if (data.description !== undefined && data.description?.includes('"mention"')) {
      const origin = appOrigin(req)
      after(() =>
        notifyNewMentions({
          actorId: userId,
          pageId: card.pageId,
          before,
          after: data.description,
          itemTitle: updated.title,
          link: `${origin}/?page=${encodeURIComponent(card.pageId)}&card=${encodeURIComponent(id)}`,
        }).catch((err) => console.error('[cards PATCH mentions]', err))
      )
    }
    return NextResponse.json({ card: updated })
  } catch (err) {
    console.error('[cards PATCH]', err)
    return NextResponse.json(
      { error: 'No se pudo actualizar la tarjeta' },
      { status: 500 }
    )
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

  const card = await verifyCardOwnership(userId, id)
  if (!card) {
    return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
  }

  await db.card.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
