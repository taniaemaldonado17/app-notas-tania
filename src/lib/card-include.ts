import type { Prisma } from '@prisma/client'

/** Relations returned with every card (keep API responses consistent). */
export const cardInclude = {
  checklist: { orderBy: { position: 'asc' } },
  attachments: { orderBy: { position: 'asc' } },
  comments: {
    orderBy: { createdAt: 'asc' },
    include: { user: { select: { name: true, email: true } } },
  },
} satisfies Prisma.CardInclude
