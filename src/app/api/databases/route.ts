import { NextResponse } from 'next/server'
import { saveVersionBeforeChange } from '@/lib/versions'
import type { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { canAccessPage, getAuthUserId } from '@/lib/auth-helpers'
import { blankDatabase, databaseInclude, serializeDatabase } from '@/lib/db-server'

/** Add a new, empty database to a 'databases' page. Body: { pageId, title? } */
export async function POST(req: Request) {
  const userId = await getAuthUserId()
  if (!userId) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  try {
    const body = await req.json()
    const pageId = (body?.pageId ?? '').toString()
    const title = (body?.title ?? '').toString().trim() || 'Base de datos'
    if (!pageId || !(await canAccessPage(userId, pageId))) {
      return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
    }
    await saveVersionBeforeChange(pageId, userId)

    const last = await db.database.aggregate({ where: { pageId }, _max: { position: true } })
    const blank = blankDatabase(title)
    const created = await db.database.create({
      data: {
        pageId,
        title: blank.title,
        icon: blank.icon,
        position: (last._max.position ?? -1) + 1,
        properties: blank.properties as unknown as Prisma.InputJsonValue,
        views: blank.views as unknown as Prisma.InputJsonValue,
      },
      include: databaseInclude,
    })
    return NextResponse.json({ database: serializeDatabase(created) })
  } catch (err) {
    console.error('[databases POST]', err)
    return NextResponse.json({ error: 'No se pudo crear la base de datos' }, { status: 500 })
  }
}
