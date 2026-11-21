import { NextResponse } from 'next/server'
import { getAuthUserId } from '@/lib/auth-helpers'
import { calcularPresupuesto, eliminarPresupuesto, findAccessiblePresupuesto } from '@/lib/presupuesto/server'

/** The whole budget, computed: parameters, rubros with their items, totals. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getAuthUserId()
  if (!userId) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }
  const { id } = await params
  if (!(await findAccessiblePresupuesto(userId, id))) {
    return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
  }
  const result = await calcularPresupuesto(id)
  if (!result) {
    return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
  }
  return NextResponse.json(result)
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getAuthUserId()
  if (!userId) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }
  const { id } = await params
  if (!(await findAccessiblePresupuesto(userId, id))) {
    return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
  }
  await eliminarPresupuesto(id)
  return NextResponse.json({ ok: true })
}
