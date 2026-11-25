import type {
  Attachment,
  Card,
  CardComment,
  ChecklistItem,
  Column,
  FavoriteCard,
  InviteInfo,
  Page,
  PageSummary,
  SearchResult,
  ShareInfo,
} from '@/lib/types'
import type { DatabaseDef, DbRow, PageLayout, PropertyDef, RowValue, ViewDef } from '@/lib/db-types'

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
  let res: Response
  try {
    res = await fetch(url, {
      ...options,
      headers,
      credentials: 'same-origin',
    })
  } catch {
    throw new Error('Sin conexión: esto necesita internet. Probá de nuevo cuando haya señal.')
  }
  if (res.status === 503 && res.headers.get('x-sin-conexion')) {
    throw new Error('Sin conexión: esto necesita internet. Probá de nuevo cuando haya señal.')
  }
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

export async function fetchPages(): Promise<PageSummary[]> {
  const data = await jsonFetch<{ pages: PageSummary[] }>(`${API_BASE}/pages`)
  return data.pages
}

export async function createPage(payload: {
  title: string
  icon?: string | null
  kind?: 'board' | 'databases'
  template?: 'arquitectura'
  examples?: boolean
}): Promise<PageSummary> {
  const data = await jsonFetch<{ page: PageSummary }>(`${API_BASE}/pages`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
  return data.page
}

export async function deletePage(pageId: string): Promise<void> {
  await jsonFetch(`${API_BASE}/pages/${pageId}`, { method: 'DELETE' })
}

export async function setFavorite(
  target: { pageId: string } | { cardId: string },
  favorite: boolean
): Promise<void> {
  await jsonFetch(`${API_BASE}/favorites`, {
    method: 'POST',
    body: JSON.stringify({ ...target, favorite }),
  })
}

/* ----------------------------- Sharing ----------------------------- */

export async function fetchShare(pageId: string): Promise<ShareInfo> {
  return jsonFetch<ShareInfo>(`${API_BASE}/pages/${pageId}/share`)
}

export async function createInvite(
  pageId: string
): Promise<ShareInfo['invites'][number]> {
  const data = await jsonFetch<{ invite: ShareInfo['invites'][number] }>(
    `${API_BASE}/pages/${pageId}/share`,
    { method: 'POST' }
  )
  return data.invite
}

export async function revokeInvite(token: string): Promise<void> {
  await jsonFetch(`${API_BASE}/invites/${encodeURIComponent(token)}`, {
    method: 'DELETE',
  })
}

/** Remove a member; pass 'me' to leave a page shared with you. */
export async function removeMember(pageId: string, userId: string): Promise<void> {
  await jsonFetch(`${API_BASE}/pages/${pageId}/members/${encodeURIComponent(userId)}`, {
    method: 'DELETE',
  })
}

export async function fetchInvite(token: string): Promise<InviteInfo> {
  return jsonFetch<InviteInfo>(`${API_BASE}/invites/${encodeURIComponent(token)}`)
}

export async function acceptInvite(token: string): Promise<{ pageId: string }> {
  return jsonFetch(`${API_BASE}/invites/${encodeURIComponent(token)}/accept`, {
    method: 'POST',
  })
}

export function inviteUrl(token: string): string {
  return `${window.location.origin}/invite/${token}`
}

export async function fetchFavoriteCards(): Promise<FavoriteCard[]> {
  const data = await jsonFetch<{ cards: FavoriteCard[] }>(`${API_BASE}/favorites`)
  return data.cards
}

export async function searchCards(q: string): Promise<SearchResult[]> {
  const data = await jsonFetch<{ results: SearchResult[] }>(
    `${API_BASE}/search?q=${encodeURIComponent(q)}`
  )
  return data.results
}

export async function updatePage(
  pageId: string,
  payload: Partial<{
    title: string
    subtitle: string | null
    icon: string | null
    coverUrl: string | null
    layout: PageLayout
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
    logoUrl: string | null
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
  return (await uploadFile(file)).url
}

export type UploadResult = { url: string; type: 'image' | 'pdf' | 'file'; originalName: string }

/**
 * Uploads any file (up to MAX_UPLOAD_BYTES). Small files go in one request;
 * bigger ones in parts, because Vercel only accepts ~4.5 MB per request.
 */
export async function uploadFile(file: File, onProgress?: (fraction: number) => void): Promise<UploadResult> {
  const { MAX_UPLOAD_BYTES, PART_BYTES, tooBigMessage } = await import('@/lib/upload-limits')
  if (file.size > MAX_UPLOAD_BYTES) throw new Error(tooBigMessage())
  if (file.size <= PART_BYTES) {
    const formData = new FormData()
    formData.append('file', file)
    const res = await jsonFetch<UploadResult>(`${API_BASE}/upload`, { method: 'POST', body: formData })
    onProgress?.(1)
    return res
  }
  const start = await jsonFetch<{ id: string; parts: number; partBytes: number }>(`${API_BASE}/upload`, {
    method: 'POST',
    body: JSON.stringify({ name: file.name, type: file.type, size: file.size }),
  })
  let result: (UploadResult & { done?: boolean }) | null = null
  for (let i = 0; i < start.parts; i++) {
    const piece = file.slice(i * start.partBytes, (i + 1) * start.partBytes)
    let lastError: unknown
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        result = await jsonFetch<UploadResult & { done?: boolean }>(`${API_BASE}/upload/${start.id}?part=${i}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/octet-stream' },
          body: piece,
        })
        lastError = null
        break
      } catch (err) {
        lastError = err
      }
    }
    if (lastError) throw lastError
    onProgress?.((i + 1) / start.parts)
  }
  if (!result?.done) throw new Error('No se pudo terminar de subir el archivo')
  return { url: result.url, type: result.type, originalName: result.originalName }
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

/* ----------------------------- Comments ----------------------------- */

export async function addComment(
  cardId: string,
  text: string
): Promise<CardComment> {
  const data = await jsonFetch<{ comment: CardComment }>(
    `${API_BASE}/cards/${cardId}/comments`,
    {
      method: 'POST',
      body: JSON.stringify({ text }),
    }
  )
  return data.comment
}

export async function deleteComment(commentId: string): Promise<void> {
  await jsonFetch(`${API_BASE}/comments/${commentId}`, { method: 'DELETE' })
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
  inviteToken?: string
}): Promise<{ ok: boolean; userId: string }> {
  return jsonFetch(`${API_BASE}/auth/register`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

/* ----------------------------- Databases ----------------------------- */

export async function createDatabase(pageId: string, title?: string): Promise<DatabaseDef> {
  const data = await jsonFetch<{ database: DatabaseDef }>(`${API_BASE}/databases`, {
    method: 'POST',
    body: JSON.stringify({ pageId, title }),
  })
  return data.database
}

export async function updateDatabase(
  databaseId: string,
  payload: Partial<{ title: string; icon: string | null; properties: PropertyDef[]; views: ViewDef[]; position: number }>
): Promise<void> {
  await jsonFetch(`${API_BASE}/databases/${databaseId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  })
}

export type ImportPayload = {
  properties: PropertyDef[]
  rows: { title: string; values: Record<string, RowValue> }[]
} & ({ pageId: string; title: string; icon?: string | null } | { databaseId: string; addToViews?: string[] })

/** Creates a database from an imported table, or appends rows to one. */
export async function importDatabase(payload: ImportPayload): Promise<{ database: DatabaseDef; imported: number }> {
  return jsonFetch<{ database: DatabaseDef; imported: number }>(`${API_BASE}/databases/import`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export async function deleteDatabase(databaseId: string): Promise<void> {
  await jsonFetch(`${API_BASE}/databases/${databaseId}`, { method: 'DELETE' })
}

export async function createRow(
  databaseId: string,
  payload: { title?: string; icon?: string | null; values?: Record<string, RowValue>; position?: number }
): Promise<DbRow> {
  const data = await jsonFetch<{ row: DbRow }>(`${API_BASE}/databases/${databaseId}/rows`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
  return data.row
}

export async function updateRow(
  rowId: string,
  payload: Partial<{ title: string; icon: string | null; values: Record<string, RowValue>; content: string | null; position: number }>
): Promise<DbRow> {
  const data = await jsonFetch<{ row: DbRow }>(`${API_BASE}/rows/${rowId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  })
  return data.row
}

export async function deleteRow(rowId: string): Promise<void> {
  await jsonFetch(`${API_BASE}/rows/${rowId}`, { method: 'DELETE' })
}

/** Current stored content of a card (to pick up other people's edits). */
export async function fetchCardDescription(cardId: string): Promise<string | null> {
  const data = await jsonFetch<{ description: string | null }>(`${API_BASE}/cards/${cardId}`)
  return data.description
}

/**
 * Saves a card's or row's content, saying which stored version was edited
 * (`baseHash`). If someone else saved in between, returns their version.
 */
export async function saveDocContent(
  kind: 'card' | 'row' | 'subpage',
  id: string,
  content: string | null,
  baseHash: string
): Promise<{ ok: true } | { conflict: string | null }> {
  const url = kind === 'card' ? `${API_BASE}/cards/${id}` : kind === 'row' ? `${API_BASE}/rows/${id}` : `${API_BASE}/subpages/${id}`
  const field = kind === 'card' ? 'description' : 'content'
  const res = await fetch(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({ [field]: content, baseHash }),
  })
  if (res.status === 409) {
    const body = await res.json().catch(() => ({}))
    return { conflict: typeof body?.current === 'string' ? body.current : null }
  }
  if (!res.ok) throw new Error(`Error ${res.status}`)
  return { ok: true }
}

export async function fetchRowDetail(
  rowId: string
): Promise<{ row: DbRow; pageId: string; content: string | null; logoUrl: string | null; comments: CardComment[] }> {
  return jsonFetch(`${API_BASE}/rows/${rowId}`)
}

export async function addRowComment(rowId: string, text: string): Promise<CardComment> {
  const data = await jsonFetch<{ comment: CardComment }>(`${API_BASE}/rows/${rowId}/comments`, {
    method: 'POST',
    body: JSON.stringify({ text }),
  })
  return data.comment
}
/* ------------------------------ Calendar feed ----------------------------- */

/** Path of the user's subscribable .ics feed (created on first call). */
export async function getCalendarFeed(): Promise<{ path: string }> {
  return jsonFetch(`${API_BASE}/calendar`)
}

/** New secret link; the previous one stops working. */
export async function resetCalendarFeed(): Promise<{ path: string }> {
  return jsonFetch(`${API_BASE}/calendar`, { method: 'POST' })
}

/* -------------------------------- Sub-pages -------------------------------- */

export async function createSubPage(input: {
  parent: import('@/lib/subpages').DocRef
  title?: string
  icon?: string | null
  content?: string | null
}): Promise<{ id: string; title: string; icon: string | null }> {
  const data = await jsonFetch<{ subpage: { id: string; title: string; icon: string | null } }>(`${API_BASE}/subpages`, {
    method: 'POST',
    body: JSON.stringify(input),
  })
  return data.subpage
}

export async function fetchSubPage(id: string): Promise<import('@/lib/subpages').SubPageInfo> {
  const data = await jsonFetch<{ subpage: import('@/lib/subpages').SubPageInfo }>(`${API_BASE}/subpages/${id}`)
  return data.subpage
}

export async function updateSubPageMeta(id: string, patch: { title?: string; icon?: string | null; logoUrl?: string | null }): Promise<void> {
  await jsonFetch(`${API_BASE}/subpages/${id}`, { method: 'PATCH', body: JSON.stringify(patch) })
}

/* ---------------------------- Claude connector ---------------------------- */

export async function getClaudeConnector(): Promise<{ connected: boolean; createdAt: string | null }> {
  return jsonFetch(`${API_BASE}/claude-connector`)
}

/** New connector link (shown only once); the previous one stops working. */
export async function createClaudeConnector(): Promise<{ url: string; createdAt: string }> {
  return jsonFetch(`${API_BASE}/claude-connector`, { method: 'POST' })
}

export async function deleteClaudeConnector(): Promise<void> {
  await jsonFetch(`${API_BASE}/claude-connector`, { method: 'DELETE' })
}

/* ---------------------------- Version history ---------------------------- */

export type VersionInfo = { id: string; createdAt: string; editedBy: string | null }

export async function fetchVersions(pageId: string): Promise<VersionInfo[]> {
  const data = await jsonFetch<{ versions: VersionInfo[] }>(`${API_BASE}/pages/${pageId}/versions`)
  return data.versions
}

export async function fetchVersion(
  pageId: string,
  versionId: string
): Promise<{ version: import('@/lib/versions').PageSnapshot; current: import('@/lib/versions').PageSnapshot | null }> {
  return jsonFetch(`${API_BASE}/pages/${pageId}/versions/${versionId}`)
}

/** Restores a whole version, or only some rows/cards of it. */
export async function restoreVersion(
  pageId: string,
  versionId: string,
  only?: { rowIds?: string[]; cardIds?: string[] }
): Promise<{ restored: number; skipped: number }> {
  return jsonFetch(`${API_BASE}/pages/${pageId}/versions/${versionId}`, {
    method: 'POST',
    body: JSON.stringify(only ?? {}),
  })
}

/* ----------------------------- Presupuestos de obra ----------------------------- */


export async function fetchRowPresupuesto(rowId: string) {
  const data = await jsonFetch<{ presupuesto: import('@/lib/presupuesto/types').PresupuestoResumen | null }>(
    `${API_BASE}/rows/${rowId}/presupuesto`
  )
  return data.presupuesto
}

/** Imports a CyP (.xlsx, or the CyP app's .json); with rowId it's linked to that project. */
export async function importPresupuesto(rowId: string | null, file: File): Promise<{ id: string; avisos: string[] }> {
  const formData = new FormData()
  if (rowId) formData.append('rowId', rowId)
  formData.append('file', file)
  return jsonFetch(`${API_BASE}/presupuestos/import`, { method: 'POST', body: formData })
}

export async function fetchPresupuesto(id: string): Promise<import('@/lib/presupuesto/types').PresupuestoDetalle> {
  return jsonFetch(`${API_BASE}/presupuestos/${id}`)
}

export async function deletePresupuesto(id: string): Promise<void> {
  await jsonFetch(`${API_BASE}/presupuestos/${id}`, { method: 'DELETE' })
}

export async function fetchPresupuestoItem(id: string, itemId: string): Promise<import('@/lib/presupuesto/types').ItemDetalle> {
  return jsonFetch(`${API_BASE}/presupuestos/${id}/items/${itemId}`)
}

export async function fetchPresupuestoInsumos(id: string): Promise<import('@/lib/presupuesto/types').InsumoFila[]> {
  const data = await jsonFetch<{ insumos: import('@/lib/presupuesto/types').InsumoFila[] }>(`${API_BASE}/presupuestos/${id}/insumos`)
  return data.insumos
}

/** One edit to a budget; returns the created id (if any) and the new total. */
export async function editarPresupuesto(
  id: string,
  op: import('@/lib/presupuesto/editar').Operacion
): Promise<{ id?: string; total: number }> {
  return jsonFetch(`${API_BASE}/presupuestos/${id}/editar`, { method: 'POST', body: JSON.stringify(op) })
}

/* ----------------------------- Certificación de obra ----------------------------- */

export async function fetchCertificacion(presupuestoId: string): Promise<import('@/lib/certificacion/types').CertificacionData> {
  return jsonFetch(`${API_BASE}/presupuestos/${presupuestoId}/certificacion`)
}

/** One certification operation (contract, certificates, plan curve). */
export async function certificacionOp(
  presupuestoId: string,
  op: import('@/lib/certificacion/server').OperacionCert
): Promise<{ id?: string }> {
  return jsonFetch(`${API_BASE}/presupuestos/${presupuestoId}/certificacion`, { method: 'POST', body: JSON.stringify(op) })
}

export async function fetchCertificado(
  presupuestoId: string,
  certificadoId: string
): Promise<import('@/lib/certificacion/types').CertificadoDetalleData> {
  const data = await jsonFetch<{ certificado: import('@/lib/certificacion/types').CertificadoDetalleData }>(
    `${API_BASE}/presupuestos/${presupuestoId}/certificados/${certificadoId}`
  )
  return data.certificado
}

/* ----------------------------- Inicio y acceso ----------------------------- */

export type InicioPagina = {
  id: string
  title: string
  icon: string | null
  kind: 'board' | 'databases'
  propia: boolean
  ultimaActividad: string
  /** Who made the last change ("vos" for the current user), if known. */
  ultimoAutor: string | null
}

export type InicioActividad = {
  tipo: 'tarjeta' | 'fila'
  id: string
  titulo: string
  icono: string | null
  pageId: string
  pagina: string
  paginaIcono: string | null
  /** Column (cards) or database (rows). */
  lugar: string
  at: string
}

export async function fetchInicio(): Promise<{ paginas: InicioPagina[]; actividad: InicioActividad[] }> {
  return jsonFetch(`${API_BASE}/inicio`)
}

export type AccesoData = {
  paginas: { id: string; title: string; icon: string | null }[]
  personas: { id: string; name: string | null; email: string; paginas: string[]; cyp: boolean }[]
}

export async function fetchAcceso(): Promise<AccesoData> {
  return jsonFetch(`${API_BASE}/acceso`)
}

export async function cambiarAcceso(userId: string, pageId: string, acceso: boolean): Promise<void> {
  await jsonFetch(`${API_BASE}/acceso`, { method: 'POST', body: JSON.stringify({ userId, pageId, acceso }) })
}

/** Shares (or stops sharing) my whole "Cómputo y presupuesto" section with someone. */
export async function cambiarAccesoCyp(userId: string, acceso: boolean): Promise<void> {
  await jsonFetch(`${API_BASE}/acceso`, { method: 'POST', body: JSON.stringify({ userId, seccion: 'cyp', acceso }) })
}

/* ----------------------------- Sección Cómputo y presupuesto ----------------------------- */

export type CypResumen = {
  id: string
  nombre: string
  total: number
  tipoCambio: number | null
  rubros: number
  items: number
  updatedAt: string
  conContrato: boolean
  /** Who created it, when it was shared with me. */
  de: string | null
  proyecto: { rowId: string; titulo: string; icono: string | null; pageId: string; pagina: string } | null
}

export async function fetchPresupuestos(): Promise<CypResumen[]> {
  return (await jsonFetch<{ presupuestos: CypResumen[] }>(`${API_BASE}/presupuestos`)).presupuestos
}

export async function crearPresupuesto(nombre?: string): Promise<{ id: string }> {
  return jsonFetch(`${API_BASE}/presupuestos`, { method: 'POST', body: JSON.stringify({ nombre }) })
}

export async function duplicarPresupuesto(id: string): Promise<{ id: string }> {
  return jsonFetch(`${API_BASE}/presupuestos/${id}/duplicar`, { method: 'POST' })
}

export async function vincularPresupuesto(rowId: string, presupuestoId: string): Promise<void> {
  await jsonFetch(`${API_BASE}/rows/${rowId}/presupuesto`, { method: 'POST', body: JSON.stringify({ presupuestoId }) })
}

export async function desvincularPresupuesto(rowId: string): Promise<void> {
  await jsonFetch(`${API_BASE}/rows/${rowId}/presupuesto`, { method: 'DELETE' })
}

/** The CyP as an A4 portrait PDF. */
export function urlPdfPresupuesto(id: string) {
  return `${API_BASE}/presupuestos/${id}/pdf`
}

/** Download link in the CyP app's formats. */
export function urlExportarPresupuesto(id: string, formato: 'xlsx' | 'json') {
  return `${API_BASE}/presupuestos/${id}/exportar?formato=${formato}`
}

/* ------------------------- Public read-only links ------------------------- */

export type PublicLinkInfo = { token: string; url: string }

export async function fetchPublicLink(ref: import('@/lib/subpages').DocRef): Promise<PublicLinkInfo | null> {
  const q = new URLSearchParams({ kind: ref.kind, id: ref.id })
  return (await jsonFetch<{ link: PublicLinkInfo | null }>(`${API_BASE}/public-links?${q}`)).link
}

export async function createPublicLink(ref: import('@/lib/subpages').DocRef): Promise<PublicLinkInfo> {
  return (await jsonFetch<{ link: PublicLinkInfo }>(`${API_BASE}/public-links`, { method: 'POST', body: JSON.stringify(ref) })).link
}

export async function deletePublicLink(ref: import('@/lib/subpages').DocRef): Promise<void> {
  const q = new URLSearchParams({ kind: ref.kind, id: ref.id })
  await jsonFetch(`${API_BASE}/public-links?${q}`, { method: 'DELETE' })
}

/** Sets or removes (null) the logo shown above a row's title. */
export async function updateRowLogo(rowId: string, logoUrl: string | null): Promise<void> {
  await jsonFetch(`${API_BASE}/rows/${rowId}`, { method: 'PATCH', body: JSON.stringify({ logoUrl }) })
}
