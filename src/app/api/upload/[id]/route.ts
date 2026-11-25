import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getAuthUserId } from '@/lib/auth-helpers'
import { PART_BYTES, uploadKind } from '@/lib/upload-limits'

/**
 * One part of a big upload (raw bytes in the body): PUT /api/upload/<id>?part=<n>.
 * When the last missing part arrives the file is marked complete and the
 * answer carries its URL.
 */
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getAuthUserId()
  if (!userId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const { id } = await params
  const index = Number(new URL(req.url).searchParams.get('part'))

  const upload = await db.upload.findFirst({ where: { id, userId }, select: { id: true, name: true, mimeType: true, size: true, parts: true, complete: true } })
  if (!upload) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
  if (upload.complete) return NextResponse.json({ error: 'El archivo ya está completo' }, { status: 409 })
  if (!Number.isInteger(index) || index < 0 || index >= upload.parts) return NextResponse.json({ error: 'Parte inválida' }, { status: 400 })

  try {
    const data = Buffer.from(await req.arrayBuffer())
    const expected = index === upload.parts - 1 ? upload.size - PART_BYTES * (upload.parts - 1) : PART_BYTES
    if (data.length !== expected) return NextResponse.json({ error: 'La parte llegó incompleta' }, { status: 400 })

    await db.uploadPart.upsert({
      where: { uploadId_index: { uploadId: id, index } },
      create: { uploadId: id, index, data },
      update: { data },
    })
    const have = await db.uploadPart.count({ where: { uploadId: id } })
    if (have < upload.parts) return NextResponse.json({ ok: true, done: false })

    await db.upload.update({ where: { id }, data: { complete: true } })
    return NextResponse.json({
      ok: true,
      done: true,
      url: `/api/files/${id}`,
      type: uploadKind(upload.mimeType),
      originalName: upload.name,
    })
  } catch (err) {
    console.error('[upload PUT part]', err)
    return NextResponse.json({ error: 'No se pudo subir el archivo' }, { status: 500 })
  }
}
