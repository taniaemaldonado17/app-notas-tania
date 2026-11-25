/**
 * Small, targeted edits to a document's blocks (used by the Claude connector):
 * change a few words, or replace / insert / delete specific blocks, leaving
 * every other block exactly as it was (formatting, colours, ids).
 */
import type { DocBlock } from './blocks'
import { blockText, SUBPAGE_BLOCK } from './subpages.ts'

/** A problem the person (or Claude) can fix by asking differently. */
export class EditError extends Error {}

/** Case-, accent- and spacing-insensitive form for finding blocks by their text. */
export const looseText = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()

const textOf = (b: DocBlock) => (b.type === SUBPAGE_BLOCK ? String(b.props?.title ?? '') : blockText(b))

type Hit = { list: DocBlock[]; index: number; block: DocBlock }

/** Blocks (at any depth) whose text contains `needle`, in reading order. */
function findBlocks(blocks: DocBlock[], needle: string): Hit[] {
  const n = looseText(needle)
  const hits: Hit[] = []
  const walk = (list: DocBlock[]) => {
    list.forEach((b, index) => {
      if (!b || typeof b !== 'object') return
      if (n && looseText(textOf(b)).includes(n)) hits.push({ list, index, block: b })
      if (Array.isArray(b.children)) walk(b.children)
    })
  }
  walk(blocks)
  return hits
}

const preview = (b: DocBlock) => {
  const t = textOf(b).replace(/\s+/g, ' ')
  return t.length > 60 ? `${t.slice(0, 60)}…` : t
}

export type BlockAction = 'reemplazar' | 'insertar_despues' | 'insertar_antes' | 'eliminar'

/**
 * Replaces, deletes or inserts next to the block whose text contains `find`
 * (or the run of sibling blocks from it to the one containing `until`).
 * Links to pages inside the document are never dropped: if the edited range
 * had any, they stay right after the new blocks.
 */
export function editBlocks(
  blocks: DocBlock[],
  opts: { action: BlockAction; find: string; until?: string; blocks?: DocBlock[]; occurrence?: number }
): { blocks: DocBlock[]; removed: number; inserted: number; keptPages: number } {
  const doc: DocBlock[] = structuredClone(blocks)
  if (!opts.find.trim()) throw new EditError('Falta el texto para encontrar el bloque')
  const hits = findBlocks(doc, opts.find)
  if (!hits.length) throw new EditError(`No encontré ningún bloque que contenga "${opts.find}"`)
  if (hits.length > 1 && !opts.occurrence) {
    const list = hits.slice(0, 8).map((h, i) => `${i + 1}) ${preview(h.block)}`).join(' · ')
    throw new EditError(`Hay ${hits.length} bloques que contienen "${opts.find}": ${list}. Usá un texto más largo o indicá "ocurrencia".`)
  }
  const hit = hits[(opts.occurrence ?? 1) - 1]
  if (!hit) throw new EditError(`Solo hay ${hits.length} bloque(s) con ese texto`)

  let end = hit.index
  if (opts.until?.trim()) {
    const n = looseText(opts.until)
    const rel = hit.list.slice(hit.index).findIndex((b) => looseText(textOf(b)).includes(n))
    if (rel < 0) throw new EditError(`Desde ese bloque no encontré, al mismo nivel, uno que contenga "${opts.until}"`)
    end = hit.index + rel
  }

  const fresh = opts.blocks ?? []
  if (opts.action !== 'eliminar' && !fresh.length) {
    throw new EditError('Falta el contenido nuevo (markdown). Para borrar bloques usá accion "eliminar"')
  }

  switch (opts.action) {
    case 'insertar_antes':
      hit.list.splice(hit.index, 0, ...fresh)
      return { blocks: doc, removed: 0, inserted: fresh.length, keptPages: 0 }
    case 'insertar_despues':
      hit.list.splice(end + 1, 0, ...fresh)
      return { blocks: doc, removed: 0, inserted: fresh.length, keptPages: 0 }
    case 'reemplazar':
    case 'eliminar': {
      const range = hit.list.slice(hit.index, end + 1)
      const pages: DocBlock[] = []
      const collect = (list: DocBlock[]) =>
        list.forEach((b) => {
          if (b?.type === SUBPAGE_BLOCK) pages.push({ ...b, children: [] })
          if (Array.isArray(b?.children)) collect(b.children)
        })
      collect(range)
      const incoming = new Set<string>()
      const mark = (list: DocBlock[]) =>
        list.forEach((b) => {
          if (b?.type === SUBPAGE_BLOCK) incoming.add(String(b.props?.subpageId))
          if (Array.isArray(b?.children)) mark(b.children)
        })
      const next = opts.action === 'reemplazar' ? fresh : []
      mark(next)
      const kept = pages.filter((p) => !incoming.has(String(p.props?.subpageId)))
      hit.list.splice(hit.index, range.length, ...next, ...kept)
      return { blocks: doc, removed: range.length, inserted: next.length, keptPages: kept.length }
    }
    default:
      throw new EditError('accion tiene que ser reemplazar, insertar_despues, insertar_antes o eliminar')
  }
}

/** Every inline text node of a block's content (paragraph text, links, table cells). */
function textNodes(content: unknown, out: DocBlock[] = []): DocBlock[] {
  if (!content || typeof content !== 'object') return out
  if (Array.isArray(content)) {
    for (const n of content) {
      if (n && typeof n === 'object' && n.type === 'text' && typeof n.text === 'string') out.push(n)
      else textNodes(n, out)
    }
    return out
  }
  const c = content as Record<string, unknown>
  if (Array.isArray(c.content)) textNodes(c.content, out)
  if (Array.isArray(c.rows)) for (const r of c.rows as DocBlock[]) textNodes(r?.cells, out)
  return out
}

function countIn(s: string, needle: string) {
  let n = 0
  for (let i = s.indexOf(needle); i >= 0; i = s.indexOf(needle, i + needle.length)) n++
  return n
}

/**
 * Replaces exact words inside the text, keeping each piece's formatting
 * (bold, colour, links…). With `all` false, the words must appear once.
 */
export function replaceText(blocks: DocBlock[], find: string, replacement: string, all = false): { blocks: DocBlock[]; count: number } {
  if (!find) throw new EditError('Falta el texto a reemplazar')
  const doc: DocBlock[] = structuredClone(blocks)
  const nodes: DocBlock[] = []
  let plainHits = 0
  const walk = (list: DocBlock[]) =>
    list.forEach((b) => {
      if (!b || typeof b !== 'object') return
      nodes.push(...textNodes(b.content))
      plainHits += countIn(blockText(b), find)
      if (Array.isArray(b.children)) walk(b.children)
    })
  walk(doc)
  const count = nodes.reduce((n, t) => n + countIn(t.text, find), 0)
  if (!count) {
    if (plainHits) throw new EditError('Ese texto tiene partes con distinto formato (por ejemplo, una palabra en negrita): usá editar_bloques para reescribir el bloque entero')
    throw new EditError(`No encontré "${find}" en el documento (tiene que estar escrito exactamente igual)`)
  }
  if (count > 1 && !all) throw new EditError(`"${find}" aparece ${count} veces. Usá un texto más largo o "todas": true para cambiarlas todas`)
  for (const t of nodes) if (t.text.includes(find)) t.text = t.text.split(find).join(replacement)
  return { blocks: doc, count }
}
