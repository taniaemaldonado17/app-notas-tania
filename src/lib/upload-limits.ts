/**
 * Upload limits, shared by the browser and the server. Vercel accepts about
 * 4.5 MB per request, so bigger files travel in parts of PART_BYTES.
 */
export const PART_BYTES = 3 * 1024 * 1024
export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024
export const MAX_UPLOAD_LABEL = '50 MB'

/** Types the browser may show inside the page; anything else is downloaded. */
const INLINE = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/avif', 'application/pdf'])

/** Types that could run code if opened from our domain: stored as plain bytes. */
const ACTIVE = /^(text\/html|application\/xhtml|image\/svg|text\/xml|application\/xml|text\/javascript|application\/javascript|application\/x-javascript)/i

/** The type to store for an uploaded file. */
export function safeMimeType(type: string | null | undefined): string {
  const t = (type || '').trim().toLowerCase()
  if (!t || ACTIVE.test(t) || !/^[\w.+-]+\/[\w.+-]+$/.test(t)) return 'application/octet-stream'
  return t
}

export function isInlineType(type: string): boolean {
  return INLINE.has(type)
}

export function uploadKind(type: string): 'image' | 'pdf' | 'file' {
  if (type === 'application/pdf') return 'pdf'
  if (type.startsWith('image/') && INLINE.has(type)) return 'image'
  return 'file'
}

export function tooBigMessage(): string {
  return `El archivo supera el máximo de ${MAX_UPLOAD_LABEL}. Para archivos más grandes, subilo a Drive y pegá el enlace.`
}
