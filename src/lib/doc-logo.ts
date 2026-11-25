/**
 * Page logo: an image shown above a document's title (row, card or sub-page),
 * like a letterhead. Also printed at the top of the PDF and of shared links.
 */

/**
 * Value for a PATCH body's `logoUrl`: undefined = not sent, null = remove.
 * Only uploaded files (/api/files/…) or https images are accepted.
 */
export function logoUrlFromBody(v: unknown): string | null | undefined {
  if (v === undefined) return undefined
  if (v === null || v === '') return null
  if (typeof v !== 'string' || v.length > 2000) return undefined
  return /^\/api\/files\/[A-Za-z0-9_-]+$/.test(v) || /^https:\/\//.test(v) ? v : undefined
}
