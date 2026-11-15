/**
 * Block-based content for cards.
 *
 * Blocks are stored as a JSON-encoded string in `Card.description`
 * so we don't need a DB migration. The schema is forward-compatible
 * with old plain-text/markdown descriptions: if parsing fails, the
 * text is treated as a single paragraph block.
 */

export type BlockType =
  | 'paragraph'
  | 'h1'
  | 'h2'
  | 'h3'
  | 'h4'
  | 'list'
  | 'code'
  | 'quote'
  | 'page'
  | 'todo'
  | 'image'

export type Block = {
  id: string
  type: BlockType
  text: string
  lang?: string // for code blocks
  url?: string // for page blocks (link) or image blocks (image src)
  checked?: boolean // for todo blocks
}

export type BlockMenuItem = {
  type: BlockType
  label: string
  hint: string
  keywords: string[]
  icon: string // lucide icon name (we render via mapping)
}

export const BLOCK_MENU_ITEMS: BlockMenuItem[] = [
  { type: 'h1', label: 'Encabezado 1', hint: 'Título grande', keywords: ['h1', 'heading', 'titulo', 'encabezado'], icon: 'Heading1' },
  { type: 'h2', label: 'Encabezado 2', hint: 'Sub-título', keywords: ['h2', 'heading', 'subtitulo'], icon: 'Heading2' },
  { type: 'h3', label: 'Encabezado 3', hint: 'Sub-sub-título', keywords: ['h3', 'heading'], icon: 'Heading3' },
  { type: 'h4', label: 'Encabezado 4', hint: 'Sección pequeña', keywords: ['h4', 'heading'], icon: 'Heading4' },
  { type: 'page', label: 'Página', hint: 'Enlace a subpágina', keywords: ['page', 'pagina', 'subpagina', 'link'], icon: 'FileText' },
  { type: 'list', label: 'Lista', hint: 'Lista con viñetas', keywords: ['list', 'lista', 'bullet', 'vinneta'], icon: 'List' },
  { type: 'todo', label: 'Tarea pendiente', hint: 'Casilla con checkbox', keywords: ['todo', 'tarea', 'checkbox', 'pendiente', 'check'], icon: 'CheckSquare' },
  { type: 'code', label: 'Código', hint: 'Bloque de código', keywords: ['code', 'codigo', 'bloque', 'snippet'], icon: 'Code' },
  { type: 'quote', label: 'Cita', hint: 'Bloque de cita', keywords: ['quote', 'cita', 'blockquote'], icon: 'Quote' },
  { type: 'image', label: 'Imagen', hint: 'Imagen embebida', keywords: ['image', 'imagen', 'foto', 'picture'], icon: 'Image' },
  { type: 'paragraph', label: 'Texto', hint: 'Párrafo simple', keywords: ['text', 'texto', 'paragraph', 'parrafo'], icon: 'Pilcrow' },
]

let _counter = 0
export function newBlockId(): string {
  _counter += 1
  return `b_${Date.now().toString(36)}_${_counter}`
}

export function makeBlock(type: BlockType = 'paragraph', text = ''): Block {
  const b: Block = { id: newBlockId(), type, text }
  if (type === 'code') b.lang = 'plain'
  if (type === 'page') b.url = ''
  if (type === 'image') b.url = ''
  if (type === 'todo') b.checked = false
  return b
}

/**
 * Parse a stored description string into a list of blocks.
 *
 * - JSON array of blocks → returned directly (after sanitising ids/types)
 * - Plain text or markdown → wrapped as a single paragraph block
 * - null/empty → empty array
 */
export function parseBlocks(raw: string | null | undefined): Block[] {
  if (!raw || !raw.trim()) return []
  // Try JSON first
  if (raw.trim().startsWith('[')) {
    try {
      const arr = JSON.parse(raw)
      if (Array.isArray(arr)) {
        return arr
          .filter((x) => x && typeof x === 'object' && typeof x.type === 'string')
          .map((x) => {
            const b: Block = {
              id: typeof x.id === 'string' ? x.id : newBlockId(),
              type: x.type as BlockType,
              text: typeof x.text === 'string' ? x.text : '',
            }
            if (b.type === 'code' && typeof x.lang === 'string') b.lang = x.lang
            if ((b.type === 'page' || b.type === 'image') && typeof x.url === 'string') b.url = x.url
            if (b.type === 'todo' && typeof x.checked === 'boolean') b.checked = x.checked
            return b
          })
      }
    } catch {
      // fall through to plain text
    }
  }
  // Plain text / markdown fallback
  return [makeBlock('paragraph', raw)]
}

/**
 * Returns true if a block is "empty" (no meaningful content).
 * Used to trim trailing empty blocks before saving.
 */
export function isBlockEmpty(b: Block): boolean {
  // Paragraph / heading / list / quote / todo: empty if no text
  if (['paragraph', 'h1', 'h2', 'h3', 'h4', 'list', 'quote', 'todo'].includes(b.type)) {
    return !b.text.trim()
  }
  // Image: empty if no url
  if (b.type === 'image') return !b.url
  // Page: empty if no text AND no url
  if (b.type === 'page') return !b.text.trim() && !b.url
  // Code: empty if no text
  if (b.type === 'code') return !b.text.trim()
  return !b.text.trim()
}

/**
 * Trim trailing empty blocks (paragraphs with no text, etc.) so the saved
 * content stays clean — matches Notion's behaviour where pressing Enter at
 * the end of the last block and then leaving doesn't leave stray empty
 * blocks behind.
 */
export function trimTrailingEmptyBlocks(blocks: Block[]): Block[] {
  if (!blocks || blocks.length === 0) return []
  const result = [...blocks]
  while (result.length > 1 && isBlockEmpty(result[result.length - 1])) {
    result.pop()
  }
  return result
}

/**
 * Serialise a list of blocks to a string suitable for `Card.description`.
 *
 * - Empty array → null (so the column stays clean)
 * - All-empty blocks → null
 * - Single empty paragraph → null
 * - Otherwise → JSON string (after trimming trailing empty blocks)
 */
export function serializeBlocks(blocks: Block[]): string | null {
  if (!blocks || blocks.length === 0) return null
  const trimmed = trimTrailingEmptyBlocks(blocks)
  if (trimmed.length === 0) return null
  if (trimmed.length === 1 && trimmed[0].type === 'paragraph' && !trimmed[0].text.trim()) {
    return null
  }
  return JSON.stringify(trimmed)
}

/**
 * Build a short preview string for a card snippet (used in the card thumbnail).
 */
export function blocksPreview(blocks: Block[]): string {
  if (!blocks.length) return ''
  const first = blocks.find((b) => b.text.trim()) ?? blocks[0]
  if (first.type === 'image') return '[Imagen]'
  if (first.type === 'todo') return first.checked ? `[x] ${first.text}` : `[ ] ${first.text}`
  return first.text.replace(/[#*_`>-]/g, '').slice(0, 60)
}
