import { NextResponse } from 'next/server'
import { saveVersionBeforeChange } from '@/lib/versions'
import { db } from '@/lib/db'
import { getAuthUserId, verifyCardOwnership } from '@/lib/auth-helpers'

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
    const text = (body?.text ?? '').toString().trim()
    if (!text) {
      return NextResponse.json({ error: 'Texto vacío' }, { status: 400 })
    }

    const lastPos = await db.checklistItem.aggregate({
      where: { cardId: id },
      _max: { position: true },
    })
    const position = (lastPos._max.position ?? -1) + 1

    const item = await db.checklistItem.create({
      data: { text, position, cardId: id },
    })

    return NextResponse.json({ item })
  } catch (err) {
    console.error('[checklist POST]', err)
    return NextResponse.json(
      { error: 'No se pudo crear el item' },
      { status: 500 }
    )
  }
}
