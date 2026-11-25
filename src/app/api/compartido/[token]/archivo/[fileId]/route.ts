import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { docUsesFile, findPublicLink, publicDoc } from '@/lib/public-links'

/**
 * An uploaded file (image) of a publicly shared document, for people without
 * an account. Only files that appear in the shared document (or in the
 * sub-page given as ?p=) are served.
 */
export async function GET(req: Request, { params }: { params: Promise<{ token: string; fileId: string }> }) {
  const { token, fileId } = await params
  const link = await findPublicLink(token)
  if (!link) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
  const doc = await publicDoc(link, new URL(req.url).searchParams.get('p'))
  if (!doc || !docUsesFile(doc, fileId)) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })

  const upload = await db.upload.findUnique({ where: { id: fileId } })
  if (!upload) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
  return new Response(new Uint8Array(upload.data), {
    headers: {
      'Content-Type': upload.mimeType,
      'Content-Length': String(upload.size),
      'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(upload.name)}`,
      'X-Content-Type-Options': 'nosniff',
      // Short cache: stopping sharing should take effect soon.
      'Cache-Control': 'public, max-age=300',
    },
  })
}
