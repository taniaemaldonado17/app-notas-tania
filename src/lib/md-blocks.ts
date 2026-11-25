/**
 * Markdown <-> page content (BlockNote blocks, see blocks.ts).
 *
 * Used by the Claude connector (src/lib/mcp): Claude reads pages as Markdown
 * and writes Markdown that is stored as blocks. No editor or DOM needed, so
 * it runs on the server.
 *
 * Every block written here gets its own id: open editors merge server changes
 * block by block (doc-merge.ts), and blocks without ids would be dropped.
 */
import { Lexer, type Token, type Tokens } from 'marked'
import type { DocBlock } from './blocks'
import { SUBPAGE_BLOCK } from './subpages.ts'

type Styles = { bold?: true; italic?: true; strike?: true; code?: true; underline?: true }
type InlineText = { type: 'text'; text: string; styles: Styles }
type InlineLink = { type: 'link'; href: string; content: InlineText[] }
type Inline = InlineText | InlineLink

const uid = () => globalThis.crypto.randomUUID()

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", apos: "'", nbsp: ' ' }
const decode = (s: string) => s.replace(/&(amp|lt|gt|quot|#39|apos|nbsp);/g, (_, e: string) => ENTITIES[e])

/* --------------------------- Markdown -> blocks --------------------------- */

function pushText(out: Inline[], text: string, styles: Styles) {
  if (!text) return
  const last = out[out.length - 1]
  if (last && last.type === 'text' && JSON.stringify(last.styles) === JSON.stringify(styles)) {
    last.text += text
  } else {
    out.push({ type: 'text', text, styles: { ...styles } })
  }
}

function inline(tokens: Token[] | undefined, styles: Styles = {}): Inline[] {
  const out: Inline[] = []
  for (const t of tokens ?? []) {
    switch (t.type) {
      case 'text': {
        const tt = t as Tokens.Text
        if (tt.tokens?.length) out.push(...inline(tt.tokens, styles))
        else pushText(out, decode(tt.text), styles)
        break
      }
      case 'escape':
        pushText(out, (t as Tokens.Escape).text, styles)
        break
      case 'strong':
        out.push(...inline((t as Tokens.Strong).tokens, { ...styles, bold: true }))
        break
      case 'em':
        out.push(...inline((t as Tokens.Em).tokens, { ...styles, italic: true }))
        break
      case 'del':
        out.push(...inline((t as Tokens.Del).tokens, { ...styles, strike: true }))
        break
      case 'codespan':
        pushText(out, decode((t as Tokens.Codespan).text), { ...styles, code: true })
        break
      case 'br':
        pushText(out, '\n', styles)
        break
      case 'link': {
        const l = t as Tokens.Link
        const content = inline(l.tokens, styles).flatMap((i) => (i.type === 'link' ? i.content : [i]))
        out.push({ type: 'link', href: l.href, content: content.length ? content : [{ type: 'text', text: l.href, styles: { ...styles } }] })
        break
      }
      case 'image': {
        const img = t as Tokens.Image
        out.push({ type: 'link', href: img.href, content: [{ type: 'text', text: img.text || img.href, styles: { ...styles } }] })
        break
      }
      case 'html': {
        const raw = (t as Tokens.HTML).text
        if (/^<br\s*\/?>$/i.test(raw.trim())) pushText(out, '\n', styles)
        else pushText(out, decode(raw.replace(/<[^>]*>/g, '')), styles)
        break
      }
      case 'checkbox':
        break
      default: {
        const g = t as Tokens.Generic
        if (Array.isArray(g.tokens)) out.push(...inline(g.tokens, styles))
        else if (typeof g.text === 'string') pushText(out, decode(g.text), styles)
      }
    }
  }
  return out
}

const block = (type: string, extra: Partial<DocBlock> = {}): DocBlock => ({ id: uid(), type, props: {}, children: [], ...extra })

/** Paragraph-like tokens become blocks of `type`; anything else is converted normally. */
function textBlocks(tokens: Token[], type: string): DocBlock[] {
  const out: DocBlock[] = []
  for (const t of tokens) {
    if (t.type === 'paragraph' || t.type === 'text') out.push(block(type, { content: inline((t as Tokens.Paragraph).tokens ?? [t]) }))
    else out.push(...toBlocks([t]))
  }
  return out
}

function listItems(list: Tokens.List): DocBlock[] {
  return list.items.map((item) => {
    const type = item.task ? 'checkListItem' : list.ordered ? 'numberedListItem' : 'bulletListItem'
    const props = item.task ? { checked: !!item.checked } : {}
    const tokens = item.tokens.filter((t) => t.type !== 'checkbox' && t.type !== 'space')
    const [first, ...rest] = tokens
    if (first && (first.type === 'text' || first.type === 'paragraph')) {
      return block(type, { props, content: inline((first as Tokens.Text).tokens ?? [first]), children: toBlocks(rest) })
    }
    return block(type, { props, content: [], children: toBlocks(tokens) })
  })
}

function toBlocks(tokens: Token[]): DocBlock[] {
  const out: DocBlock[] = []
  for (const t of tokens) {
    switch (t.type) {
      case 'space':
      case 'def':
        break
      case 'heading': {
        const h = t as Tokens.Heading
        out.push(block('heading', { props: { level: Math.min(6, Math.max(1, h.depth)) }, content: inline(h.tokens) }))
        break
      }
      case 'paragraph':
      case 'text': {
        const p = t as Tokens.Paragraph
        const parts = (p.tokens ?? []).filter((x) => !(x.type === 'text' && !(x as Tokens.Text).text.trim()))
        const link = parts[parts.length - 1] as Tokens.Link | undefined
        const sub = link?.type === 'link' ? /^subpagina:([\w-]+)$/.exec(link.href) : null
        if (sub && parts.length <= 2 && (parts.length === 1 || parts[0].type === 'text')) {
          // "📄 [Título](subpagina:<id>)": link to a page inside the document.
          const icon = parts.length === 2 ? decode((parts[0] as Tokens.Text).text).trim().slice(0, 16) : ''
          out.push(block(SUBPAGE_BLOCK, { props: { subpageId: sub[1], title: decode(link!.text), icon } }))
        } else if (parts.length === 1 && parts[0].type === 'image') {
          const img = parts[0] as Tokens.Image
          out.push(block('image', { props: { url: img.href, caption: img.text || '' } }))
        } else {
          out.push(block('paragraph', { content: inline(p.tokens ?? [t]) }))
        }
        break
      }
      case 'blockquote':
        out.push(...textBlocks((t as Tokens.Blockquote).tokens, 'quote'))
        break
      case 'code': {
        const c = t as Tokens.Code
        out.push(block('codeBlock', { props: { language: c.lang?.trim() || 'text' }, content: [{ type: 'text', text: c.text, styles: {} }] }))
        break
      }
      case 'hr':
        out.push(block('divider'))
        break
      case 'list':
        out.push(...listItems(t as Tokens.List))
        break
      case 'table': {
        const tb = t as Tokens.Table
        const rows = [tb.header, ...tb.rows].map((r) => ({ cells: r.map((c) => inline(c.tokens)) }))
        out.push(block('table', { content: { type: 'tableContent', headerRows: 1, rows } }))
        break
      }
      case 'html': {
        const text = decode((t as Tokens.HTML).text.replace(/<[^>]*>/g, '')).trim()
        if (text) out.push(block('paragraph', { content: [{ type: 'text', text, styles: {} }] }))
        break
      }
      default: {
        const g = t as Tokens.Generic
        if (typeof g.text === 'string' && g.text.trim()) out.push(block('paragraph', { content: [{ type: 'text', text: g.text, styles: {} }] }))
      }
    }
  }
  return out
}

/** Markdown (GitHub flavour: tables, task lists, strikethrough) to page blocks. */
export function markdownToBlocks(markdown: string): DocBlock[] {
  const md = markdown.replace(/\r\n?/g, '\n')
  if (!md.trim()) return []
  return toBlocks(Lexer.lex(md, { gfm: true }))
}

/* --------------------------- Blocks -> Markdown --------------------------- */

function wrap(text: string, styles: Record<string, unknown> | undefined): string {
  if (!text) return ''
  if (styles?.code) return '`' + text + '`'
  // Keep spaces outside the markers so "** x**" doesn't break the emphasis.
  const lead = text.match(/^\s*/)![0]
  const trail = text.match(/\s*$/)![0]
  let core = text.slice(lead.length, text.length - trail.length)
  if (!core) return text
  if (styles?.bold) core = `**${core}**`
  if (styles?.italic) core = `*${core}*`
  if (styles?.strike) core = `~~${core}~~`
  return lead + core + trail
}

function inlineMd(content: unknown): string {
  if (!content) return ''
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content
    .map((n: DocBlock) => {
      if (!n || typeof n !== 'object') return ''
      if (n.type === 'text') return wrap(String(n.text ?? ''), n.styles)
      if (n.type === 'link') return `[${inlineMd(n.content) || n.href}](${n.href})`
      if (n.type === 'mention') return `@${n.props?.name ?? ''}`
      if (typeof n.text === 'string') return n.text
      return inlineMd(n.content)
    })
    .join('')
}

const cellText = (c: unknown) => inlineMd((c as DocBlock)?.type === 'tableCell' ? (c as DocBlock).content : c).replace(/\|/g, '\\|').replace(/\n/g, ' ')

function tableMd(content: DocBlock | undefined): string[] {
  const rows: DocBlock[] = Array.isArray(content?.rows) ? content!.rows : []
  if (!rows.length) return []
  const cells = rows.map((r) => (Array.isArray(r.cells) ? r.cells.map(cellText) : []))
  const width = Math.max(...cells.map((r) => r.length), 1)
  const line = (r: string[]) => `| ${Array.from({ length: width }, (_, i) => r[i] ?? '').join(' | ')} |`
  return [line(cells[0]), `| ${Array.from({ length: width }, () => '---').join(' | ')} |`, ...cells.slice(1).map(line)]
}

function parseJsonList(raw: unknown): DocBlock[] {
  if (typeof raw !== 'string') return []
  try {
    const v = JSON.parse(raw)
    return Array.isArray(v) ? v : []
  } catch {
    return []
  }
}

const LIST_TYPES = new Set(['bulletListItem', 'numberedListItem', 'checkListItem', 'toggleListItem'])

/** One block (and its nested blocks) as Markdown lines. */
function blockMd(b: DocBlock, number: number): string[] {
  const text = inlineMd(b.content)
  const p = b.props ?? {}
  switch (b.type) {
    case 'heading':
      return [`${'#'.repeat(Math.min(6, Math.max(1, Number(p.level) || 1)))} ${text}`]
    case 'bulletListItem':
    case 'toggleListItem':
      return [`- ${text}`]
    case 'numberedListItem':
      return [`${number}. ${text}`]
    case 'checkListItem':
      return [`- [${p.checked ? 'x' : ' '}] ${text}`]
    case 'quote':
      return text.split('\n').map((l) => `> ${l}`)
    case 'callout':
      return text.split('\n').map((l, i) => `> ${i === 0 && p.emoji ? `${p.emoji} ` : ''}${l}`)
    case 'codeBlock': {
      const lang = p.language && p.language !== 'text' ? p.language : ''
      return ['```' + lang, ...inlineMd(b.content).split('\n'), '```']
    }
    case 'divider':
      return ['---']
    case 'image':
      return p.url ? [`![${p.caption || p.name || ''}](${p.url})`] : []
    case 'file':
    case 'video':
    case 'audio':
      return p.url ? [`[${p.name || p.caption || p.url}](${p.url})`] : []
    case 'table':
      return tableMd(b.content)
    case SUBPAGE_BLOCK:
      return [`${p.icon ? `${p.icon} ` : ''}[${String(p.title || 'Sin título').replace(/[[\]]/g, '')}](subpagina:${p.subpageId})`]
    case 'imageRow':
      return parseJsonList(p.images).map((img) => `![${img.name ?? ''}](${img.url})`)
    case 'embed':
      return p.url ? [`[Contenido insertado](${p.url})`] : p.html ? ['(Bloque HTML insertado)'] : []
    case 'timeline': {
      const items = parseJsonList(p.items)
      if (!items.length) return ['(Cronograma vacío)']
      return [
        '| Tarea | Inicio | Fin | Responsable | Hecha |',
        '| --- | --- | --- | --- | --- |',
        ...items.map((it) => `| ${it.name ?? ''} | ${it.start ?? ''} | ${it.end ?? ''} | ${it.person ?? ''} | ${it.done ? 'sí' : 'no'} |`),
      ]
    }
    default:
      return text ? text.split('\n') : ['']
  }
}

function docMd(blocks: DocBlock[], indent: string): string[] {
  const lines: string[] = []
  let number = 0
  let prevList = false
  for (const b of blocks) {
    if (!b || typeof b !== 'object') continue
    const isList = LIST_TYPES.has(b.type)
    number = b.type === 'numberedListItem' ? number + 1 : 0
    // Blank line between blocks, except between items of the same list.
    if (lines.length && !(isList && prevList)) lines.push('')
    prevList = isList
    const own = blockMd(b, number)
    lines.push(...own.map((l) => (l ? indent + l : l)))
    const kids: DocBlock[] = Array.isArray(b.children) ? b.children : []
    if (kids.length) {
      const sub = docMd(kids, indent + (b.type === 'numberedListItem' ? '   ' : '  '))
      if (!isList) lines.push('')
      lines.push(...sub)
    }
  }
  return lines
}

/** Page blocks to Markdown (lossy for custom blocks such as timelines). */
export function blocksToMarkdown(blocks: DocBlock[]): string {
  return docMd(blocks, '')
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
