import { NextResponse } from 'next/server'
import { getAuthUserId } from '@/lib/auth-helpers'
import { findAccessiblePresupuesto } from '@/lib/presupuesto/server'
import { detalleCertificado } from '@/lib/certificacion/server'

/** One certificate with its per-item lines. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string; certId: string }> }) {
  const userId = await getAuthUserId()
  if (!userId) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }
  const { id, certId } = await params
  if (!(await findAccessiblePresupuesto(userId, id))) {
    return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
  }
  const cert = await detalleCertificado(id, certId)
  if (!cert) {
    return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
  }
  return NextResponse.json({ certificado: cert })
}
