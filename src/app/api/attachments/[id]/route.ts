import { NextResponse } from 'next/server'
import { saveVersionBeforeChange } from '@/lib/versions'
import { db } from '@/lib/db'
import { accessiblePageWhere, getAuthUserId } from '@/lib/auth-helpers'

/**
 * Verifies that the given attachmentId belongs (through its card -> column -> page) to the user.
 * Returns the attachment (with cardId) if verified, null otherwise.
 */
async function verifyAttachmentOwnership(
  userId: string,
  attachmentId: string
): Promise<{ id: string; cardId: string; pageId: string } | null> {
  const att = await db.attachment.findFirst({
    where: { id: attachmentId, card: { column: { page: accessiblePageWhere(userId) } } },
    select: { id: true, cardId: true, card: { select: { column: { select: { pageId: true } } } } },
  })
  return att ? { id: att.id, cardId: att.cardId, pageId: att.card.column.pageId } : null
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

  const att = await verifyAttachmentOwnership(userId, id)
  if (!att) {
    return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
  }
  await saveVersionBeforeChange(att.pageId, userId)

  try {
    const body = await req.json()
    const data: { title?: string; url?: string; previewUrl?: string | null } = {}
    if (typeof body.title === 'string') data.title = body.title.trim()
    if (typeof body.url === 'string') data.url = body.url.trim()
    if (body.previewUrl === null || typeof body.previewUrl === 'string') {
      data.previewUrl = body.previewUrl
    }

    const updated = await db.attachment.update({ where: { id }, data })
    return NextResponse.json({ attachment: updated })
  } catch (err) {
    console.error('[attachment PATCH]', err)
    return NextResponse.json(
      { error: 'No se pudo actualizar el adjunto' },
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

  const att = await verifyAttachmentOwnership(userId, id)
  if (!att) {
    return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
  }
  await saveVersionBeforeChange(att.pageId, userId, { force: true })

  await db.attachment.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
