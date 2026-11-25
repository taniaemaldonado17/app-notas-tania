import { NextResponse } from 'next/server'
import { docUsesFile, findPublicLink, publicDoc } from '@/lib/public-links'
import { uploadResponse } from '@/lib/serve-upload'

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
  // Short cache: stopping sharing should take effect soon.
  return uploadResponse(fileId, 'public, max-age=300')
}
