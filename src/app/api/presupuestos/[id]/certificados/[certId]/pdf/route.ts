import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getAuthUserId } from '@/lib/auth-helpers'
import { esAdmin, SOLO_ADMIN } from '@/lib/admins'
import { findAccessiblePresupuesto } from '@/lib/presupuesto/server'
import { detalleCertificado } from '@/lib/certificacion/server'
import { generarPdfCertificado, generarPdfFoja } from '@/lib/certificacion/pdf'

/**
 * The certificate as a PDF (opens in the browser). ?tipo=foja: the contractor's
 * measurement sheet for the same period, at costo-costo.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string; certId: string }> }) {
  const userId = await getAuthUserId()
  if (!userId) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }
  if (!(await esAdmin(userId))) {
    return NextResponse.json({ error: SOLO_ADMIN }, { status: 403 })
  }
  const { id, certId } = await params
  if (!(await findAccessiblePresupuesto(userId, id))) {
    return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
  }
  const [cert, presupuesto, contrato] = await Promise.all([
    detalleCertificado(id, certId),
    db.presupuesto.findUnique({ where: { id }, select: { nombre: true, ubicacion: true } }),
    db.contrato.findUnique({ where: { presupuestoId: id }, include: { items: { orderBy: { position: 'asc' } } } }),
  ])
  if (!cert || !presupuesto || !contrato) {
    return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
  }

  const { items, ...datosContrato } = contrato
  const foja = new URL(req.url).searchParams.get('tipo') === 'foja'
  const datos = {
    obra: presupuesto.nombre,
    ubicacion: presupuesto.ubicacion,
    contrato: datosContrato,
    items,
    certificado: { ...cert, rectificadoEn: cert.rectificadoEn?.toISOString() ?? null },
  }
  const pdf = foja ? generarPdfFoja(datos) : generarPdfCertificado(datos)

  const nombre = `${foja ? 'Foja de medicion' : 'Certificado'} N${cert.numero} - ${presupuesto.nombre}`.replace(/[^\p{L}\p{N} ._-]/gu, '').slice(0, 120)
  return new Response(pdf, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${foja ? 'foja' : 'certificado'}-${cert.numero}.pdf"; filename*=UTF-8''${encodeURIComponent(nombre)}.pdf`,
      'Cache-Control': 'private, no-store',
    },
  })
}
