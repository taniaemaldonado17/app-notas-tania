import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getAuthUserId } from '@/lib/auth-helpers'

/** Favourite cards of the current user (pages come from /api/pages). */
export async function GET() {
  const userId = await getAuthUserId()
  if (!userId) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const cards = await db.card.findMany({
    where: { favorite: true, column: { page: { userId } } },
    orderBy: { updatedAt: 'desc' },
    select: {
      id: true,
      title: true,
      icon: true,
      column: { select: { pageId: true } },
    },
  })

  return NextResponse.json({
    cards: cards.map((c) => ({
      id: c.id,
      title: c.title,
      icon: c.icon,
      pageId: c.column.pageId,
    })),
  })
}
