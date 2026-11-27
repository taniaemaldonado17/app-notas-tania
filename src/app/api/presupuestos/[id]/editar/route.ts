import { NextResponse } from 'next/server'
import { getAuthUserId } from '@/lib/auth-helpers'
import { esAdmin, SOLO_ADMIN } from '@/lib/admins'
import { aplicarLote, aplicarOperacion, ErrorEdicion, loteSchema, operacionSchema } from '@/lib/presupuesto/editar'
import { findAccessiblePresupuesto } from '@/lib/presupuesto/server'

/**
 * One edit to a budget (parameters, inputs, rubros, items, price-analysis
 * lines, measurements). Body: an Operacion (see lib/presupuesto/editar.ts),
 * or { lote: Operacion[] } for changes made offline (applied in order).
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
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

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Pedido inválido' }, { status: 400 })
  }
  if (body && typeof body === 'object' && 'lote' in body) {
    const lote = loteSchema.safeParse(body)
    if (!lote.success) {
      return NextResponse.json({ error: 'Datos inválidos: revisá los valores cargados' }, { status: 400 })
    }
    try {
      return NextResponse.json(await aplicarLote(id, lote.data.lote))
    } catch (err) {
      console.error('presupuesto batch edit failed', err)
      return NextResponse.json({ error: 'No se pudieron guardar los cambios' }, { status: 500 })
    }
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
