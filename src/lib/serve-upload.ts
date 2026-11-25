import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { isInlineType } from '@/lib/upload-limits'

/**
 * Response with an uploaded file (no access check: callers check first).
 * Big files (stored in parts) are streamed part by part.
 */
export async function uploadResponse(id: string, cacheControl: string): Promise<Response> {
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
    'Cache-Control': cacheControl,
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
