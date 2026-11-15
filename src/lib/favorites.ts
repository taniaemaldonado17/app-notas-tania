import { db } from '@/lib/db'

/**
 * Favourites used to be a flag on pages and cards. They are now stored per
 * user in the Favorite table. This moves any old flags of the user's own
 * pages and cards into that table, once. Cheap when there is nothing to move.
 */
export async function migrateLegacyFavorites(userId: string): Promise<void> {
  const [pages, cards] = await Promise.all([
    db.page.findMany({ where: { userId, favorite: true }, select: { id: true } }),
    db.card.findMany({
      where: { favorite: true, column: { page: { userId } } },
      select: { id: true },
    }),
  ])
  if (pages.length === 0 && cards.length === 0) return

  await db.$transaction([
    db.favorite.createMany({
      data: [
        ...pages.map((p) => ({ userId, pageId: p.id })),
        ...cards.map((c) => ({ userId, cardId: c.id })),
      ],
      skipDuplicates: true,
    }),
    db.page.updateMany({
      where: { id: { in: pages.map((p) => p.id) } },
      data: { favorite: false },
    }),
    db.card.updateMany({
      where: { id: { in: cards.map((c) => c.id) } },
      data: { favorite: false },
    }),
  ])
}
