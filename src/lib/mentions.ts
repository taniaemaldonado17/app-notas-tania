import { db } from '@/lib/db'
import { parseDoc, type DocBlock } from '@/lib/blocks'
import { sendMail } from '@/lib/mailer'

/** Where a mention was found: the block's text, the blocks above it and what is nested inside. */
export type MentionContext = { path: string[]; line: string; children: string[] }

const MAX_CHILD_LINES = 12

function inline(content: unknown): string {
  if (!content) return ''
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) {
    // Tables: { type: 'tableContent', rows: [{ cells }] }
    const rows = (content as DocBlock).rows
    return Array.isArray(rows)
      ? rows.map((r: DocBlock) => (Array.isArray(r.cells) ? r.cells.map((c: DocBlock) => inline(c?.content ?? c)).join(' | ') : '')).join(' / ')
      : ''
  }
  return content
    .map((n) => {
      if (!n || typeof n !== 'object') return ''
      const node = n as DocBlock
      if (node.type === 'mention') return `@${node.props?.name ?? ''}`
      if (typeof node.text === 'string') return node.text
      return inline(node.content)
    })
    .join('')
}

function mentionIds(content: unknown, out: Set<string>) {
  if (!content || typeof content !== 'object') return
  if (Array.isArray(content)) {
    content.forEach((c) => mentionIds(c, out))
    return
  }
  const node = content as DocBlock
  if (node.type === 'mention' && typeof node.props?.userId === 'string' && node.props.userId) out.add(node.props.userId)
  if (node.content) mentionIds(node.content, out)
  if (Array.isArray(node.rows)) node.rows.forEach((r: DocBlock) => mentionIds(r.cells, out))
}

function blockLine(b: DocBlock): string {
  const text = inline(b.content).trim()
  if (b.type === 'checkListItem') return `${b.props?.checked ? '☑' : '☐'} ${text}`
  if (b.type === 'bulletListItem' || b.type === 'numberedListItem') return `• ${text}`
  return text
}

function childLines(children: unknown, depth = 0, out: string[] = []): string[] {
  if (!Array.isArray(children)) return out
  for (const c of children as DocBlock[]) {
    if (out.length >= MAX_CHILD_LINES) break
    const line = blockLine(c)
    if (line) out.push(`${'  '.repeat(depth)}${line}`)
    childLines(c.children, depth + 1, out)
  }
  return out
}

/** userId → where they are mentioned (first occurrence) in a stored document. */
export function extractMentions(raw: string | null | undefined): Map<string, MentionContext> {
  const found = new Map<string, MentionContext>()
  const walk = (blocks: unknown, path: string[]) => {
    if (!Array.isArray(blocks)) return
    for (const b of blocks as DocBlock[]) {
      const ids = new Set<string>()
      mentionIds(b.content, ids)
      const line = blockLine(b)
      for (const id of ids) {
        if (!found.has(id)) found.set(id, { path, line, children: childLines(b.children) })
      }
      walk(b.children, line ? [...path, line] : path)
    }
  }
  walk(parseDoc(raw), [])
  return found
}

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/**
 * Emails the people newly mentioned between `before` and `after`.
 * Only people with access to the page are notified, never the author.
 */
export async function notifyNewMentions(opts: {
  actorId: string
  pageId: string
  before: string | null | undefined
  after: string | null | undefined
  itemTitle: string
  link: string
}) {
  const now = extractMentions(opts.after)
  if (!now.size) return
  const prev = extractMentions(opts.before)
  const fresh = [...now.keys()].filter((id) => !prev.has(id) && id !== opts.actorId)
  if (!fresh.length) return

  const page = await db.page.findUnique({
    where: { id: opts.pageId },
    select: { title: true, userId: true, members: { select: { userId: true } } },
  })
  if (!page) return
  const allowed = new Set([page.userId, ...page.members.map((m) => m.userId)])
  const ids = fresh.filter((id) => allowed.has(id))
  if (!ids.length) return

  const [actor, users] = await Promise.all([
    db.user.findUnique({ where: { id: opts.actorId }, select: { name: true, email: true } }),
    db.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, email: true } }),
  ])
  const actorName = actor?.name || actor?.email || 'Alguien'
  const item = opts.itemTitle.trim() || 'Sin título'

  await Promise.all(
    users.map(async (u) => {
      const ctx = now.get(u.id)!
      const lines = [...ctx.path.map((p) => `${p} ›`), ctx.line, ...ctx.children.map((c) => `   ${c}`)]
      const subject = `${actorName} te mencionó en «${item}»`
      const text = [
        `Hola ${u.name || ''}`.trim() + ',',
        '',
        `${actorName} te mencionó en «${item}» (página ${page.title}):`,
        '',
        ...lines.map((l) => `  ${l}`),
        '',
        `Abrilo acá: ${opts.link}`,
      ].join('\n')
      const html = `<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;font-size:15px;color:#222;max-width:560px">
  <p>Hola ${esc(u.name || '')},</p>
  <p><b>${esc(actorName)}</b> te mencionó en <b>${esc(item)}</b> <span style="color:#777">(página ${esc(page.title)})</span>:</p>
  <div style="border-left:3px solid #c9a227;background:#f7f5ef;padding:10px 14px;border-radius:4px;white-space:pre-wrap;line-height:1.5">${lines
    .map((l) => esc(l).replace(/@([^\s(),.;:]+)/g, '<b style="color:#8a6d00">@$1</b>'))
    .join('<br>')}</div>
  <p style="margin-top:20px"><a href="${esc(opts.link)}" style="background:#222;color:#fff;padding:9px 16px;border-radius:6px;text-decoration:none">Abrir en la app</a></p>
</div>`
      try {
        await sendMail({ to: u.email, subject, html, text, fromName: `${actorName} (MALTA)`, replyTo: actor?.email })
      } catch (err) {
        console.error('[mentions] email to', u.email, 'failed', err)
      }
    })
  )
}

/** Base URL for links in emails. */
export function appOrigin(req: Request) {
  return (process.env.APP_URL || new URL(req.url).origin).replace(/\/$/, '')
}
