import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getAuthUserId, verifyPageOwnership } from '@/lib/auth-helpers'

export async function POST(req: Request) {
  const userId = await getAuthUserId()
  if (!userId) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  try {
    const body = await req.json()
    const pageId = (body?.pageId ?? '').toString()
    const title = (body?.title ?? 'Nueva columna').toString().trim()
    const accentColor = (body?.accentColor ?? '').toString().trim() || null

    if (!pageId) {
      return NextResponse.json({ error: 'pageId requerido' }, { status: 400 })
    }

    const owns = await verifyPageOwnership(userId, pageId)
    if (!owns) {
      return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
    }

    const lastPos = await db.column.aggregate({
      where: { pageId },
      _max: { position: true },
    })
    const position = (lastPos._max.position ?? -1) + 1

    const column = await db.column.create({
      data: {
        title: title || 'Nueva columna',
        position,
        accentColor,
        pageId,
      },
    })

    return NextResponse.json({ column })
  } catch (err) {
    console.error('[columns POST]', err)
    return NextResponse.json(
      { error: 'No se pudo crear la columna' },
      { status: 500 }
    )
  }
}
