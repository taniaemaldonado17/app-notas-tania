import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { accessiblePageWhere, getAuthUserId } from '@/lib/auth-helpers'

/**
 * Verifies that the given checklistItemId belongs (through its card -> column -> page) to the user.
 * Returns the item (with cardId) if verified, null otherwise.
 */
async function verifyChecklistOwnership(
  userId: string,
  itemId: string
): Promise<{ id: string; cardId: string } | null> {
  const item = await db.checklistItem.findFirst({
    where: { id: itemId, card: { column: { page: accessiblePageWhere(userId) } } },
    select: { id: true, cardId: true },
  })
  return item
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

  const item = await verifyChecklistOwnership(userId, id)
  if (!item) {
    return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
  }

  try {
    const body = await req.json()
    const data: { text?: string; checked?: boolean; position?: number } = {}
    if (typeof body.text === 'string') data.text = body.text.trim()
    if (typeof body.checked === 'boolean') data.checked = body.checked
    if (typeof body.position === 'number') data.position = body.position

    const updated = await db.checklistItem.update({ where: { id }, data })
    return NextResponse.json({ item: updated })
  } catch (err) {
    console.error('[checklist PATCH]', err)
    return NextResponse.json(
      { error: 'No se pudo actualizar el item' },
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

  const item = await verifyChecklistOwnership(userId, id)
  if (!item) {
    return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
  }

  await db.checklistItem.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
