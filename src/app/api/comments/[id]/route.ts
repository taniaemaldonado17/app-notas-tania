import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getAuthUserId } from '@/lib/auth-helpers'

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getAuthUserId()
  if (!userId) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }
  const { id } = await params

  const comment = await db.comment.findUnique({
    where: { id },
    select: {
      userId: true,
      card: { select: { column: { select: { page: { select: { userId: true } } } } } },
      row: { select: { database: { select: { page: { select: { userId: true } } } } } },
    },
  })
  const pageOwnerId =
    comment?.card?.column.page.userId ?? comment?.row?.database.page.userId ?? null
  // Only the author or the page owner can delete a comment.
  if (!comment || (comment.userId !== userId && pageOwnerId !== userId)) {
    return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
  }

  await db.comment.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
