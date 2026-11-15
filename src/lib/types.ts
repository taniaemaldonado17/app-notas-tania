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

export type Card = {
  id: string
  title: string
  description: string | null
  coverUrl: string | null
  accentColor: string | null
  icon: string | null
  position: number
  columnId: string
  checklist: ChecklistItem[]
  attachments: Attachment[]
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
  userId: string
  columns: Column[]
  createdAt: string
  updatedAt: string
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
