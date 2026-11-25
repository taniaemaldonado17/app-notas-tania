import { NextResponse } from 'next/server'
import { getAuthUserId } from '@/lib/auth-helpers'
import { saveVersionBeforeChange } from '@/lib/versions'
import { createSubPage, findAccessibleDoc, isDocKind } from '@/lib/subpages-server'

/**
 * Creates a sub-page inside a document. Body: { parent: { kind, id }, title?,
 * icon?, content? }. The editor then adds the link block to the parent.
 */
export async function POST(req: Request) {
  const userId = await getAuthUserId()
  if (!userId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const parent = body?.parent
  if (!parent || !isDocKind(parent.kind) || typeof parent.id !== 'string') {
    return NextResponse.json({ error: 'Falta el documento donde crear la página' }, { status: 400 })
  }
  const doc = await findAccessibleDoc(userId, { kind: parent.kind, id: parent.id })
  if (!doc) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })

  try {
    await saveVersionBeforeChange(doc.pageId, userId)
    const sub = await createSubPage(userId, doc.pageId, { kind: parent.kind, id: parent.id }, {
      title: typeof body.title === 'string' ? body.title : '',
      icon: typeof body.icon === 'string' && body.icon ? body.icon.slice(0, 16) : null,
      content: typeof body.content === 'string' && body.content ? body.content : null,
    })
    return NextResponse.json({ subpage: sub })
  } catch (err) {
    console.error('[subpages POST]', err)
    return NextResponse.json({ error: 'No se pudo crear la página' }, { status: 500 })
  }
}
