import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { accessiblePageWhere, getAuthUserId } from '@/lib/auth-helpers'

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
      column: { page: accessiblePageWhere(userId) },
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

  const rows = await db.dbRow.findMany({
    where: {
      database: { page: accessiblePageWhere(userId) },
      OR: [
        { title: { contains: q, mode: 'insensitive' } },
        { content: { contains: q, mode: 'insensitive' } },
      ],
    },
    select: {
      id: true,
      title: true,
      icon: true,
      database: { select: { id: true, title: true, pageId: true, page: { select: { title: true } } } },
    },
    take: 30,
  })

  const rowResults = rows.map((r) => ({
    kind: 'row' as const,
    id: r.id,
    title: r.title || 'Sin título',
    icon: r.icon,
    description: null,
    columnId: r.database.id,
    columnTitle: r.database.title,
    pageId: r.database.pageId,
    pageTitle: r.database.page.title,
  }))

  const results = cards.map((c) => ({
    kind: 'card' as const,
    id: c.id,
    title: c.title,
    description: c.description,
    columnId: c.columnId,
    columnTitle: c.column.title,
    pageId: c.column.pageId,
    pageTitle: c.column.page.title,
  }))

  return NextResponse.json({ results: [...results, ...rowResults] })
}
