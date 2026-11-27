import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getAuthUserId, isPageOwner } from '@/lib/auth-helpers'
import { esAdmin } from '@/lib/admins'

/**
 * Public: what an invitation link is for (shown before signing in).
 * Only reveals the page title and who invited.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params
  const invite = await db.pageInvite.findUnique({
    where: { token },
    select: {
      usedAt: true,
      expiresAt: true,
      createdById: true,
      page: { select: { title: true, icon: true } },
      createdBy: { select: { name: true, email: true } },
    },
  })

  if (!invite || !(await esAdmin(invite.createdById))) {
    return NextResponse.json({ valid: false, reason: 'not_found' })
  }
  if (invite.usedAt) {
    return NextResponse.json({ valid: false, reason: 'used' })
  }
  if (invite.expiresAt < new Date()) {
    return NextResponse.json({ valid: false, reason: 'expired' })
  }

  return NextResponse.json({
    valid: true,
    pageTitle: invite.page.title,
    pageIcon: invite.page.icon,
    invitedBy: invite.createdBy.name || invite.createdBy.email,
  })
}

/** Owner cancels a pending invitation link. */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const userId = await getAuthUserId()
  if (!userId) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }
  const { token } = await params

  const invite = await db.pageInvite.findUnique({
    where: { token },
    select: { id: true, pageId: true },
  })
  if (!invite || !(await isPageOwner(userId, invite.pageId))) {
    return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
  }

  await db.pageInvite.delete({ where: { id: invite.id } })
  return NextResponse.json({ ok: true })
}
