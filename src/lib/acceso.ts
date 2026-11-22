import { db } from '@/lib/db'

/** Removes someone's access to a page; returns false if they didn't have it. */
export async function quitarAcceso(pageId: string, userId: string): Promise<boolean> {
  const removed = await db.pageMember.deleteMany({ where: { pageId, userId } })
  if (removed.count === 0) return false
  // Their personal favourites of this page and its cards no longer apply.
  await db.favorite.deleteMany({
    where: { userId, OR: [{ pageId }, { card: { column: { pageId } } }] },
  })
  return true
}
