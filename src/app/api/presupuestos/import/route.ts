import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getAuthUserId } from '@/lib/auth-helpers'
import { esAdmin, SOLO_ADMIN } from '@/lib/admins'
import { findAccessibleRow } from '@/lib/db-server'
import { leerJsonApp } from '@/lib/presupuesto/formato-app'
import { FormatoInvalido, leerPlanilla } from '@/lib/presupuesto/importar'
import { guardarPlanilla } from '@/lib/presupuesto/server'

const MAX_BYTES = 4 * 1024 * 1024

/**
 * Imports a "cómputo y presupuesto": the spreadsheet (.xlsx, also the one the
 * Cómputo y Presupuesto app exports) or that app's backup (.json).
 * FormData: file, rowId (optional: links it to that project right away).
 */
export async function POST(req: Request) {
  const userId = await getAuthUserId()
  if (!userId) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }
  if (!(await esAdmin(userId))) {
    return NextResponse.json({ error: SOLO_ADMIN }, { status: 403 })
  }

  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return NextResponse.json({ error: 'Formulario inválido' }, { status: 400 })
  }
  const file = form.get('file')
  const rowId = String(form.get('rowId') ?? '') || null
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'Elegí la planilla (.xlsx) o el respaldo (.json) del cómputo y presupuesto' }, { status: 400 })
  }
  const esJson = /\.json$/i.test(file.name)
  if (!esJson && !/\.xlsx$/i.test(file.name)) {
    return NextResponse.json({ error: 'El archivo tiene que ser .xlsx o .json' }, { status: 400 })
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'El archivo es demasiado grande (máximo 4 MB)' }, { status: 413 })
  }

  let pageId: string | null = null
  if (rowId) {
    const row = await findAccessibleRow(userId, rowId)
    if (!row) {
      return NextResponse.json({ error: 'No se encontró el proyecto' }, { status: 404 })
    }
    const existing = await db.presupuesto.findUnique({ where: { rowId }, select: { id: true } })
    if (existing) {
      return NextResponse.json({ error: 'Este proyecto ya tiene un cómputo y presupuesto. Desvinculalo antes de importar otro.' }, { status: 409 })
    }
    pageId = row.database.pageId
  }

  try {
    let planilla
    let avisos: string[] = []
    if (esJson) {
      let data: unknown
      try {
        data = JSON.parse(await file.text())
      } catch {
        throw new FormatoInvalido('El archivo .json está dañado o no es un respaldo válido.')
      }
      planilla = leerJsonApp(data, file.name)
    } else {
      ;({ planilla, avisos } = await leerPlanilla(new Uint8Array(await file.arrayBuffer()), file.name))
    }
    const id = await guardarPlanilla(planilla, { pageId, rowId, userId })
    return NextResponse.json({ id, avisos }, { status: 201 })
  } catch (err) {
    if (err instanceof FormatoInvalido) {
      return NextResponse.json({ error: err.message }, { status: 400 })
    }
    console.error('presupuesto import failed', err)
    return NextResponse.json({ error: 'No se pudo importar el archivo' }, { status: 500 })
  }
}
