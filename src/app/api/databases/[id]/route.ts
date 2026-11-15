import { NextResponse } from 'next/server'
import type { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { getAuthUserId } from '@/lib/auth-helpers'
import { findAccessibleDatabase, validProperties, validViews } from '@/lib/db-server'

/** Update a database's title, icon, schema (properties) or views. */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getAuthUserId()
  if (!userId) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }
  const { id } = await params
  if (!(await findAccessibleDatabase(userId, id))) {
    return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
  }

  try {
    const body = await req.json()
    const data: Prisma.DatabaseUpdateInput = {}
    if (typeof body.title === 'string') data.title = body.title.trim() || 'Sin título'
    if (body.icon === null || typeof body.icon === 'string') data.icon = body.icon || null
    if (typeof body.position === 'number') data.position = Math.trunc(body.position)
    if (body.properties !== undefined) {
      if (!validProperties(body.properties)) {
        return NextResponse.json({ error: 'Propiedades inválidas' }, { status: 400 })
      }
      data.properties = body.properties as Prisma.InputJsonValue
    }
    if (body.views !== undefined) {
      if (!validViews(body.views)) {
        return NextResponse.json({ error: 'Vistas inválidas' }, { status: 400 })
      }
      data.views = body.views as Prisma.InputJsonValue
    }

    await db.database.update({ where: { id }, data })
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[databases PATCH]', err)
    return NextResponse.json({ error: 'No se pudo guardar la base de datos' }, { status: 500 })
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getAuthUserId()
  if (!userId) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }
  const { id } = await params
  if (!(await findAccessibleDatabase(userId, id))) {
    return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
  }
  await db.database.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
