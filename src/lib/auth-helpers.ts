import { getServerSession } from 'next-auth'
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
 * Verifies that the given pageId belongs to the authenticated user.
 * Returns true if ownership is verified, false otherwise.
 */
export async function verifyPageOwnership(
  userId: string,
  pageId: string
): Promise<boolean> {
  const page = await db.page.findUnique({
    where: { id: pageId },
    select: { userId: true },
  })
  return page?.userId === userId
}

/**
 * Verifies that the given columnId belongs to a page owned by the user.
 * Returns the column (with pageId) if verified, null otherwise.
 */
export async function verifyColumnOwnership(
  userId: string,
  columnId: string
): Promise<{ id: string; pageId: string } | null> {
  const column = await db.column.findUnique({
    where: { id: columnId },
    select: { id: true, pageId: true, page: { select: { userId: true } } },
  })
  if (!column || column.page.userId !== userId) return null
  return { id: column.id, pageId: column.pageId }
}

/**
 * Verifies that the given cardId belongs (through its column -> page) to the user.
 * Returns the card (with columnId) if verified, null otherwise.
 */
export async function verifyCardOwnership(
  userId: string,
  cardId: string
): Promise<{ id: string; columnId: string } | null> {
  const card = await db.card.findUnique({
    where: { id: cardId },
    select: {
      id: true,
      columnId: true,
      column: {
        select: {
          id: true,
          pageId: true,
          page: { select: { userId: true } },
        },
      },
    },
  })
  if (!card || card.column.page.userId !== userId) return null
  return { id: card.id, columnId: card.columnId }
}
