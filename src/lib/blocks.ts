/**
 * Card content, stored as a JSON string in `Card.description`.
 *
 * Current format (v2): `{"v":2,"blocks":[...]}` where `blocks` is a BlockNote
 * document (rich text, toggles, nested blocks, images, tables…).
 *
 * Older content is still readable:
 * - v1: a JSON array of flat `{ type, text, ... }` blocks → converted on load
 * - plain text → one paragraph per line
 */

// A BlockNote block. Kept loose on purpose: this module is also used by
// lightweight components (card previews) that must not pull in the editor.
export type DocBlock = Record<string, any>

type LegacyBlock = {
  type: string
  text?: string
  lang?: string
  url?: string
  checked?: boolean
}

function convertLegacyBlock(b: LegacyBlock): DocBlock | null {
  const text = typeof b.text === 'string' ? b.text : ''
  switch (b.type) {
    case 'h1':
    case 'h2':
    case 'h3':
    case 'h4':
      return { type: 'heading', props: { level: Number(b.type[1]) }, content: text }
    case 'list':
      return { type: 'bulletListItem', content: text }
    case 'todo':
      return { type: 'checkListItem', props: { checked: !!b.checked }, content: text }
    case 'code':
      return {
        type: 'codeBlock',
        props: { language: b.lang && b.lang !== 'plain' ? b.lang : 'text' },
        content: text,
      }
    case 'quote':
      return { type: 'quote', content: text }
    case 'page':
      return {
        type: 'paragraph',
        content: b.url
          ? [{ type: 'link', href: b.url, content: text || b.url }]
          : text,
      }
    case 'image':
      return b.url ? { type: 'image', props: { url: b.url, caption: text } } : null
    default:
      return { type: 'paragraph', content: text }
  }
}

/**
 * Parse a stored description into BlockNote blocks.
 * Returns an empty array when there is no content.
 */
export function parseDoc(raw: string | null | undefined): DocBlock[] {
  if (!raw || !raw.trim()) return []
  const trimmed = raw.trim()

  if (trimmed.startsWith('{')) {
    try {
      const obj = JSON.parse(trimmed)
      if (obj && obj.v === 2 && Array.isArray(obj.blocks)) return obj.blocks
    } catch {
      // fall through to plain text
    }
  }

  if (trimmed.startsWith('[')) {
    try {
      const arr = JSON.parse(trimmed)
      if (Array.isArray(arr)) {
        return arr
          .filter((x) => x && typeof x === 'object' && typeof x.type === 'string')
          .map((x) => convertLegacyBlock(x as LegacyBlock))
          .filter((x): x is DocBlock => x !== null)
      }
    } catch {
      // fall through to plain text
    }
  }

  return raw
    .split(/\r?\n/)
    .map((line) => ({ type: 'paragraph', content: line }))
}

/** Plain text of a block's own inline content (not its children). */
function inlineText(content: unknown): string {
  if (!content) return ''
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content
      .map((node) => {
        if (!node || typeof node !== 'object') return ''
        const n = node as DocBlock
        if (typeof n.text === 'string') return n.text
        if (n.content) return inlineText(n.content)
        return ''
      })
      .join('')
  }
  if (typeof content === 'object') {
    // Table content: { type: 'tableContent', rows: [{ cells: [...] }] }
    const rows = (content as DocBlock).rows
    if (Array.isArray(rows)) {
      return rows
        .map((r: DocBlock) =>
          (Array.isArray(r.cells) ? r.cells : [])
            .map((c: unknown) => inlineText((c as DocBlock)?.content ?? c))
            .join(' ')
        )
        .join(' ')
    }
  }
  return ''
}

function blockHasContent(b: DocBlock): boolean {
  if (inlineText(b.content).trim()) return true
  if (b.props?.url) return true
  if (b.type && !['paragraph', 'heading', 'quote', 'bulletListItem', 'numberedListItem', 'checkListItem', 'toggleListItem', 'codeBlock', 'image', 'file', 'video', 'audio'].includes(b.type)) {
    // Dividers, tables, etc. count as content by themselves.
    return true
  }
  return Array.isArray(b.children) && b.children.some(blockHasContent)
}

/**
 * Serialise BlockNote blocks for `Card.description`.
 * Returns null when the document has no meaningful content.
 */
export function serializeDoc(blocks: DocBlock[] | null | undefined): string | null {
  if (!blocks || blocks.length === 0) return null
  if (!blocks.some(blockHasContent)) return null
  return JSON.stringify({ v: 2, blocks })
}

/** Short one-line preview of a stored description (for card thumbnails). */
export function docPreview(raw: string | null | undefined): string {
  const blocks = parseDoc(raw)
  const walk = (list: DocBlock[]): string => {
    for (const b of list) {
      const text = inlineText(b.content).trim()
      if (text) return text
      if (b.type === 'image' && b.props?.url) return '[Imagen]'
      if (Array.isArray(b.children)) {
        const inner = walk(b.children)
        if (inner) return inner
      }
    }
    return ''
  }
  return walk(blocks).slice(0, 60)
}
