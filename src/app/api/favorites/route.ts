import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import {
  accessiblePageWhere,
  canAccessPage,
  getAuthUserId,
  verifyCardOwnership,
} from '@/lib/auth-helpers'

/** The current user's favourite cards (favourite pages come with /api/pages). */
export async function GET() {
  const userId = await getAuthUserId()
  if (!userId) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const favorites = await db.favorite.findMany({
    where: {
      userId,
      cardId: { not: null },
      // Skip cards on pages the user no longer has access to.
      card: { column: { page: accessiblePageWhere(userId) } },
    },
    orderBy: { createdAt: 'asc' },
    select: {
      card: {
        select: {
          id: true,
          title: true,
          icon: true,
          column: { select: { pageId: true } },
        },
      },
    },
  })

  return NextResponse.json({
    cards: favorites
      .map((f) => f.card)
      .filter((c): c is NonNullable<typeof c> => !!c)
      .map((c) => ({ id: c.id, title: c.title, icon: c.icon, pageId: c.column.pageId })),
  })
}

/**
 * Star or unstar a page or a card for the current user.
 * Body: { pageId?: string, cardId?: string, favorite: boolean }
 */
export async function POST(req: Request) {
  const userId = await getAuthUserId()
  if (!userId) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  try {
    const body = await req.json()
    const pageId = typeof body?.pageId === 'string' ? body.pageId : null
    const cardId = typeof body?.cardId === 'string' ? body.cardId : null
    const favorite = body?.favorite === true

    if (!!pageId === !!cardId) {
      return NextResponse.json(
        { error: 'Indicá una página o una tarjeta' },
        { status: 400 }
      )
    }

    const allowed = pageId
      ? await canAccessPage(userId, pageId)
      : !!(await verifyCardOwnership(userId, cardId!))
    if (!allowed) {
      return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
    }

    const where = pageId ? { userId, pageId } : { userId, cardId }
    if (favorite) {
      await db.favorite.createMany({ data: [where], skipDuplicates: true })
    } else {
      await db.favorite.deleteMany({ where })
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[favorites POST]', err)
    return NextResponse.json(
      { error: 'No se pudo actualizar favoritos' },
      { status: 500 }
    )
  }
}
