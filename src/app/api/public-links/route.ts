import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getAuthUserId } from '@/lib/auth-helpers'
import { findAccessibleDoc, isDocKind } from '@/lib/subpages-server'
import { newPublicToken, publicUrl } from '@/lib/public-links'
import { appOrigin } from '@/lib/mentions'
import type { DocRef } from '@/lib/subpages'

/**
 * Public read-only link of a document (row, card or sub-page).
 *   GET    ?kind=row&id=…   → { link: { token, url } | null }
 *   POST   { kind, id }      → creates it (or returns the existing one)
 *   DELETE ?kind=row&id=…   → stops sharing: the link stops working
 * Anyone who can open the document can manage its link.
 */

async function docFrom(userId: string, kind: unknown, id: unknown) {
  if (!isDocKind(kind) || typeof id !== 'string' || !id) return null
  const ref: DocRef = { kind, id }
  const doc = await findAccessibleDoc(userId, ref)
  return doc ? { ref, doc } : null
}

function linkJson(req: Request, token: string) {
  return { token, url: publicUrl(appOrigin(req), token) }
}

export async function GET(req: Request) {
  const userId = await getAuthUserId()
  if (!userId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const q = new URL(req.url).searchParams
  const found = await docFrom(userId, q.get('kind'), q.get('id'))
  if (!found) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
  const link = await db.publicLink.findFirst({ where: { kind: found.ref.kind, docId: found.ref.id }, orderBy: { createdAt: 'asc' } })
  return NextResponse.json({ link: link ? linkJson(req, link.token) : null })
}

export async function POST(req: Request) {
  const userId = await getAuthUserId()
  if (!userId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const body = await req.json().catch(() => ({}))
  const found = await docFrom(userId, body?.kind, body?.id)
  if (!found) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
  const existing = await db.publicLink.findFirst({ where: { kind: found.ref.kind, docId: found.ref.id }, orderBy: { createdAt: 'asc' } })
  const link =
    existing ??
    (await db.publicLink.create({
      data: { token: newPublicToken(), pageId: found.doc.pageId, kind: found.ref.kind, docId: found.ref.id, createdById: userId },
    }))
  return NextResponse.json({ link: linkJson(req, link.token) })
}

export async function DELETE(req: Request) {
  const userId = await getAuthUserId()
  if (!userId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const q = new URL(req.url).searchParams
  const found = await docFrom(userId, q.get('kind'), q.get('id'))
  if (!found) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
  await db.publicLink.deleteMany({ where: { kind: found.ref.kind, docId: found.ref.id } })
  return NextResponse.json({ ok: true })
}
