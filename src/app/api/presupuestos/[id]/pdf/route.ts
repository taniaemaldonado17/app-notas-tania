import { NextResponse } from 'next/server'
import { getAuthUserId } from '@/lib/auth-helpers'
import { generarPdfPresupuesto } from '@/lib/presupuesto/pdf'
import { cargarSnapshot, findAccessiblePresupuesto } from '@/lib/presupuesto/server'

/** The CyP as an A4 portrait PDF (summary + detailed budget), as a download. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getAuthUserId()
  if (!userId) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }
  const { id } = await params
  if (!(await findAccessiblePresupuesto(userId, id))) {
    return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
  }
  const s = await cargarSnapshot(id)
  if (!s) {
    return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
  }
  const pdf = generarPdfPresupuesto(s)
  const nombre = s.info.nombre.replace(/[^\p{L}\p{N} ._()-]/gu, '').trim().slice(0, 120) || 'Computo y presupuesto'
  return new Response(pdf, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="computo-presupuesto.pdf"; filename*=UTF-8''${encodeURIComponent(nombre)}.pdf`,
      'Cache-Control': 'private, no-store',
    },
  })
}
