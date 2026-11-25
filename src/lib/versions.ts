import type { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { hashDoc } from '@/lib/doc-merge'
import { sameJson, stableStringify } from '@/lib/stable-json'

/**
 * Version history of a page.
 *
 * Before a page is changed, its current state is saved as a version if the
 * last saved one is older than a few minutes (so a burst of edits makes one
 * version, not hundreds). Deletions and restores always save first, so
 * whatever is removed can be brought back.
 */

const GROUP_MS = 5 * 60 * 1000
/** A deletion right after a saved version doesn't need another one. */
const FORCE_GROUP_MS = 15 * 1000
/** Versions kept per page: at most this many, and none older than KEEP_DAYS (but always the last MIN_KEEP). */
const KEEP_VERSIONS = 60
const KEEP_DAYS = 45
const MIN_KEEP = 10

export type SnapRow = {
  id: string
  title: string
  icon: string | null
  values: Prisma.JsonValue
  content: string | null
  position: number
  createdById: string | null
  createdAt: string
}

export type SnapDatabase = {
  id: string
  title: string
  icon: string | null
  position: number
  properties: Prisma.JsonValue
  views: Prisma.JsonValue
  rows: SnapRow[]
}

export type SnapCard = {
  id: string
  title: string
  description: string | null
  coverUrl: string | null
  accentColor: string | null
  icon: string | null
  position: number
  createdAt: string
  checklist: { id: string; text: string; checked: boolean; position: number }[]
  attachments: { id: string; type: string; title: string; url: string; previewUrl: string | null; position: number }[]
}

export type SnapColumn = {
  id: string
  title: string
  position: number
  accentColor: string | null
  cards: SnapCard[]
}

export type SnapSubPage = {
  id: string
  title: string
  icon: string | null
  content: string | null
  parentRowId: string | null
  parentCardId: string | null
  parentSubPageId: string | null
  createdById: string | null
  createdAt: string
}

export type PageSnapshot = {
  v: 1
  page: { title: string; subtitle: string | null; icon: string | null; coverUrl: string | null; layout: Prisma.JsonValue }
  databases: SnapDatabase[]
  columns: SnapColumn[]
  /** Pages inside documents ("Página" blocks). Absent in older versions and when there are none. */
  subpages?: SnapSubPage[]
}

/** Current state of a page (comments and favourites are not part of it). */
export async function takeSnapshot(pageId: string): Promise<PageSnapshot | null> {
  const page = await db.page.findUnique({
    where: { id: pageId },
    select: {
      title: true,
      subtitle: true,
      icon: true,
      coverUrl: true,
      layout: true,
      databases: {
        orderBy: { position: 'asc' },
        select: {
          id: true,
          title: true,
          icon: true,
          position: true,
          properties: true,
          views: true,
          rows: {
            orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
            select: { id: true, title: true, icon: true, values: true, content: true, position: true, createdById: true, createdAt: true },
          },
        },
      },
      columns: {
        orderBy: { position: 'asc' },
        select: {
          id: true,
          title: true,
          position: true,
          accentColor: true,
          cards: {
            orderBy: { position: 'asc' },
            select: {
              id: true,
              title: true,
              description: true,
              coverUrl: true,
              accentColor: true,
              icon: true,
              position: true,
              createdAt: true,
              checklist: { orderBy: { position: 'asc' }, select: { id: true, text: true, checked: true, position: true } },
              attachments: {
                orderBy: { position: 'asc' },
                select: { id: true, type: true, title: true, url: true, previewUrl: true, position: true },
              },
            },
          },
        },
      },
    },
  })
  if (!page) return null
  const subpages = await db.subPage.findMany({
    where: { pageId },
    orderBy: { createdAt: 'asc' },
    select: { id: true, title: true, icon: true, content: true, parentRowId: true, parentCardId: true, parentSubPageId: true, createdById: true, createdAt: true },
  })
  return {
    v: 1,
    page: { title: page.title, subtitle: page.subtitle, icon: page.icon, coverUrl: page.coverUrl, layout: page.layout ?? null },
    databases: page.databases.map((d) => ({
      ...d,
      rows: d.rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })),
    })),
    columns: page.columns.map((c) => ({
      ...c,
      cards: c.cards.map((k) => ({ ...k, createdAt: k.createdAt.toISOString() })),
    })),
    // Only when there are some, so pages without sub-pages keep the same fingerprint.
    ...(subpages.length ? { subpages: subpages.map((sp) => ({ ...sp, createdAt: sp.createdAt.toISOString() })) } : {}),
  }
}

/**
 * Saves the page's current state as a version, unless one was saved a moment
 * ago. Call it before changing the page; `force` for deletions. Never throws
 * (a failed version must not block the change).
 */
