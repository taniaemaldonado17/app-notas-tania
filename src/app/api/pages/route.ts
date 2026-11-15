import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { accessiblePageWhere, getAuthUserId } from '@/lib/auth-helpers'
import { migrateLegacyFavorites } from '@/lib/favorites'

/** Pages the user owns plus pages shared with them. */
export async function GET() {
  const userId = await getAuthUserId()
  if (!userId) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  await migrateLegacyFavorites(userId)

  const pages = await db.page.findMany({
    where: accessiblePageWhere(userId),
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      title: true,
      subtitle: true,
      icon: true,
      coverUrl: true,
      createdAt: true,
      updatedAt: true,
      userId: true,
      user: { select: { name: true, email: true } },
      favoritedBy: { where: { userId }, select: { id: true } },
      _count: { select: { members: true } },
    },
  })

  return NextResponse.json({
    pages: pages.map(({ userId: ownerId, user, favoritedBy, _count, ...p }) => ({
      ...p,
      favorite: favoritedBy.length > 0,
      role: ownerId === userId ? 'owner' : 'member',
      ownerName: user.name || user.email,
      memberCount: _count.members,
    })),
  })
}

export async function POST(req: Request) {
  const userId = await getAuthUserId()
  if (!userId) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  try {
    const body = await req.json()
    const title = (body?.title ?? 'Nueva página').toString().trim()
    const subtitle = (body?.subtitle ?? '').toString().trim() || null
    const icon = (body?.icon ?? '').toString().trim() || null

    const page = await db.page.create({
      data: {
        title: title || 'Nueva página',
        subtitle,
        icon,
        userId,
        columns: {
          create: [
            { title: 'Recursos', position: 0 },
            { title: 'Sin empezar', position: 1 },
            { title: 'PRIORIDAD', position: 2, accentColor: '#E0584C' },
            { title: 'En progreso', position: 3 },
          ],
        },
      },
      select: {
        id: true,
        title: true,
        subtitle: true,
        icon: true,
        coverUrl: true,
        createdAt: true,
        updatedAt: true,
        user: { select: { name: true, email: true } },
      },
    })

    const { user, ...rest } = page
    return NextResponse.json({
      page: {
        ...rest,
        favorite: false,
        role: 'owner',
        ownerName: user.name || user.email,
        memberCount: 0,
      },
    })
  } catch (err) {
    console.error('[pages POST]', err)
    return NextResponse.json(
      { error: 'No se pudo crear la página' },
      { status: 500 }
    )
  }
}
