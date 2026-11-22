import { NextResponse } from 'next/server'
import ExcelJS from 'exceljs'
import { getAuthUserId } from '@/lib/auth-helpers'
import { snapshotAProyecto } from '@/lib/presupuesto/formato-app'
import { cargarSnapshot, findAccessiblePresupuesto } from '@/lib/presupuesto/server'
import CPExcel from '@/lib/presupuesto/app-computo/excel.js'

/**
 * Download in the Cómputo y Presupuesto app's formats:
 * ?formato=xlsx (default; sheets Resumen, Presupuesto, Análisis de precios,
 * Insumos, Cómputo métrico, with formulas) or ?formato=json (its backup).
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
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
  const proyecto = snapshotAProyecto(s)
  const base = s.info.nombre.replace(/[^\p{L}\p{N} ._()-]/gu, '').trim().slice(0, 120) || 'Computo y presupuesto'
  const nombre = (ext: string) =>
    `attachment; filename="computo-presupuesto.${ext}"; filename*=UTF-8''${encodeURIComponent(`${base}.${ext}`)}`

  if (new URL(req.url).searchParams.get('formato') === 'json') {
    const json = JSON.stringify({ formato: 'computo-presupuesto', version: 1, proyecto }, null, 1)
    return new Response(json, {
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Content-Disposition': nombre('json'), 'Cache-Control': 'private, no-store' },
    })
  }
  const buf = await CPExcel.exportar(proyecto, ExcelJS)
  return new Response(buf, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': nombre('xlsx'),
      'Cache-Control': 'private, no-store',
    },
  })
}
