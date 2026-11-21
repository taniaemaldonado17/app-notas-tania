import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getAuthUserId } from '@/lib/auth-helpers'
import { findAccessibleRow } from '@/lib/db-server'

/** The budget linked to a project row (summary), or null. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getAuthUserId()
  if (!userId) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
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