export async function saveVersionBeforeChange(pageId: string, userId: string, opts: { force?: boolean } = {}) {
  try {
    const latest = await db.pageVersion.findFirst({
      where: { pageId },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true, hash: true },
    })
    const age = latest ? Date.now() - latest.createdAt.getTime() : Infinity
    if (age < (opts.force ? FORCE_GROUP_MS : GROUP_MS)) return
    const snap = await takeSnapshot(pageId)
    if (!snap) return
    const hash = hashDoc(stableStringify(snap))
    if (latest?.hash === hash) {
      // Nothing changed since: just mark it as still current.
      await db.pageVersion.updateMany({ where: { pageId, hash, createdAt: latest.createdAt }, data: { createdAt: new Date(), userId } })
      return
    }
    await db.pageVersion.create({ data: { pageId, userId, hash, snapshot: snap as unknown as Prisma.InputJsonValue } })
    const all = await db.pageVersion.findMany({
      where: { pageId },
      orderBy: { createdAt: 'desc' },
      select: { id: true, createdAt: true },
    })
    const cutoff = Date.now() - KEEP_DAYS * 86400000
    const old = all.filter((v, i) => i >= KEEP_VERSIONS || (i >= MIN_KEEP && v.createdAt.getTime() < cutoff))
    if (old.length) await db.pageVersion.deleteMany({ where: { id: { in: old.map((o) => o.id) } } })
  } catch (err) {
    console.error('[versions] could not save version', err)
  }
}

/** Same as saveVersionBeforeChange for every page in the list. */
export async function saveVersionsBeforeChange(pageIds: string[], userId: string) {
  for (const id of new Set(pageIds)) await saveVersionBeforeChange(id, userId)
}

/* -------------------------------- Restore --------------------------------- */

const same = sameJson
const json = (v: Prisma.JsonValue) => (v ?? undefined) as Prisma.InputJsonValue

/**
 * Brings a page back to a saved state, or only some of its rows/cards
 * (`only`), leaving everything else as it is now. The current state is saved
 * as a version first, so a restore can be undone.
 */
