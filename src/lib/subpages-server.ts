import type { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { accessiblePageWhere } from '@/lib/auth-helpers'
import { parseDoc, serializeDoc } from '@/lib/blocks'
import { updateSubPageBlocks, type DocKind, type DocRef, type SubPageInfo } from '@/lib/subpages'

const MAX_DEPTH = 20

/** A sub-page the user can open (its page is theirs or shared with them). */
export async function findAccessibleSubPage(userId: string, id: string) {
  return db.subPage.findFirst({
    where: { id, page: accessiblePageWhere(userId) },
    select: { id: true, pageId: true, title: true, icon: true, content: true, parentRowId: true, parentCardId: true, parentSubPageId: true, updatedAt: true },
  })
}

type SubRecord = NonNullable<Awaited<ReturnType<typeof findAccessibleSubPage>>>

export function parentOf(s: { parentRowId: string | null; parentCardId: string | null; parentSubPageId: string | null }): DocRef {
  if (s.parentSubPageId) return { kind: 'subpage', id: s.parentSubPageId }
  if (s.parentRowId) return { kind: 'row', id: s.parentRowId }
  return { kind: 'card', id: s.parentCardId ?? '' }
}

/** Page (for access and version history) and title of a document the user can open, or null. */
export async function findAccessibleDoc(userId: string, ref: DocRef): Promise<{ pageId: string; title: string; icon: string | null; content: string | null } | null> {
  if (ref.kind === 'row') {
    const r = await db.dbRow.findFirst({
      where: { id: ref.id, database: { page: accessiblePageWhere(userId) } },
      select: { title: true, icon: true, content: true, database: { select: { pageId: true } } },
    })
    return r ? { pageId: r.database.pageId, title: r.title, icon: r.icon, content: r.content } : null
  }
  if (ref.kind === 'card') {
    const c = await db.card.findFirst({
      where: { id: ref.id, column: { page: accessiblePageWhere(userId) } },
      select: { title: true, icon: true, description: true, column: { select: { pageId: true } } },
    })
    return c ? { pageId: c.column.pageId, title: c.title, icon: c.icon, content: c.description } : null
  }
  const s = await findAccessibleSubPage(userId, ref.id)
  return s ? { pageId: s.pageId, title: s.title, icon: s.icon, content: s.content } : null
}

/** Stored content of any document (no access check: callers check first). */
async function readContent(ref: DocRef): Promise<string | null> {
  if (ref.kind === 'row') return (await db.dbRow.findUnique({ where: { id: ref.id }, select: { content: true } }))?.content ?? null
  if (ref.kind === 'card') return (await db.card.findUnique({ where: { id: ref.id }, select: { description: true } }))?.description ?? null
  return (await db.subPage.findUnique({ where: { id: ref.id }, select: { content: true } }))?.content ?? null
}

export async function writeContent(ref: DocRef, content: string | null) {
  if (ref.kind === 'row') await db.dbRow.update({ where: { id: ref.id }, data: { content } })
  else if (ref.kind === 'card') await db.card.update({ where: { id: ref.id }, data: { description: content } })
  else await db.subPage.update({ where: { id: ref.id }, data: { content } })
}

/**
 * Keeps the link block in the parent document showing the sub-page's current
 * title and icon. Open editors pick the change up like any other edit.
 */
export async function syncLinkBlock(sub: { id: string; parentRowId: string | null; parentCardId: string | null; parentSubPageId: string | null }, patch: { title?: string; icon?: string | null }) {
  const parent = parentOf(sub)
  const raw = await readContent(parent)
  const next = updateSubPageBlocks(parseDoc(raw), sub.id, patch)
  if (next) await writeContent(parent, serializeDoc(next))
}

/** From the top document down to the sub-page's parent, for breadcrumbs and links. */
export async function subPageTrail(sub: SubRecord): Promise<SubPageInfo['trail']> {
  const trail: SubPageInfo['trail'] = []
  let ref = parentOf(sub)
  for (let i = 0; i < MAX_DEPTH; i++) {
    if (ref.kind === 'subpage') {
      const p = await db.subPage.findUnique({
        where: { id: ref.id },
        select: { id: true, title: true, icon: true, parentRowId: true, parentCardId: true, parentSubPageId: true },
      })
      if (!p) break
      trail.unshift({ kind: 'subpage', id: p.id, title: p.title, icon: p.icon })
      ref = parentOf(p)
      continue
    }
    if (ref.kind === 'row') {
      const r = await db.dbRow.findUnique({ where: { id: ref.id }, select: { id: true, title: true, icon: true } })
      if (r) trail.unshift({ kind: 'row', id: r.id, title: r.title, icon: r.icon })
    } else {
      const c = await db.card.findUnique({ where: { id: ref.id }, select: { id: true, title: true, icon: true } })
      if (c) trail.unshift({ kind: 'card', id: c.id, title: c.title, icon: c.icon })
    }
    break
  }
  return trail
}

export async function subPageInfo(sub: SubRecord): Promise<SubPageInfo> {
  return {
    id: sub.id,
    pageId: sub.pageId,
    title: sub.title,
    icon: sub.icon,
    content: sub.content,
    parent: parentOf(sub),
    trail: await subPageTrail(sub),
    updatedAt: sub.updatedAt.toISOString(),
  }
}

/** Creates a sub-page under a document (the caller adds the link block). */
export async function createSubPage(
  userId: string,
  pageId: string,
  parent: DocRef,
  data: { title: string; icon: string | null; content: string | null }
) {
  const link: Prisma.SubPageUncheckedCreateInput = {
    pageId,
    title: data.title.slice(0, 2000),
    icon: data.icon,
    content: data.content,
    createdById: userId,
    parentRowId: parent.kind === 'row' ? parent.id : null,
    parentCardId: parent.kind === 'card' ? parent.id : null,
    parentSubPageId: parent.kind === 'subpage' ? parent.id : null,
  }
  return db.subPage.create({ data: link, select: { id: true, title: true, icon: true } })
}

export const isDocKind = (v: unknown): v is DocKind => v === 'row' || v === 'card' || v === 'subpage'
