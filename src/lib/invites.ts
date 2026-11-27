import { randomBytes } from 'node:crypto'
import { db } from '@/lib/db'
import { esAdmin } from '@/lib/admins'

export const INVITE_DAYS = 7

export function newInviteToken(): string {
  return randomBytes(24).toString('base64url')
}

/** Returns the invite if it can still be used, otherwise null. */
export async function findUsableInvite(token: string) {
  if (!token || token.length > 100) return null
  const invite = await db.pageInvite.findUnique({
    where: { token },
    select: { id: true, pageId: true, usedAt: true, expiresAt: true, createdById: true },
  })
  if (!invite || invite.usedAt || invite.expiresAt < new Date()) return null
  // Only links made by an admin let people in (so nobody else can bring
  // new people into the app, not even with links made before this rule).
  if (!(await esAdmin(invite.createdById))) return null
  return invite
}
