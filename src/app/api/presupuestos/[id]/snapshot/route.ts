import { NextResponse } from 'next/server'
import { getAuthUserId } from '@/lib/auth-helpers'
import { esAdmin, SOLO_ADMIN } from '@/lib/admins'
import { cargarSnapshot, findAccessiblePresupuesto } from '@/lib/presupuesto/server'

/** The whole budget as stored, kept on the device to work offline. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getAuthUserId()
  if (!userId) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }
  if (!(await esAdmin(userId))) {
    return NextResponse.json({ error: SOLO_ADMIN }, { status: 403 })
  }
  const { id } = await params
  if (!(await findAccessiblePresupuesto(userId, id))) {
    return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
  }
  const snapshot = await cargarSnapshot(id)
  if (!snapshot) {
    return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
  }
  return NextResponse.json(snapshot, { headers: { 'Cache-Control': 'private, no-store' } })
}
