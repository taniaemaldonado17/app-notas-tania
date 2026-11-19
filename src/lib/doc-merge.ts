import type { DocBlock } from '@/lib/blocks'

/**
 * Short fingerprint of a stored document, so a save can say "I edited the
 * version with this fingerprint" and the server can detect that someone else
 * saved in between (FNV-1a, 32 bits).
 */
export function hashDoc(raw: string | null | undefined): string {
  const s = raw ?? ''
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(16)
}

/** The block itself without its nested blocks. */
const own = (b: DocBlock) => JSON.stringify({ t: b.type, p: b.props ?? {}, c: b.content ?? null })
const deep = (b: DocBlock): string => own(b) + '[' + (Array.isArray(b.children) ? b.children.map(deep).join(',') : '') + ']'
const kids = (b: DocBlock | undefined): DocBlock[] => (b && Array.isArray(b.children) ? b.children : [])

/**
 * Three-way merge of two edited copies of the same document, block by block
 * (blocks keep their id across edits):
 * - a block only one person changed takes that person's version;
 * - if both changed the same block, `mine` wins;
 * - blocks added by either are kept, near where they were added;
 * - a block deleted by one person is removed unless the other changed it.
 * Nested blocks are merged the same way.
 */
export function mergeDocs(base: DocBlock[], mine: DocBlock[], theirs: DocBlock[]): DocBlock[] {
  const byId = (list: DocBlock[]) => new Map(list.filter((b) => b?.id).map((b) => [b.id as string, b]))
  const B = byId(base)
  const M = byId(mine)
  const T = byId(theirs)

  const result: DocBlock[] = []
  for (const m of mine) {
    const id = m?.id as string | undefined
    if (!id) {
      result.push(m)
      continue
    }
    const b = B.get(id)
    const t = T.get(id)
    if (!b) {
      result.push(m) // added by me
      continue
    }
    if (!t) {
      // Deleted by them: keep only if I changed it.
      if (deep(m) !== deep(b)) result.push(m)
      continue
    }
    const self = own(m) === own(b) ? t : m
    result.push({ ...self, children: mergeDocs(kids(b), kids(m), kids(t)) })
  }

  // Blocks they added (or that I deleted but they changed), placed after
  // their previous neighbour in their copy.
  theirs.forEach((t, i) => {
    const id = t?.id as string | undefined
    if (!id || M.has(id)) return
    const b = B.get(id)
    if (b && deep(t) === deep(b)) return // I deleted it and they didn't touch it
    let at = 0
    for (let j = i - 1; j >= 0; j--) {
      const k = result.findIndex((r) => r.id === theirs[j].id)
      if (k >= 0) {
        at = k + 1
        break
      }
    }
    result.splice(at, 0, t)
  })
  return result
}
