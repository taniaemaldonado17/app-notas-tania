import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getAuthUserId, isPageOwner } from '@/lib/auth-helpers'

/**
 * Remove someone's access to a shared page.
 * The owner can remove anyone; a member can remove themselves ("me").
 */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; userId: string }> }
) {
  const requesterId = await getAuthUserId()
  if (!requesterId) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }
  const { id, userId: rawTarget } = await params
  const targetId = rawTarget === 'me' ? requesterId : rawTarget

  const allowed =
    targetId === requesterId || (await isPageOwner(requesterId, id))
  if (!allowed) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  }

  const removed = await db.pageMember.deleteMany({
    where: { pageId: id, userId: targetId },
  })
  if (removed.count === 0) {
    return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
  }

  // Their personal favourites of this page and its cards no longer apply.
  await db.favorite.deleteMany({
    where: {
      userId: targetId,
      OR: [{ pageId: id }, { card: { column: { pageId: id } } }],
    },
  })

  return NextResponse.json({ ok: true })
}
