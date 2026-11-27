import { randomBytes } from 'node:crypto'
import { db } from '@/lib/db'
import { esAdmin } from '@/lib/admins'
import { parentOf } from '@/lib/subpages-server'
import type { DocKind, DocRef } from '@/lib/subpages'

/**
 * Public read-only links (/compartido/<token>). Server only.
 *
 * The link opens one document and the sub-pages inside it, nothing else.
 * Uploaded files (/api/files/<id>) need an account, so the content sent to
 * the public page points its images at /api/compartido/<token>/archivo/<id>,
 * which only serves files that appear in the shared document.
 */

const MAX_DEPTH = 20

export function newPublicToken() {
  return randomBytes(18).toString('base64url')
}

export function publicUrl(origin: string, token: string) {
  return `${origin}/compartido/${token}`
}

export async function findPublicLink(token: string) {
  if (!token || token.length > 100) return null
  const link = await db.publicLink.findUnique({ where: { token } })
  // Only links made by an admin work (others stop working, even old ones).
  if (!link || !(await esAdmin(link.createdById))) return null
  return link
}

export type PublicDoc = {
  kind: DocKind
  id: string
  title: string
  icon: string | null
  coverUrl: string | null
  logoUrl: string | null
  content: string | null
  updatedAt: string
}

/** A document's own data, without any access check. */
async function readDoc(ref: DocRef): Promise<PublicDoc | null> {
  if (ref.kind === 'row') {
    const r = await db.dbRow.findUnique({ where: { id: ref.id }, select: { title: true, icon: true, logoUrl: true, content: true, updatedAt: true } })
    return r ? { ...ref, title: r.title, icon: r.icon, coverUrl: null, logoUrl: r.logoUrl, content: r.content, updatedAt: r.updatedAt.toISOString() } : null
  }
  if (ref.kind === 'card') {
    const c = await db.card.findUnique({ where: { id: ref.id }, select: { title: true, icon: true, coverUrl: true, logoUrl: true, description: true, updatedAt: true } })
    return c ? { ...ref, title: c.title, icon: c.icon, coverUrl: c.coverUrl, logoUrl: c.logoUrl, content: c.description, updatedAt: c.updatedAt.toISOString() } : null
  }
  const s = await db.subPage.findUnique({ where: { id: ref.id }, select: { title: true, icon: true, logoUrl: true, content: true, updatedAt: true } })
  return s ? { ...ref, title: s.title, icon: s.icon, coverUrl: null, logoUrl: s.logoUrl, content: s.content, updatedAt: s.updatedAt.toISOString() } : null
}

/** True when the sub-page lives (at any depth) inside the shared document. */
async function isInside(subpageId: string, root: DocRef): Promise<boolean> {
  let ref: DocRef = { kind: 'subpage', id: subpageId }
  for (let i = 0; i < MAX_DEPTH; i++) {
    if (ref.kind === root.kind && ref.id === root.id) return true
    if (ref.kind !== 'subpage') return false
    const s = await db.subPage.findUnique({
      where: { id: ref.id },
      select: { parentRowId: true, parentCardId: true, parentSubPageId: true },
    })
    if (!s) return false
    ref = parentOf(s)
  }
  return false
}

/**
 * The document a public link shows: the shared one, or one of its sub-pages
 * when `subpageId` is given. Null when it doesn't exist or isn't inside.
 */
export async function publicDoc(link: { kind: string; docId: string }, subpageId?: string | null): Promise<PublicDoc | null> {
  const root: DocRef = { kind: link.kind as DocKind, id: link.docId }
  if (subpageId && !(root.kind === 'subpage' && root.id === subpageId)) {
    if (!(await isInside(subpageId, root))) return null
    return readDoc({ kind: 'subpage', id: subpageId })
  }
  return readDoc(root)
}

const FILE_URL = /(?:https?:\/\/[^"'\s()]*?)?\/api\/files\/([A-Za-z0-9_-]+)/g

/** Points uploaded files in the content at the link's own file route. */
export function rewriteFileUrls(text: string, token: string, subpageId?: string | null) {
  const q = subpageId ? `?p=${encodeURIComponent(subpageId)}` : ''
  return text.replace(FILE_URL, (_m, id: string) => `/api/compartido/${token}/archivo/${id}${q}`)
}

/** True when the document shows that uploaded file. */
export function docUsesFile(doc: PublicDoc, fileId: string) {
  if (!/^[A-Za-z0-9_-]+$/.test(fileId)) return false
  const re = new RegExp(`/api/files/${fileId}(?![A-Za-z0-9_-])`)
  return re.test(doc.content ?? '') || re.test(doc.coverUrl ?? '') || re.test(doc.logoUrl ?? '')
}
