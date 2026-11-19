import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { canAccessPage, getAuthUserId } from '@/lib/auth-helpers'

/** Saved versions of a page, newest first. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getAuthUserId()
  if (!userId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const { id } = await params
  if (!(await canAccessPage(userId, id))) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })

  const versions = await db.pageVersion.findMany({
    where: { pageId: id },
    orderBy: { createdAt: 'desc' },
    select: { id: true, createdAt: true, userId: true },
  })
  const ids = [...new Set(versions.map((v) => v.userId).filter((u): u is string => !!u))]
  const users = new Map(
    (await db.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, email: true } })).map((u) => [
      u.id,
      u.name || u.email,
    ])
  )
  return NextResponse.json({
    versions: versions.map((v) => ({
      id: v.id,
      createdAt: v.createdAt.toISOString(),
      editedBy: v.userId ? users.get(v.userId) ?? null : null,
    })),
  })
}
