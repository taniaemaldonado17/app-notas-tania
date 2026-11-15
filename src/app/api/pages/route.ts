import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getAuthUserId } from '@/lib/auth-helpers'

export async function GET() {
  const userId = await getAuthUserId()
  if (!userId) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const pages = await db.page.findMany({
    where: { userId },
    orderBy: { updatedAt: 'desc' },
    select: {
      id: true,
      title: true,
      subtitle: true,
      icon: true,
      coverUrl: true,
      createdAt: true,
      updatedAt: true,
      _count: { select: { columns: true } },
    },
  })

  return NextResponse.json({ pages })
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
      include: { columns: true },
    })

    return NextResponse.json({ page })
  } catch (err) {
    console.error('[pages POST]', err)
    return NextResponse.json(
      { error: 'No se pudo crear la página' },
      { status: 500 }
    )
  }
}