export async function restoreSnapshot(
  pageId: string,
  userId: string,
  snap: PageSnapshot,
  only?: { rowIds?: string[]; cardIds?: string[] }
): Promise<{ restored: number; skipped: number }> {
  await saveVersionBeforeChange(pageId, userId, { force: true })
  const current = await takeSnapshot(pageId)
  if (!current) throw new Error('page not found')

  const users = new Set(
    (await db.user.findMany({ select: { id: true } })).map((u) => u.id)
  )
  const partial = !!only
  const wantRow = (id: string) => !partial || !!only?.rowIds?.includes(id)
  const wantCard = (id: string) => !partial || !!only?.cardIds?.includes(id)
  let restored = 0
  let skipped = 0

  await db.$transaction(
    async (tx) => {
      /* Page */
      if (!partial && !same(current.page, snap.page)) {
        await tx.page.update({
          where: { id: pageId },
          data: { ...snap.page, layout: snap.page.layout === null ? undefined : json(snap.page.layout) },
        })
      }

      /* Databases and rows */
      const curDbs = new Map(current.databases.map((d) => [d.id, d]))
      if (!partial) {
        const keep = new Set(snap.databases.map((d) => d.id))
        const gone = current.databases.filter((d) => !keep.has(d.id)).map((d) => d.id)
        if (gone.length) await tx.database.deleteMany({ where: { id: { in: gone }, pageId } })
      }
      for (const d of snap.databases) {
        const cur = curDbs.get(d.id)
        if (!partial) {
          const data = { title: d.title, icon: d.icon, position: d.position, properties: json(d.properties), views: json(d.views) }
          if (!cur) await tx.database.create({ data: { id: d.id, pageId, ...data } })
          else if (!same({ ...cur, rows: 0 }, { ...d, rows: 0 })) await tx.database.update({ where: { id: d.id }, data })
        } else if (!cur && d.rows.some((r) => wantRow(r.id))) {
          skipped += d.rows.filter((r) => wantRow(r.id)).length // its database no longer exists
          continue
        }
        const curRows = new Map((cur?.rows ?? []).map((r) => [r.id, r]))
        if (!partial && cur) {
          const keep = new Set(d.rows.map((r) => r.id))
          const gone = cur.rows.filter((r) => !keep.has(r.id)).map((r) => r.id)
          if (gone.length) await tx.dbRow.deleteMany({ where: { id: { in: gone }, databaseId: d.id } })
        }
        for (const r of d.rows) {
          if (!wantRow(r.id)) continue
          const now = curRows.get(r.id)
          if (now && same(now, r)) continue
          const data = {
            title: r.title,
            icon: r.icon,
            values: json(r.values),
            content: r.content,
            position: r.position,
          }
          if (now) await tx.dbRow.update({ where: { id: r.id }, data })
          else {
            await tx.dbRow.deleteMany({ where: { id: r.id } }) // in case it moved to another page
            await tx.dbRow.create({
              data: {
                id: r.id,
                databaseId: d.id,
                ...data,
                createdById: r.createdById && users.has(r.createdById) ? r.createdById : null,
                createdAt: new Date(r.createdAt),
              },
            })
          }
          restored++
        }
      }

      /* Board columns and cards */
      const curCols = new Map(current.columns.map((c) => [c.id, c]))
      const curCards = new Map(current.columns.flatMap((c) => c.cards.map((k) => [k.id, { ...k, columnId: c.id }] as const)))
      if (!partial) {
        const keepCols = new Set(snap.columns.map((c) => c.id))
        const goneCols = current.columns.filter((c) => !keepCols.has(c.id)).map((c) => c.id)
        const keepCards = new Set(snap.columns.flatMap((c) => c.cards.map((k) => k.id)))
        const goneCards = [...curCards.keys()].filter((id) => !keepCards.has(id))
        if (goneCards.length) await tx.card.deleteMany({ where: { id: { in: goneCards } } })
        if (goneCols.length) await tx.column.deleteMany({ where: { id: { in: goneCols }, pageId } })
      }
      for (const c of snap.columns) {
        const cur = curCols.get(c.id)
        if (!partial) {
          const data = { title: c.title, position: c.position, accentColor: c.accentColor }
          if (!cur) await tx.column.create({ data: { id: c.id, pageId, ...data } })
          else if (!same({ ...cur, cards: 0 }, { ...c, cards: 0 })) await tx.column.update({ where: { id: c.id }, data })
        } else if (!cur && c.cards.some((k) => wantCard(k.id))) {
          skipped += c.cards.filter((k) => wantCard(k.id)).length
          continue
        }
        for (const k of c.cards) {
          if (!wantCard(k.id)) continue
          const now = curCards.get(k.id)
          if (now && now.columnId === c.id && same({ ...now, columnId: 0 }, { ...k, columnId: 0 })) continue
          const data = {
            title: k.title,
            description: k.description,
            coverUrl: k.coverUrl,
            accentColor: k.accentColor,
            icon: k.icon,
            position: k.position,
            columnId: c.id,
          }
          if (now) await tx.card.update({ where: { id: k.id }, data })
          else {
            await tx.card.deleteMany({ where: { id: k.id } })
            await tx.card.create({ data: { id: k.id, ...data, createdAt: new Date(k.createdAt) } })
          }
          if (!now || !same(now.checklist, k.checklist)) {
            await tx.checklistItem.deleteMany({ where: { cardId: k.id } })
            if (k.checklist.length) await tx.checklistItem.createMany({ data: k.checklist.map((i) => ({ ...i, cardId: k.id })) })
          }
          if (!now || !same(now.attachments, k.attachments)) {
            await tx.attachment.deleteMany({ where: { cardId: k.id } })
            if (k.attachments.length) await tx.attachment.createMany({ data: k.attachments.map((a) => ({ ...a, cardId: k.id })) })
          }
          restored++
        }
      }

      /* Sub-pages: brought back (or back to how they were) when their parent
         document is restored too. Sub-pages created later are left alone. */
      const snapSubs = snap.subpages ?? []
      if (snapSubs.length) {
        const curSubs = new Map((current.subpages ?? []).map((sp) => [sp.id, sp]))
        const byId = new Map(snapSubs.map((sp) => [sp.id, sp]))
        const wanted = (sp: SnapSubPage, depth = 0): boolean => {
          if (depth > 20) return false
          if (sp.parentRowId) return wantRow(sp.parentRowId)
          if (sp.parentCardId) return wantCard(sp.parentCardId)
          const parent = sp.parentSubPageId ? byId.get(sp.parentSubPageId) : undefined
          return parent ? wanted(parent, depth + 1) : !partial
        }
        // Parents first, so nested sub-pages find theirs.
        const depthOf = (sp: SnapSubPage) => {
          let d = 0
          for (let p = sp; p.parentSubPageId && byId.has(p.parentSubPageId) && d < 20; p = byId.get(p.parentSubPageId)!) d++
          return d
        }
        for (const sp of [...snapSubs].sort((a, b) => depthOf(a) - depthOf(b))) {
          if (!wanted(sp)) continue
          const now = curSubs.get(sp.id)
          const data = { title: sp.title, icon: sp.icon, content: sp.content }
          if (now) {
            if (!same({ ...now, createdAt: 0 }, { ...sp, createdAt: 0 })) await tx.subPage.update({ where: { id: sp.id }, data })
            continue
          }
          const parentExists = sp.parentRowId
            ? !!(await tx.dbRow.findUnique({ where: { id: sp.parentRowId }, select: { id: true } }))
            : sp.parentCardId
              ? !!(await tx.card.findUnique({ where: { id: sp.parentCardId }, select: { id: true } }))
              : !!(sp.parentSubPageId && (await tx.subPage.findUnique({ where: { id: sp.parentSubPageId }, select: { id: true } })))
          if (!parentExists) continue
          await tx.subPage.deleteMany({ where: { id: sp.id } })
          await tx.subPage.create({
            data: {
              id: sp.id,
              pageId,
              ...data,
              parentRowId: sp.parentRowId,
              parentCardId: sp.parentCardId,
              parentSubPageId: sp.parentSubPageId,
              createdById: sp.createdById && users.has(sp.createdById) ? sp.createdById : null,
              createdAt: new Date(sp.createdAt),
            },
          })
        }
      }
    },
    { timeout: 120_000, maxWait: 10_000 }
  )
  return { restored, skipped }
}
