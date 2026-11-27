import { NextResponse } from 'next/server'
import { getAuthUserId } from '@/lib/auth-helpers'
import { esAdmin, SOLO_ADMIN } from '@/lib/admins'
import { findAccessiblePresupuesto } from '@/lib/presupuesto/server'
import {
  aplicarOperacionCert,
  cargarCertificacion,
  ErrorCertificacion,
  operacionCertSchema,
} from '@/lib/certificacion/server'

/** Contract (frozen itemized list), certificates and plan curve of a budget. */
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
  return NextResponse.json(await cargarCertificacion(id))
}

/** One certification operation (see lib/certificacion/server.ts). */
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
  const parsed = operacionCertSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Datos inválidos: revisá los valores cargados' }, { status: 400 })
  }

  try {
    return NextResponse.json(await aplicarOperacionCert(id, parsed.data, userId))
  } catch (err) {
    if (err instanceof ErrorCertificacion) {
      return NextResponse.json({ error: err.message }, { status: 400 })
    }
    console.error('certificacion op failed', err)
    return NextResponse.json({ error: 'No se pudo guardar' }, { status: 500 })
  }
}
