import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getAuthUserId } from '@/lib/auth-helpers'

// Vercel rejects request bodies above ~4.5 MB, so stay under that.
const MAX_BYTES = 4 * 1024 * 1024

const ALLOWED_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'image/avif',
  'application/pdf',
])

/**
 * Stores an uploaded image or PDF in the database and returns its URL.
 * Files live in the DB because the hosting filesystem is not persistent.
 */
export async function POST(req: Request) {
  const userId = await getAuthUserId()
  if (!userId) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  try {
    const form = await req.formData()
    const file = form.get('file')
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'Falta el archivo' }, { status: 400 })
    }
    if (!ALLOWED_TYPES.has(file.type)) {
      return NextResponse.json(
        { error: 'Solo se pueden subir imágenes (PNG, JPG, GIF, WebP) o PDF' },
        { status: 400 }
      )
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        { error: 'El archivo supera el máximo de 4 MB' },
        { status: 413 }
      )
    }

    const data = Buffer.from(await file.arrayBuffer())
    const upload = await db.upload.create({
      data: {
        name: file.name || 'archivo',
        mimeType: file.type,
        size: file.size,
        data,
        userId,
      },
      select: { id: true },
    })

    return NextResponse.json({
      url: `/api/files/${upload.id}`,
      type: file.type === 'application/pdf' ? 'pdf' : 'image',
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
