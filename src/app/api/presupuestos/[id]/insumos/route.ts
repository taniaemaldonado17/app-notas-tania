import { NextResponse } from 'next/server'
import { getAuthUserId } from '@/lib/auth-helpers'
import { findAccessiblePresupuesto, listarInsumos } from '@/lib/presupuesto/server'

/** Inputs with base price, computed price and how many items use each. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getAuthUserId()
  if (!userId) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }
  const { id } = await params
  if (!(await findAccessiblePresupuesto(userId, id))) {
    return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
  }
  return NextResponse.json({ insumos: await listarInsumos(id) })
}
