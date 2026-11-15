import { NextResponse } from 'next/server'
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

  try {
    const body = await req.json()
    const text = (body?.text ?? '').toString().trim()
    if (!text) {
      return NextResponse.json({ error: 'Comentario vacío' }, { status: 400 })
    }

    const comment = await db.comment.create({
      data: { text, cardId: id, userId },
      include: { user: { select: { name: true, email: true } } },
    })
    return NextResponse.json({ comment })
  } catch (err) {
    console.error('[comments POST]', err)
    return NextResponse.json(
      { error: 'No se pudo guardar el comentario' },
      { status: 500 }
    )
  }
}
