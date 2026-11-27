import { NextResponse } from 'next/server'
import { getAuthUserId } from '@/lib/auth-helpers'
import { esAdmin, SOLO_ADMIN } from '@/lib/admins'
import { guardarPlanilla, listarPresupuestos } from '@/lib/presupuesto/server'

/** "Cómputo y presupuesto" section: every CyP the user can open. */
export async function GET() {
  const userId = await getAuthUserId()
  if (!userId) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }
  if (!(await esAdmin(userId))) {
    return NextResponse.json({ error: SOLO_ADMIN }, { status: 403 })
  }
  return NextResponse.json({ presupuestos: await listarPresupuestos(userId) })
}

/** New empty CyP (not linked to any project). Body: { nombre? } */
export async function POST(req: Request) {
  const userId = await getAuthUserId()
  if (!userId) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }
  if (!(await esAdmin(userId))) {
    return NextResponse.json({ error: SOLO_ADMIN }, { status: 403 })
  }
  const body = (await req.json().catch(() => null)) as { nombre?: unknown } | null
  const nombre = typeof body?.nombre === 'string' && body.nombre.trim() ? body.nombre.trim().slice(0, 300) : 'Nuevo cómputo y presupuesto'
  const id = await guardarPlanilla(
    {
      nombre,
      descripcion: '',
      ubicacion: '',
      tipoCambio: null,
      cargasSociales: 0,
      coefAjuste: 1,
      superficieCubierta: null,
      superficiePredio: null,
      insumos: [],
      rubros: [],
    },
    { pageId: null, rowId: null, userId }
  )
  return NextResponse.json({ id }, { status: 201 })
}
