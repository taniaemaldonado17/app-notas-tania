import { after, NextResponse } from 'next/server'
import type { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { getAuthUserId } from '@/lib/auth-helpers'
import { saveVersionBeforeChange } from '@/lib/versions'
import { hashDoc } from '@/lib/doc-merge'
import { appOrigin, notifyNewMentions } from '@/lib/mentions'
import { findAccessibleSubPage, subPageInfo, syncLinkBlock } from '@/lib/subpages-server'

/** A sub-page with its content and where it lives (breadcrumbs). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getAuthUserId()
  if (!userId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const { id } = await params
  const sub = await findAccessibleSubPage(userId, id)
  if (!sub) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
  return NextResponse.json({ subpage: await subPageInfo(sub) })
}

/**
 * Body: { title?, icon?, content?, baseHash? }. Like a row's content, a save
 * that started from an outdated version gets 409 with the current content.
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getAuthUserId()
  if (!userId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const { id } = await params
  const sub = await findAccessibleSubPage(userId, id)
  if (!sub) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })

  try {
    const body = await req.json()
    const data: Prisma.SubPageUpdateInput = {}
    if (typeof body.title === 'string') data.title = body.title.slice(0, 2000)
    if (body.icon === null || typeof body.icon === 'string') data.icon = body.icon ? String(body.icon).slice(0, 16) : null
    const contentChanged = body.content === null || typeof body.content === 'string'
    if (contentChanged) {
      data.content = body.content || null
      if (typeof body.baseHash === 'string' && hashDoc(sub.content) !== body.baseHash) {
        return NextResponse.json({ error: 'conflict', current: sub.content ?? null }, { status: 409 })
      }
    }
    if (!Object.keys(data).length) return NextResponse.json({ ok: true })

    await saveVersionBeforeChange(sub.pageId, userId)
    await db.subPage.update({ where: { id }, data })
    if (data.title !== undefined || data.icon !== undefined) {
      await syncLinkBlock(sub, {
        ...(typeof data.title === 'string' ? { title: data.title } : {}),
        ...(data.icon !== undefined ? { icon: (data.icon as string | null) ?? null } : {}),
      })
    }
    const newContent = typeof data.content === 'string' ? data.content : null
    if (contentChanged && newContent?.includes('"mention"')) {
      const origin = appOrigin(req)
      after(() =>
        notifyNewMentions({
          actorId: userId,
          pageId: sub.pageId,
          before: sub.content,
          after: newContent,
          itemTitle: (typeof data.title === 'string' ? data.title : sub.title) || 'Página sin título',
          link: `${origin}/?subpage=${encodeURIComponent(id)}`,
        }).catch((err) => console.error('[subpages PATCH mentions]', err))
      )
    }
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[subpages PATCH]', err)
    return NextResponse.json({ error: 'No se pudo guardar' }, { status: 500 })
  }
}
