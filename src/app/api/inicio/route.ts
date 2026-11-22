import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { accessiblePageWhere, getAuthUserId } from '@/lib/auth-helpers'

const RECIENTES = 25

/**
 * Home screen: latest changes across the pages the user can open (cards and
 * database rows), and each page's last activity with who made the last change.
 */
export async function GET() {
  const userId = await getAuthUserId()
  if (!userId) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const pages = await db.page.findMany({
    where: accessiblePageWhere(userId),
    select: { id: true, title: true, icon: true, kind: true, userId: true, updatedAt: true },
  })
  const pageIds = pages.map((p) => p.id)
  const titulo = new Map(pages.map((p) => [p.id, p]))

  const [cards, rows, versiones, ultCards, ultRows] = await Promise.all([
    db.card.findMany({
      where: { column: { pageId: { in: pageIds } } },
      orderBy: { updatedAt: 'desc' },
      take: RECIENTES,
      select: { id: true, title: true, updatedAt: true, column: { select: { title: true, pageId: true } } },
    }),
    db.dbRow.findMany({
      where: { database: { pageId: { in: pageIds } } },
      orderBy: { updatedAt: 'desc' },
      take: RECIENTES,
      select: { id: true, title: true, icon: true, updatedAt: true, database: { select: { title: true, pageId: true } } },
    }),
    // Version history records who made each change: the latest per page.
    db.pageVersion.findMany({
      where: { pageId: { in: pageIds } },
      orderBy: { createdAt: 'desc' },
      distinct: ['pageId'],
      select: { pageId: true, userId: true, createdAt: true },
    }),
    Promise.all(
      pageIds.map((id) =>
        db.card.aggregate({ where: { column: { pageId: id } }, _max: { updatedAt: true } }).then((a) => [id, a._max.updatedAt] as const)
      )
    ),
    Promise.all(
      pageIds.map((id) =>
        db.dbRow.aggregate({ where: { database: { pageId: id } }, _max: { updatedAt: true } }).then((a) => [id, a._max.updatedAt] as const)
      )
    ),
  ])

  const autores = [...new Set(versiones.map((v) => v.userId).filter((v): v is string => !!v))]
  const usuarios = new Map(
    (await db.user.findMany({ where: { id: { in: autores } }, select: { id: true, name: true, email: true } })).map((u) => [
      u.id,
      u.id === userId ? 'vos' : u.name || u.email,
    ])
  )
  const version = new Map(versiones.map((v) => [v.pageId, v]))
  const maxCard = new Map(ultCards)
  const maxRow = new Map(ultRows)

  const paginas = pages
    .map((p) => {
      const v = version.get(p.id)
      const fechas = [p.updatedAt, maxCard.get(p.id), maxRow.get(p.id), v?.createdAt].filter((d): d is Date => !!d)
      return {
        id: p.id,
        title: p.title,
        icon: p.icon,
        kind: p.kind,
        propia: p.userId === userId,
        ultimaActividad: new Date(Math.max(...fechas.map((d) => d.getTime()))).toISOString(),
        ultimoAutor: v?.userId ? (usuarios.get(v.userId) ?? null) : null,
      }
    })
    .sort((a, b) => b.ultimaActividad.localeCompare(a.ultimaActividad))

  const actividad = [
    ...cards.map((c) => ({
      tipo: 'tarjeta' as const,
      id: c.id,
      titulo: c.title || 'Sin título',
      icono: null as string | null,
      pageId: c.column.pageId,
      pagina: titulo.get(c.column.pageId)?.title ?? '',
      paginaIcono: titulo.get(c.column.pageId)?.icon ?? null,
      lugar: c.column.title,
      at: c.updatedAt.toISOString(),
    })),
    ...rows.map((r) => ({
      tipo: 'fila' as const,
      id: r.id,
      titulo: r.title || 'Sin título',
      icono: r.icon,
      pageId: r.database.pageId,
      pagina: titulo.get(r.database.pageId)?.title ?? '',
      paginaIcono: titulo.get(r.database.pageId)?.icon ?? null,
      lugar: r.database.title,
      at: r.updatedAt.toISOString(),
    })),
  ]
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, RECIENTES)

  return NextResponse.json({ paginas, actividad })
}
