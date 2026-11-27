import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getAuthUserId } from '@/lib/auth-helpers'
import { esAdmin, SOLO_ADMIN } from '@/lib/admins'
import { findAccessibleRow } from '@/lib/db-server'
import { sincronizarAvance } from '@/lib/certificacion/server'
import { desvincularPresupuesto, findAccessiblePresupuesto, vincularPresupuesto } from '@/lib/presupuesto/server'

/** The budget linked to a project row (summary), or null. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getAuthUserId()
  if (!userId) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }
  if (!(await esAdmin(userId))) {
    return NextResponse.json({ error: SOLO_ADMIN }, { status: 403 })
  }
  const { id } = await params
  if (!(await findAccessibleRow(userId, id))) {
    return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
  }
  const presupuesto = await db.presupuesto.findUnique({
    where: { rowId: id },
    select: {
      id: true,
      nombre: true,
      totalCache: true,
      tipoCambio: true,
      updatedAt: true,
      _count: { select: { items: true, rubros: true } },
    },
  })
  return NextResponse.json({
    presupuesto: presupuesto
      ? {
          id: presupuesto.id,
          nombre: presupuesto.nombre,
          total: presupuesto.totalCache,
          tipoCambio: presupuesto.tipoCambio,
          rubros: presupuesto._count.rubros,
          items: presupuesto._count.items,
          updatedAt: presupuesto.updatedAt.toISOString(),
        }
      : null,
  })
}

/** Links one of the user's CyPs to this project row. Body: { presupuestoId } */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getAuthUserId()
  if (!userId) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }
  if (!(await esAdmin(userId))) {
    return NextResponse.json({ error: SOLO_ADMIN }, { status: 403 })
  }
  const { id } = await params
  const row = await findAccessibleRow(userId, id)
  if (!row) {
    return NextResponse.json({ error: 'No se encontró el proyecto' }, { status: 404 })
  }
  const body = (await req.json().catch(() => null)) as { presupuestoId?: unknown } | null
  const presupuestoId = typeof body?.presupuestoId === 'string' ? body.presupuestoId : ''
  const p = presupuestoId ? await findAccessiblePresupuesto(userId, presupuestoId) : null
  if (!p) {
    return NextResponse.json({ error: 'No se encontró el cómputo y presupuesto' }, { status: 404 })
  }
  if (await db.presupuesto.findUnique({ where: { rowId: id }, select: { id: true } })) {
    return NextResponse.json({ error: 'Este proyecto ya tiene un cómputo y presupuesto. Desvinculalo primero.' }, { status: 409 })
  }
  if (p.rowId) {
    return NextResponse.json({ error: 'Ese cómputo y presupuesto ya está vinculado a otro proyecto.' }, { status: 409 })
  }
  await vincularPresupuesto(p.id, id, row.database.pageId)
  await sincronizarAvance(p.id)
  return NextResponse.json({ id: p.id })
}

/** Unlinks the project's CyP (it stays in the "Cómputo y presupuesto" section). */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getAuthUserId()
  if (!userId) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }
  if (!(await esAdmin(userId))) {
    return NextResponse.json({ error: SOLO_ADMIN }, { status: 403 })
  }
  const { id } = await params
  if (!(await findAccessibleRow(userId, id))) {
    return NextResponse.json({ error: 'No se encontró el proyecto' }, { status: 404 })
  }
  const p = await db.presupuesto.findUnique({ where: { rowId: id }, select: { id: true } })
  if (p) await desvincularPresupuesto(p.id)
  return NextResponse.json({ ok: true })
}
