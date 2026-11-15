import { getServerSession } from 'next-auth'
import type { Prisma } from '@prisma/client'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'

/**
 * Returns the authenticated user's id (or null) for the current request.
 */
export async function getAuthUserId(): Promise<string | null> {
  const session = await getServerSession(authOptions)
  const id = (session?.user as { id?: string } | undefined)?.id
  return id ?? null
}

/**
 * Returns the authenticated user record (or null).
 */
export async function getAuthUser() {
  const id = await getAuthUserId()
  if (!id) return null
  return db.user.findUnique({ where: { id } })
}

/**
 * Prisma filter for pages the user can open and edit:
 * pages they own plus pages shared with them.
 */
export function accessiblePageWhere(userId: string): Prisma.PageWhereInput {
  return {
    OR: [{ userId }, { members: { some: { userId } } }],
  }
}

/** True if the user owns the page or is a member of it. */
export async function canAccessPage(userId: string, pageId: string): Promise<boolean> {
  const page = await db.page.findFirst({
    where: { id: pageId, ...accessiblePageWhere(userId) },
    select: { id: true },
  })
  return !!page
}

/** True if every page id is accessible to the user. */
export async function canAccessPages(userId: string, pageIds: string[]): Promise<boolean> {
  const unique = Array.from(new Set(pageIds))
  if (unique.length === 0) return true
  const count = await db.page.count({
    where: { id: { in: unique }, ...accessiblePageWhere(userId) },
  })
  return count === unique.length
}

/** True only for the page's owner (delete page, manage sharing). */
export async function isPageOwner(userId: string, pageId: string): Promise<boolean> {
  const page = await db.page.findUnique({
    where: { id: pageId },
    select: { userId: true },
  })
  return page?.userId === userId
}

/**
 * Verifies that the user can edit the given page (owner or member).
 * Name kept for existing callers.
 */
export async function verifyPageOwnership(
  userId: string,
  pageId: string
): Promise<boolean> {
  return canAccessPage(userId, pageId)
}

/**
 * Verifies that the given columnId belongs to a page the user can edit.
 * Returns the column (with pageId) if verified, null otherwise.
 */
export async function verifyColumnOwnership(
  userId: string,
  columnId: string
): Promise<{ id: string; pageId: string } | null> {
  const column = await db.column.findFirst({
    where: { id: columnId, page: accessiblePageWhere(userId) },
    select: { id: true, pageId: true },
  })
  return column
}

/**
 * Verifies that the given cardId belongs to a page the user can edit.
 * Returns the card (with columnId and pageId) if verified, null otherwise.
 */
export async function verifyCardOwnership(
  userId: string,
  cardId: string
): Promise<{ id: string; columnId: string; pageId: string } | null> {
  const card = await db.card.findFirst({
    where: { id: cardId, column: { page: accessiblePageWhere(userId) } },
    select: { id: true, columnId: true, column: { select: { pageId: true } } },
  })
  if (!card) return null
  return { id: card.id, columnId: card.columnId, pageId: card.column.pageId }
}
