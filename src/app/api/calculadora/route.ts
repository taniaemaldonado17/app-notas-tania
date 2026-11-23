import { NextResponse } from 'next/server'
import type { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { getAuthUserId } from '@/lib/auth-helpers'

/** Up to 2 MB of catalogue and lists (the initial catalogue is ~60 kB). */
const MAX_BYTES = 2 * 1024 * 1024

/** The user's Calculadora de materiales data, or null (the calculator then starts from its catalogue). */
export async function GET() {
  const userId = await getAuthUserId()
  if (!userId) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }
  const fila = await db.calculadoraMateriales.findUnique({ where: { userId }, select: { data: true } })
  return NextResponse.json({ data: fila?.data ?? null }, { headers: { 'Cache-Control': 'private, no-store' } })
}

/** Saves the whole document. Body: { data: { catalogo, listas, activa, preciosProyecto } } */
export async function PUT(req: Request) {
  const userId = await getAuthUserId()
  if (!userId) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }
  const texto = await req.text()
  if (texto.length > MAX_BYTES) {
    return NextResponse.json({ error: 'Los datos de la calculadora son demasiado grandes' }, { status: 413 })
  }
  let data: unknown
  try {
    data = (JSON.parse(texto) as { data?: unknown }).data
  } catch {
    return NextResponse.json({ error: 'Pedido inválido' }, { status: 400 })
  }
  const d = data as { catalogo?: unknown; listas?: unknown } | null
  if (!d || typeof d !== 'object' || !d.catalogo || typeof d.catalogo !== 'object' || !Array.isArray(d.listas)) {
    return NextResponse.json({ error: 'Datos de la calculadora inválidos' }, { status: 400 })
  }
  const json = data as Prisma.InputJsonValue
  await db.calculadoraMateriales.upsert({ where: { userId }, create: { userId, data: json }, update: { data: json } })
  return NextResponse.json({ ok: true })
}
