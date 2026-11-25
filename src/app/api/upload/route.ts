import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getAuthUserId } from '@/lib/auth-helpers'
import { MAX_UPLOAD_BYTES, PART_BYTES, safeMimeType, tooBigMessage, uploadKind } from '@/lib/upload-limits'

/**
 * Stores an uploaded file in the database and returns its URL. Files live in
 * the DB because the hosting filesystem is not persistent.
 *
 * - multipart form with `file` (up to PART_BYTES): the whole file at once.
 * - JSON { name, type, size } for a bigger file: creates it empty; the parts
 *   then go to /api/upload/<id>?part=<n> (see that route).
 */
export async function POST(req: Request) {
  const userId = await getAuthUserId()
  if (!userId) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  try {
    if ((req.headers.get('content-type') ?? '').includes('application/json')) {
      const body = await req.json().catch(() => ({}))
      const size = Number(body?.size)
      if (!Number.isFinite(size) || size <= 0) return NextResponse.json({ error: 'Falta el tamaño del archivo' }, { status: 400 })
      if (size > MAX_UPLOAD_BYTES) return NextResponse.json({ error: tooBigMessage() }, { status: 413 })
      const mimeType = safeMimeType(body?.type)
      const upload = await db.upload.create({
        data: {
          name: String(body?.name || 'archivo').slice(0, 255),
          mimeType,
          size,
          data: Buffer.alloc(0),
          parts: Math.ceil(size / PART_BYTES),
          complete: false,
          userId,
        },
        select: { id: true, parts: true },
      })
      return NextResponse.json({ id: upload.id, parts: upload.parts, partBytes: PART_BYTES })
    }

    const form = await req.formData()
    const file = form.get('file')
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'Falta el archivo' }, { status: 400 })
    }
    if (file.size > PART_BYTES + 1024 * 1024) {
      return NextResponse.json({ error: tooBigMessage() }, { status: 413 })
    }

    const mimeType = safeMimeType(file.type)
    const data = Buffer.from(await file.arrayBuffer())
    const upload = await db.upload.create({
      data: {
        name: (file.name || 'archivo').slice(0, 255),
        mimeType,
        size: file.size,
        data,
        userId,
      },
      select: { id: true },
    })

    return NextResponse.json({
      url: `/api/files/${upload.id}`,
      type: uploadKind(mimeType),
      originalName: file.name,
    })
  } catch (err) {
    console.error('[upload POST]', err)
    return NextResponse.json(
      { error: 'No se pudo subir el archivo' },
      { status: 500 }
    )
  }
}
