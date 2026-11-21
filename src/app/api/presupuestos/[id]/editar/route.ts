import { NextResponse } from 'next/server'
import { getAuthUserId } from '@/lib/auth-helpers'
import { aplicarOperacion, ErrorEdicion, operacionSchema } from '@/lib/presupuesto/editar'
import { findAccessiblePresupuesto } from '@/lib/presupuesto/server'

/**
 * One edit to a budget (parameters, inputs, rubros, items, price-analysis
 * lines, measurements). Body: an Operacion (see lib/presupuesto/editar.ts).
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getAuthUserId()
  if (!userId) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }
  const { id } = await params
  if (!(await findAccessiblePresupuesto(userId, id))) {
    return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Pedido inválido' }, { status: 400 })
  }
  const parsed = operacionSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Datos inválidos: revisá los valores cargados' }, { status: 400 })
  }

  try {
    return NextResponse.json(await aplicarOperacion(id, parsed.data))
  } catch (err) {
    if (err instanceof ErrorEdicion) {
      return NextResponse.json({ error: err.message }, { status: 400 })
    }
    console.error('presupuesto edit failed', err)
    return NextResponse.json({ error: 'No se pudo guardar el cambio' }, { status: 500 })
  }
}
