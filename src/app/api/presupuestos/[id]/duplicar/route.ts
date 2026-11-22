import { NextResponse } from 'next/server'
import { getAuthUserId } from '@/lib/auth-helpers'
import { duplicarPresupuesto, findAccessiblePresupuesto } from '@/lib/presupuesto/server'

/** Copy of a CyP (for a new revision): not linked to a project, without contract. */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getAuthUserId()
  if (!userId) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }
  const { id } = await params
  if (!(await findAccessiblePresupuesto(userId, id))) {
    return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
  }
  const nuevo = await duplicarPresupuesto(id, userId)
  if (!nuevo) {
    return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
  }
  return NextResponse.json({ id: nuevo }, { status: 201 })
}
