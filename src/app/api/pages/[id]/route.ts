import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getAuthUserId, verifyPageOwnership } from '@/lib/auth-helpers'
import { cardInclude } from '@/lib/card-include'

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
            include: cardInclude,
          },
        },
      },
    },
  })

  if (!page) {
    return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
  }

  return NextResponse.json({ page })
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
    const data: {
      title?: string
      subtitle?: string | null
      icon?: string | null
      coverUrl?: string | null
    } = {}
    if (typeof body.title === 'string') data.title = body.title.trim()
    if (typeof body.subtitle === 'string')
      data.subtitle = body.subtitle.trim() || null
    if (typeof body.icon === 'string') data.icon = body.icon.trim() || null
    if (typeof body.coverUrl === 'string')
      data.coverUrl = body.coverUrl.trim() || null

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

  const owns = await verifyPageOwnership(userId, id)
  if (!owns) {
    return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
  }

  await db.page.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
