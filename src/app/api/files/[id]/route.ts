import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getAuthUserId } from '@/lib/auth-helpers'

/**
 * Serves an uploaded file to any signed-in user. File ids are random and
 * only appear inside pages, so collaborators on a shared page can see each
 * other's images.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getAuthUserId()
  if (!userId) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }
  const { id } = await params

  const upload = await db.upload.findUnique({ where: { id } })
  if (!upload) {
    return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
  }

  return new Response(new Uint8Array(upload.data), {
    headers: {
      'Content-Type': upload.mimeType,
      'Content-Length': String(upload.size),
      'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(upload.name)}`,
      'X-Content-Type-Options': 'nosniff',
      // Uploads never change once stored, so the browser can keep them.
      'Cache-Control': 'private, max-age=31536000, immutable',
    },
  })
}
