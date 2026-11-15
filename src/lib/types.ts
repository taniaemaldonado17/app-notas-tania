export type ChecklistItem = {
  id: string
  text: string
  checked: boolean
  position: number
}

export type Attachment = {
  id: string
  type: 'pdf' | 'drive' | 'figma' | 'link' | 'file'
  title: string
  url: string
  previewUrl: string | null
  position: number
  createdAt: string
}

export type CardComment = {
  id: string
  text: string
  createdAt: string
  user: { name: string | null; email: string }
}

export type Card = {
  id: string
  title: string
  description: string | null
  coverUrl: string | null
  accentColor: string | null
  icon: string | null
  favorite?: boolean
  position: number
  columnId: string
  checklist: ChecklistItem[]
  attachments: Attachment[]
  comments: CardComment[]
  createdAt: string
  updatedAt: string
}

export type Column = {
  id: string
  title: string
  position: number
  accentColor: string | null
  pageId: string
  cards: Card[]
  createdAt: string
  updatedAt: string
}

export type Page = {
  id: string
  title: string
  subtitle: string | null
  icon: string | null
  coverUrl: string | null
  favorite?: boolean
  userId: string
  columns: Column[]
  createdAt: string
  updatedAt: string
}

/** Page as listed in the sidebar (no columns). */
export type PageSummary = {
  id: string
  title: string
  subtitle: string | null
  icon: string | null
  coverUrl: string | null
  favorite: boolean
  /** 'owner' created the page; 'member' was invited to it. */
  role: 'owner' | 'member'
  ownerName: string
  memberCount: number
  createdAt: string
  updatedAt: string
}

export type SharePerson = {
  id: string
  name: string | null
  email: string
}

export type ShareInfo = {
  isOwner: boolean
  owner: SharePerson
  members: (SharePerson & { joinedAt: string })[]
  invites: { token: string; createdAt: string; expiresAt: string }[]
}

export type InviteInfo =
  | { valid: true; pageTitle: string; pageIcon: string | null; invitedBy: string }
  | { valid: false; reason: 'not_found' | 'used' | 'expired' }

export type FavoriteCard = {
  id: string
  title: string
  icon: string | null
  pageId: string
}

export type SearchResult = {
  id: string
  title: string
  description: string | null
  columnId: string
  columnTitle: string
  pageId: string
  pageTitle: string
}

export type User = {
  id?: string
  name?: string | null
  email?: string | null
  image?: string | null
}
