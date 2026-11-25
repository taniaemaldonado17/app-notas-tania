/**
 * Sub-pages ("Página" blocks): shared by the server, the editor and the
 * Claude connector. No server-only imports here.
 */
import type { DocBlock } from './blocks'

export const SUBPAGE_BLOCK = 'subpage'

/** Where a document lives: a database row, a board card or a sub-page. */
export type DocKind = 'row' | 'card' | 'subpage'
export type DocRef = { kind: DocKind; id: string }

export type SubPageInfo = {
  id: string
  pageId: string
  title: string
  icon: string | null
  logoUrl: string | null
  content: string | null
  parent: DocRef
  /** From the top document (row or card) down to this sub-page's parent. */
  trail: { kind: DocKind; id: string; title: string; icon: string | null }[]
  updatedAt: string
}

/** The link block that shows a sub-page inside its parent document. */
export function subPageBlock(sub: { id: string; title: string; icon: string | null }, blockId?: string): DocBlock {
  return {
    id: blockId ?? globalThis.crypto.randomUUID(),
    type: SUBPAGE_BLOCK,
    props: { subpageId: sub.id, title: sub.title, icon: sub.icon ?? '' },
    children: [],
  }
}

/** Every sub-page link block in a document (nested ones too). */
export function findSubPageBlocks(blocks: DocBlock[]): DocBlock[] {
  const out: DocBlock[] = []
  const walk = (list: DocBlock[]) => {
    for (const b of list) {
      if (!b || typeof b !== 'object') continue
      if (b.type === SUBPAGE_BLOCK) out.push(b)
      if (Array.isArray(b.children)) walk(b.children)
    }
  }
  walk(blocks)
  return out
}

/**
 * Copies a sub-page's title/icon into its link blocks. Returns the new
 * document, or null when nothing changed.
 */
export function updateSubPageBlocks(blocks: DocBlock[], subpageId: string, patch: { title?: string; icon?: string | null }): DocBlock[] | null {
  let changed = false
  const walk = (list: DocBlock[]): DocBlock[] =>
    list.map((b) => {
      if (!b || typeof b !== 'object') return b
      let next = b
      if (b.type === SUBPAGE_BLOCK && b.props?.subpageId === subpageId) {
        const props = { ...b.props }
        if (patch.title !== undefined && props.title !== patch.title) props.title = patch.title
        if (patch.icon !== undefined && (props.icon ?? '') !== (patch.icon ?? '')) props.icon = patch.icon ?? ''
        if (props.title !== b.props.title || props.icon !== b.props.icon) {
          changed = true
          next = { ...b, props }
        }
      }
      if (Array.isArray(next.children) && next.children.length) {
        const kids = walk(next.children)
        if (kids !== next.children) next = { ...next, children: kids }
      }
      return next
    })
  const result = walk(blocks)
  return changed ? result : null
}

/** Plain text of a block's inline content (for titles). */
export function blockText(b: DocBlock | undefined): string {
  const walk = (c: unknown): string => {
    if (!c) return ''
    if (typeof c === 'string') return c
    if (Array.isArray(c)) return c.map((n) => (n && typeof n === 'object' ? (typeof n.text === 'string' ? n.text : n.type === 'mention' ? `@${n.props?.name ?? ''}` : walk(n.content)) : '')).join('')
    return ''
  }
  return walk(b?.content).trim()
}

/** Level of a heading block (1 if missing), or null for any other block. */
function headingLevel(b: DocBlock | undefined): number | null {
  if (!b || b.type !== 'heading') return null
  const n = Number(b.props?.level)
  return Number.isFinite(n) && n > 0 ? n : 1
}

/**
 * What "Convertir en → Página" takes into the new page, given the block the
 * menu was opened on, the selected blocks (top level of the selection) and the
 * blocks at the same level as it (its siblings, in order):
 * - Several blocks selected: the first one is the title; its nested blocks and
 *   all the other selected blocks become the page.
 * - A block with nested blocks: those (as in Notion).
 * - A heading: everything below it up to the next heading of the same or a
 *   higher level.
 * Links to other pages are never moved (they stay where they are).
 * `taken` are the blocks (besides `block`) to remove from the document.
 */
export function pageContentFor(
  block: DocBlock,
  selected: DocBlock[],
  siblings: DocBlock[]
): { title: DocBlock; content: DocBlock[]; taken: DocBlock[] } {
  const movable = (b: DocBlock) => b && b.type !== SUBPAGE_BLOCK
  const kids = (b: DocBlock): DocBlock[] => (Array.isArray(b.children) ? b.children : [])
  if (selected.length > 1 && selected.some((b) => b.id === block.id) && movable(selected[0])) {
    const taken = selected.slice(1).filter(movable)
    return { title: selected[0], content: [...kids(selected[0]), ...taken], taken }
  }
  const own = kids(block)
  if (own.length) return { title: block, content: own, taken: [] }
  const level = headingLevel(block)
  if (level === null) return { title: block, content: [], taken: [] }
  const at = siblings.findIndex((b) => b.id === block.id)
  const taken: DocBlock[] = []
  for (const b of at >= 0 ? siblings.slice(at + 1) : []) {
    const l = headingLevel(b)
    if ((l !== null && l <= level) || !movable(b)) break
    taken.push(b)
  }
  return { title: block, content: taken, taken }
}
