import { NextResponse } from 'next/server'
import { getAuthUserId, isPageOwner } from '@/lib/auth-helpers'
import { quitarAcceso } from '@/lib/acceso'

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

  if (!(await quitarAcceso(id, targetId))) {
    return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
  }
  return NextResponse.json({ ok: true })
}
