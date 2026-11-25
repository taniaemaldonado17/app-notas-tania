/**
 * Text pasted from Word, Outlook, PDFs or emails often brings its bullets as
 * characters ("• texto", "·\ttexto") instead of a real list, so they show up
 * as plain lines. These helpers turn those lines into list blocks.
 * No editor imports: also used in tests.
 */
import type { DocBlock } from './blocks'

// Bullet characters (including the private-use "" Word uses with the Symbol font).
const BULLET = /^[\s ]*(?:[•·◦▪▫‣●○■□►▸–—]|[-*](?=[\s ])|o(?=\t))[\s ]*/
const NUMBER = /^[\s ]*(\d{1,3})[.)](?:[\s ]+)/

/** "bulletListItem" / "numberedListItem" if the text starts with a bullet or a number; null otherwise. */
export function listPrefix(text: string): { type: 'bulletListItem' | 'numberedListItem'; length: number } | null {
  const b = BULLET.exec(text)
  if (b && b[0].length < text.length) return { type: 'bulletListItem', length: b[0].length }
  const n = NUMBER.exec(text)
  if (n && n[0].length < text.length) return { type: 'numberedListItem', length: n[0].length }
  return null
}

/** Removes the first `length` characters of a block's inline content. */
function dropChars(content: unknown[], length: number): unknown[] {
  let left = length
  const out: unknown[] = []
  for (const node of content) {
    if (left > 0 && node && typeof node === 'object' && (node as { type?: string }).type === 'text') {
      const t = node as { text: string }
      if (t.text.length <= left) {
        left -= t.text.length
        continue
      }
      out.push({ ...t, text: t.text.slice(left) })
      left = 0
      continue
    }
    left = 0
    out.push(node)
  }
  return out
}

/** Text at the start of a paragraph (only its leading plain text runs). */
function leadingText(content: unknown): string {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  let s = ''
  for (const n of content) {
    if (n && typeof n === 'object' && (n as { type?: string }).type === 'text') s += (n as { text: string }).text
    else break
  }
  return s
}

/**
 * If a paragraph starts with a bullet or a number ("• Algo", "1. Algo"),
 * the list block it should be (without the character). Otherwise null.
 */
export function paragraphAsListItem(b: DocBlock): DocBlock | null {
  if (!b || b.type !== 'paragraph') return null
  const text = leadingText(b.content)
  const prefix = listPrefix(text)
  if (!prefix) return null
  const content = typeof b.content === 'string' ? b.content.slice(prefix.length) : dropChars(b.content as unknown[], prefix.length)
  return { ...b, type: prefix.type, content }
}

/** Same as paragraphAsListItem for a whole document (nested blocks too). */
export function bulletsToLists(blocks: DocBlock[]): DocBlock[] {
  return blocks.map((b) => {
    const next = paragraphAsListItem(b) ?? b
    return Array.isArray(next.children) && next.children.length ? { ...next, children: bulletsToLists(next.children) } : next
  })
}
