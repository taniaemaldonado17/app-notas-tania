import { NextResponse } from 'next/server'
import { saveVersionBeforeChange } from '@/lib/versions'
import { db } from '@/lib/db'
import { getAuthUserId, verifyCardOwnership } from '@/lib/auth-helpers'

const VALID_TYPES = new Set(['pdf', 'drive', 'figma', 'link', 'file'])

export async function POST(
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
  await saveVersionBeforeChange(card.pageId, userId)

  try {
    const body = await req.json()
    const type = (body?.type ?? '').toString()
    const title = (body?.title ?? '').toString().trim()
    const url = (body?.url ?? '').toString().trim()
    const previewUrl = body?.previewUrl
      ? (body.previewUrl as string).toString().trim()
      : null

    if (!VALID_TYPES.has(type)) {
      return NextResponse.json(
        { error: 'Tipo de adjunto inválido' },
        { status: 400 }
      )
    }
    if (!url) {
      return NextResponse.json(
        { error: 'URL vacía' },
        { status: 400 }
      )
    }
    if (!title) {
      return NextResponse.json(
        { error: 'Título vacío' },
        { status: 400 }
      )
    }

    const lastPos = await db.attachment.aggregate({
      where: { cardId: id },
      _max: { position: true },
    })
    const position = (lastPos._max.position ?? -1) + 1

    const attachment = await db.attachment.create({
      data: {
        type,
        title,
        url,
        previewUrl: previewUrl || null,
        position,
        cardId: id,
      },
    })

    return NextResponse.json({ attachment })
  } catch (err) {
    console.error('[attachments POST]', err)
    return NextResponse.json(
      { error: 'No se pudo crear el adjunto' },
      { status: 500 }
    )
  }
}
