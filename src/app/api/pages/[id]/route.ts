import { NextResponse } from 'next/server'
import type { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { getAuthUserId, isPageOwner, verifyPageOwnership } from '@/lib/auth-helpers'
import { cardInclude } from '@/lib/card-include'
import { databaseInclude, serializeDatabase, validLayout } from '@/lib/db-server'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getAuthUserId()
  if (!userId) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }
  const { id } = await params

  const owns = await verifyPageOwnership(userId, id)
  if (!owns) {
    return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
  }

  const page = await db.page.findUnique({
    where: { id },
    include: {
      columns: {
        orderBy: { position: 'asc' },
        include: {
          cards: {
            orderBy: { position: 'asc' },
            include: {
              ...cardInclude,
              // Only this user's star, so favourites stay personal.
              favoritedBy: { where: { userId }, select: { id: true } },
            },
          },
        },
      },
      databases: {
        orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
        include: databaseInclude,
      },
    },
  })

  if (!page) {
    return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
  }

  const { columns, databases, ...rest } = page
  return NextResponse.json({
    page: {
      ...rest,
      columns: columns.map((col) => ({
        ...col,
        cards: col.cards.map(({ favoritedBy, ...card }) => ({
          ...card,
          favorite: favoritedBy.length > 0,
        })),
      })),
      databases: databases.map(serializeDatabase),
    },
  })
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getAuthUserId()
  if (!userId) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }
  const { id } = await params

  const owns = await verifyPageOwnership(userId, id)
  if (!owns) {
    return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
  }

  try {
    const body = await req.json()
    const data: Prisma.PageUpdateInput = {}
    if (typeof body.title === 'string') data.title = body.title.trim()
    if (typeof body.subtitle === 'string')
      data.subtitle = body.subtitle.trim() || null
    if (typeof body.icon === 'string') data.icon = body.icon.trim() || null
    // null removes the cover
    if (body.coverUrl === null) data.coverUrl = null
    else if (typeof body.coverUrl === 'string')
      data.coverUrl = body.coverUrl.trim() || null
    if (body.layout !== undefined) {
      if (!validLayout(body.layout)) {
        return NextResponse.json({ error: 'Diseño de página inválido' }, { status: 400 })
      }
      data.layout = body.layout as Prisma.InputJsonValue
    }

    const page = await db.page.update({ where: { id }, data })
    return NextResponse.json({ page })
  } catch (err) {
    console.error('[pages PATCH]', err)
    return NextResponse.json(
      { error: 'No se pudo actualizar la página' },
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

  if (!(await isPageOwner(userId, id))) {
    return NextResponse.json(
      { error: 'Solo quien creó la página puede eliminarla' },
      { status: 403 }
    )
  }

  await db.page.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
