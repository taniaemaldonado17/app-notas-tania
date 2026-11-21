import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getAuthUserId } from '@/lib/auth-helpers'
import { findAccessibleRow } from '@/lib/db-server'
import { FormatoInvalido, leerPlanilla } from '@/lib/presupuesto/importar'
import { guardarPlanilla } from '@/lib/presupuesto/server'

const MAX_BYTES = 4 * 1024 * 1024

/**
 * Import a "cómputo y presupuesto" spreadsheet as the budget of a project row.
 * FormData: file (.xlsx), rowId.
 */
export async function POST(req: Request) {
  const userId = await getAuthUserId()
  if (!userId) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return NextResponse.json({ error: 'Formulario inválido' }, { status: 400 })
  }
  const file = form.get('file')
  const rowId = String(form.get('rowId') ?? '')
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'Elegí la planilla de cómputo y presupuesto (.xlsx)' }, { status: 400 })
  }
  if (!/\.xlsx$/i.test(file.name)) {
    return NextResponse.json({ error: 'La planilla tiene que ser .xlsx' }, { status: 400 })
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'La planilla es demasiado grande (máximo 4 MB)' }, { status: 413 })
  }

  const row = await findAccessibleRow(userId, rowId)
  if (!row) {
    return NextResponse.json({ error: 'No se encontró el proyecto' }, { status: 404 })
  }
  const existing = await db.presupuesto.findUnique({ where: { rowId }, select: { id: true } })
  if (existing) {
    return NextResponse.json({ error: 'Este proyecto ya tiene un presupuesto. Eliminalo antes de importar otro.' }, { status: 409 })
  }

  try {
    const { planilla, avisos } = await leerPlanilla(new Uint8Array(await file.arrayBuffer()), file.name)
    const id = await guardarPlanilla(planilla, { pageId: row.database.pageId, rowId, userId })
    return NextResponse.json({ id, avisos }, { status: 201 })
  } catch (err) {
    if (err instanceof FormatoInvalido) {
      return NextResponse.json({ error: err.message }, { status: 400 })
    }
    console.error('presupuesto import failed', err)
    return NextResponse.json({ error: 'No se pudo importar la planilla' }, { status: 500 })
  }
}
