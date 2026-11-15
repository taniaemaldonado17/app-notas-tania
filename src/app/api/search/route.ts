import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getAuthUserId } from '@/lib/auth-helpers'

export async function GET(req: Request) {
  const userId = await getAuthUserId()
  if (!userId) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const url = new URL(req.url)
  const q = (url.searchParams.get('q') ?? '').trim().toLowerCase()

  if (!q) {
    return NextResponse.json({ results: [] })
  }

  // Find all cards belonging to the user, search by title / description / checklist text
  const cards = await db.card.findMany({
    where: {
      column: { page: { userId } },
      OR: [
        { title: { contains: q, mode: 'insensitive' } },
        { description: { contains: q, mode: 'insensitive' } },
        { checklist: { some: { text: { contains: q, mode: 'insensitive' } } } },
      ],
    },
    select: {
      id: true,
      title: true,
      description: true,
      columnId: true,
      column: {
        select: {
          id: true,
          title: true,
          pageId: true,
          page: { select: { id: true, title: true } },
        },
      },
    },
    take: 30,
  })

  const results = cards.map((c) => ({
    id: c.id,
    title: c.title,
    description: c.description,
    columnId: c.columnId,
    columnTitle: c.column.title,
    pageId: c.column.pageId,
    pageTitle: c.column.page.title,
  }))

  return NextResponse.json({ results })
}
