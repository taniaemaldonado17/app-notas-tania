import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { canAccessPage, getAuthUserId } from '@/lib/auth-helpers'
import { findUsableInvite } from '@/lib/invites'

/** Signed-in user joins the page of an invitation link (single use). */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const userId = await getAuthUserId()
  if (!userId) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }
  const { token } = await params

  const invite = await findUsableInvite(token)
  if (!invite) {
    return NextResponse.json(
      { error: 'La invitación no es válida, ya se usó o venció' },
      { status: 410 }
    )
  }

  // Already has access (e.g. the owner opened their own link): don't spend it.
  if (await canAccessPage(userId, invite.pageId)) {
    return NextResponse.json({ pageId: invite.pageId })
  }

  try {
    await db.$transaction(async (tx) => {
      // Claim the link; fails if someone used it in the meantime.
      const claimed = await tx.pageInvite.updateMany({
        where: { id: invite.id, usedAt: null },
        data: { usedAt: new Date(), usedById: userId },
      })
      if (claimed.count === 0) throw new Error('INVITE_USED')
      await tx.pageMember.create({
        data: { pageId: invite.pageId, userId },
      })
    })
  } catch (err) {
    if (err instanceof Error && err.message === 'INVITE_USED') {
      return NextResponse.json(
        { error: 'La invitación ya se usó' },
        { status: 410 }
      )
    }
    console.error('[invite accept]', err)
    return NextResponse.json(
      { error: 'No se pudo aceptar la invitación' },
      { status: 500 }
    )
  }

  return NextResponse.json({ pageId: invite.pageId })
}
