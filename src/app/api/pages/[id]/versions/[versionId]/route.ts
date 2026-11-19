import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { canAccessPage, getAuthUserId } from '@/lib/auth-helpers'
import { restoreSnapshot, takeSnapshot, type PageSnapshot } from '@/lib/versions'

type Ctx = { params: Promise<{ id: string; versionId: string }> }

async function load(ctx: Ctx) {
  const userId = await getAuthUserId()
  if (!userId) return { error: NextResponse.json({ error: 'No autorizado' }, { status: 401 }) }
  const { id, versionId } = await ctx.params
  if (!(await canAccessPage(userId, id))) return { error: NextResponse.json({ error: 'No encontrado' }, { status: 404 }) }
  const version = await db.pageVersion.findFirst({ where: { id: versionId, pageId: id }, select: { snapshot: true } })
  if (!version) return { error: NextResponse.json({ error: 'Versión no encontrada' }, { status: 404 }) }
  return { userId, pageId: id, snapshot: version.snapshot as unknown as PageSnapshot }
}

/** A saved version and the page as it is now (to show the differences). */
export async function GET(_req: Request, ctx: Ctx) {
  const v = await load(ctx)
  if ('error' in v) return v.error
  return NextResponse.json({ version: v.snapshot, current: await takeSnapshot(v.pageId) })
}

/**
 * Restores the version. Body: {} for the whole page, or
 * { rowIds?: string[], cardIds?: string[] } to bring back only those items.
 */
export async function POST(req: Request, ctx: Ctx) {
  const v = await load(ctx)
  if ('error' in v) return v.error
  const body = await req.json().catch(() => ({}))
  const ids = (x: unknown) => (Array.isArray(x) ? x.filter((i): i is string => typeof i === 'string') : undefined)
  const rowIds = ids(body?.rowIds)
  const cardIds = ids(body?.cardIds)
  try {
    const res = await restoreSnapshot(v.pageId, v.userId, v.snapshot, rowIds || cardIds ? { rowIds, cardIds } : undefined)
    return NextResponse.json(res)
  } catch (err) {
    console.error('[versions restore]', err)
    return NextResponse.json({ error: 'No se pudo restaurar' }, { status: 500 })
  }
}
