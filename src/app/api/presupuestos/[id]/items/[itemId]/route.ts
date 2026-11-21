import { NextResponse } from 'next/server'
import { getAuthUserId } from '@/lib/auth-helpers'
import { detalleItem, findAccessiblePresupuesto } from '@/lib/presupuesto/server'

/** One item with its price analysis and measurements, computed. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string; itemId: string }> }) {
  const userId = await getAuthUserId()
  if (!userId) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }
  const { id, itemId } = await params
  if (!(await findAccessiblePresupuesto(userId, id))) {
    return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
  }
  const detalle = await detalleItem(id, itemId)
  if (!detalle) {
    return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
  }
  return NextResponse.json(detalle)
}
