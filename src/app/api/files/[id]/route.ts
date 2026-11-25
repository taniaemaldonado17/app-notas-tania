import { NextResponse } from 'next/server'
import { getAuthUserId } from '@/lib/auth-helpers'
import { uploadResponse } from '@/lib/serve-upload'

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
  // Uploads never change once stored, so the browser can keep them.
  return uploadResponse(id, 'private, max-age=31536000, immutable')
}
