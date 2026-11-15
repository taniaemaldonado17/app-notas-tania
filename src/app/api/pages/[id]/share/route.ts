import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { canAccessPage, getAuthUserId, isPageOwner } from '@/lib/auth-helpers'
import { INVITE_DAYS, newInviteToken } from '@/lib/invites'

/**
 * Who has access to the page. Pending invitation links are only returned
 * to the owner.
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

  if (!(await canAccessPage(userId, id))) {
    return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
  }

  const page = await db.page.findUnique({
    where: { id },
    select: {
      userId: true,
      user: { select: { id: true, name: true, email: true } },
      members: {
        orderBy: { createdAt: 'asc' },
        select: {
          createdAt: true,
          user: { select: { id: true, name: true, email: true } },
        },
      },
    },
  })
  if (!page) {
    return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
  }

  const isOwner = page.userId === userId
  const invites = isOwner
    ? await db.pageInvite.findMany({
        where: { pageId: id, usedAt: null, expiresAt: { gt: new Date() } },
        orderBy: { createdAt: 'desc' },
        select: { token: true, createdAt: true, expiresAt: true },
      })
    : []

  return NextResponse.json({
    isOwner,
    owner: page.user,
    members: page.members.map((m) => ({ ...m.user, joinedAt: m.createdAt })),
    invites,
  })
}

/** Owner creates a single-use invitation link. */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getAuthUserId()
  if (!userId) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }
  const { id } = await params

  if (!(await isPageOwner(userId, id))) {
    return NextResponse.json(
      { error: 'Solo quien creó la página puede invitar' },
      { status: 403 }
    )
  }

  const invite = await db.pageInvite.create({
    data: {
      token: newInviteToken(),
      pageId: id,
      createdById: userId,
      expiresAt: new Date(Date.now() + INVITE_DAYS * 24 * 60 * 60 * 1000),
    },
    select: { token: true, createdAt: true, expiresAt: true },
  })
  return NextResponse.json({ invite })
}
