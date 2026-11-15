import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getAuthUserId } from '@/lib/auth-helpers'
import { findAccessibleRow } from '@/lib/db-server'

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getAuthUserId()
  if (!userId) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }
  const { id } = await params
  if (!(await findAccessibleRow(userId, id))) {
    return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
  }

  try {
    const body = await req.json()
    const text = (body?.text ?? '').toString().trim()
    if (!text) {
      return NextResponse.json({ error: 'Comentario vacío' }, { status: 400 })
    }
    const comment = await db.comment.create({
      data: { text: text.slice(0, 5000), rowId: id, userId },
      select: { id: true, text: true, createdAt: true, user: { select: { name: true, email: true } } },
    })
    return NextResponse.json({ comment: { ...comment, createdAt: comment.createdAt.toISOString() } })
  } catch (err) {
    console.error('[row comments POST]', err)
    return NextResponse.json({ error: 'No se pudo guardar el comentario' }, { status: 500 })
  }
}
