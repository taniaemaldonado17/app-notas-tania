import type {
  Attachment,
  Card,
  ChecklistItem,
  Column,
  Page,
} from '@/lib/types'

const API_BASE = '/api'

async function jsonFetch<T>(
  url: string,
  options?: RequestInit
): Promise<T> {
  const headers: Record<string, string> = {
    ...(options?.body && !(options.body instanceof FormData)
      ? { 'Content-Type': 'application/json' }
      : {}),
    ...(options?.headers as Record<string, string> | undefined),
  }
  const res = await fetch(url, {
    ...options,
    headers,
    credentials: 'same-origin',
  })
  if (!res.ok) {
    let message = `Error ${res.status}`
    try {
      const body = await res.json()
      message = body?.error ?? message
    } catch {
      // ignore
    }
    throw new Error(message)
  }
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

/* ----------------------------- Pages ----------------------------- */

export async function fetchPage(pageId: string): Promise<Page> {
  const data = await jsonFetch<{ page: Page }>(`${API_BASE}/pages/${pageId}`)
  return data.page
}

export async function fetchPages(): Promise<
  {
    id: string
    title: string
    subtitle: string | null
    icon: string | null
    coverUrl: string | null
    createdAt: string
    updatedAt: string
  }[]
> {
  const data = await jsonFetch<{ pages: any[] }>(`${API_BASE}/pages`)
  return data.pages
}

export async function updatePage(
  pageId: string,
  payload: Partial<{
    title: string
    subtitle: string | null
    icon: string | null
    coverUrl: string | null
  }>
): Promise<Page> {
  const data = await jsonFetch<{ page: Page }>(
    `${API_BASE}/pages/${pageId}`,
    {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }
  )
  return data.page
}

/* ----------------------------- Columns ----------------------------- */

export async function createColumn(payload: {
  pageId: string
  title: string
  accentColor?: string | null
}): Promise<Column> {
  const data = await jsonFetch<{ column: Column }>(`${API_BASE}/columns`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
  return data.column
}

export async function updateColumn(
  columnId: string,
  payload: Partial<{
    title: string
    accentColor: string | null
    position: number
  }>
): Promise<Column> {
  const data = await jsonFetch<{ column: Column }>(
    `${API_BASE}/columns/${columnId}`,
    {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }
  )
  return data.column
}

export async function deleteColumn(columnId: string): Promise<void> {
  await jsonFetch(`${API_BASE}/columns/${columnId}`, { method: 'DELETE' })
}

export async function reorderColumns(
  pageId: string,
  moves: { id: string; position: number }[]
): Promise<void> {
  await jsonFetch(`${API_BASE}/columns/reorder`, {
    method: 'POST',
    body: JSON.stringify({ pageId, moves }),
  })
}

/* ----------------------------- Cards ----------------------------- */

export async function createCard(payload: {
  columnId: string
  title: string
  description?: string | null
  accentColor?: string | null
}): Promise<Card> {
  const data = await jsonFetch<{ card: Card }>(`${API_BASE}/cards`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
  return data.card
}

export async function updateCard(
  cardId: string,
  payload: Partial<{
    title: string
    description: string | null
    coverUrl: string | null
    accentColor: string | null
    icon: string | null
    position: number
    columnId: string
  }>
): Promise<Card> {
  const data = await jsonFetch<{ card: Card }>(
    `${API_BASE}/cards/${cardId}`,
    {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }
  )
  return data.card
}

export async function deleteCard(cardId: string): Promise<void> {
  await jsonFetch(`${API_BASE}/cards/${cardId}`, { method: 'DELETE' })
}

export async function reorderCards(
  moves: { id: string; columnId: string; position: number }[]
): Promise<void> {
  await jsonFetch(`${API_BASE}/cards/reorder`, {
    method: 'POST',
    body: JSON.stringify({ moves }),
  })
}

/* ----------------------------- Checklist ----------------------------- */

export async function addChecklistItem(
  cardId: string,
  text: string
): Promise<ChecklistItem> {
  const data = await jsonFetch<{ item: ChecklistItem }>(
    `${API_BASE}/cards/${cardId}/checklist`,
    {
      method: 'POST',
      body: JSON.stringify({ text }),
    }
  )
  return data.item
}

export async function updateChecklistItem(
  itemId: string,
  payload: Partial<{ text: string; checked: boolean; position: number }>
): Promise<ChecklistItem> {
  const data = await jsonFetch<{ item: ChecklistItem }>(
    `${API_BASE}/checklist/${itemId}`,
    {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }
  )
  return data.item
}

export async function deleteChecklistItem(itemId: string): Promise<void> {
  await jsonFetch(`${API_BASE}/checklist/${itemId}`, { method: 'DELETE' })
}

/* ----------------------------- Upload ----------------------------- */

export async function uploadImage(file: File): Promise<string> {
  const formData = new FormData()
  formData.append('file', file)
  const data = await jsonFetch<{ url: string }>(`${API_BASE}/upload`, {
    method: 'POST',
    body: formData,
  })
  return data.url
}

export async function uploadFile(
  file: File
): Promise<{ url: string; type: 'image' | 'pdf'; originalName: string }> {
  const formData = new FormData()
  formData.append('file', file)
  return jsonFetch(`${API_BASE}/upload`, {
    method: 'POST',
    body: formData,
  })
}

/* ----------------------------- Attachments ----------------------------- */

export async function addAttachment(
  cardId: string,
  payload: {
    type: Attachment['type']
    title: string
    url: string
    previewUrl?: string | null
  }
): Promise<Attachment> {
  const data = await jsonFetch<{ attachment: Attachment }>(
    `${API_BASE}/cards/${cardId}/attachments`,
    {
      method: 'POST',
      body: JSON.stringify(payload),
    }
  )
  return data.attachment
}

export async function updateAttachment(
  attachmentId: string,
  payload: Partial<Pick<Attachment, 'title' | 'url' | 'previewUrl'>>
): Promise<Attachment> {
  const data = await jsonFetch<{ attachment: Attachment }>(
    `${API_BASE}/attachments/${attachmentId}`,
    {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }
  )
  return data.attachment
}

export async function deleteAttachment(attachmentId: string): Promise<void> {
  await jsonFetch(`${API_BASE}/attachments/${attachmentId}`, {
    method: 'DELETE',
  })
}

/* ----------------------------- AI text ----------------------------- */

export type AiAction = 'review' | 'reformat' | 'explain' | 'edit'

export async function aiText(
  action: AiAction,
  text: string,
  instruction?: string
): Promise<string> {
  const data = await jsonFetch<{ result: string }>(`${API_BASE}/ai/text`, {
    method: 'POST',
    body: JSON.stringify({ action, text, instruction }),
  })
  return data.result
}

/* ----------------------------- Auth ----------------------------- */

export async function registerUser(payload: {
  email: string
  password: string
  name?: string
}): Promise<{ ok: boolean; userId: string }> {
  return jsonFetch(`${API_BASE}/auth/register`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}
