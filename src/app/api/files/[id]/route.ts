import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getAuthUserId } from '@/lib/auth-helpers'
import { isInlineType } from '@/lib/upload-limits'

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

  const upload = await db.upload.findUnique({
    where: { id },
    select: { name: true, mimeType: true, size: true, parts: true, complete: true, data: true },
  })
  if (!upload || !upload.complete) {
    return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
  }

  const headers = {
    'Content-Type': upload.mimeType,
    'Content-Length': String(upload.size),
    // Images and PDFs open in the page; anything else (Word, Excel, DWG…) is downloaded.
    'Content-Disposition': `${isInlineType(upload.mimeType) ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(upload.name)}`,
    'X-Content-Type-Options': 'nosniff',
    // Uploads never change once stored, so the browser can keep them.
    'Cache-Control': 'private, max-age=31536000, immutable',
  }

  if (!upload.parts) return new Response(new Uint8Array(upload.data), { headers })

  // A big file is sent part by part, reading each one from the database as it goes.
  let next = 0
  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (next >= upload.parts) {
        controller.close()
        return
      }
      const part = await db.uploadPart.findUnique({ where: { uploadId_index: { uploadId: id, index: next } }, select: { data: true } })
      next++
      if (!part) {
        controller.error(new Error('Falta una parte del archivo'))
        return
      }
      controller.enqueue(new Uint8Array(part.data))
    },
  })
  return new Response(stream, { headers })
}
