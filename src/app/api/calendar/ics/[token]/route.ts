import { db } from '@/lib/db'
import { accessiblePageWhere } from '@/lib/auth-helpers'
import type { PropertyDef } from '@/lib/db-types'

/**
 * Read-only iCalendar feed of every dated row (tasks, deliveries, projects…)
 * in the databases the token's owner can access. Subscribed from Apple
 * Calendar / Google Calendar; they re-fetch it periodically.
 */
export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  if (!token || token.length < 20) return new Response('No encontrado', { status: 404 })
  const user = await db.user.findFirst({ where: { calendarToken: token }, select: { id: true } })
  if (!user) return new Response('No encontrado', { status: 404 })

  const databases = await db.database.findMany({
    where: { page: accessiblePageWhere(user.id) },
    select: {
      id: true,
      title: true,
      icon: true,
      properties: true,
      page: { select: { title: true } },
      rows: { select: { id: true, title: true, icon: true, values: true, updatedAt: true } },
    },
  })

  const origin = new URL(req.url).origin
  const stamp = icsDateTime(new Date())
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Registro de tareas//Calendario//ES',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:Proyectos y tareas',
    'X-WR-CALDESC:Fechas de tus proyectos\\, tareas y entregas',
    'X-WR-TIMEZONE:America/Argentina/Buenos_Aires',
    'REFRESH-INTERVAL;VALUE=DURATION:PT30M',
    'X-PUBLISHED-TTL:PT30M',
  ]

  for (const d of databases) {
    const props = (Array.isArray(d.properties) ? d.properties : []) as unknown as PropertyDef[]
    const dateProps = props.filter((p) => p.type === 'date')
    if (!dateProps.length) continue
    const chips = props.filter((p) => p.type === 'select' || p.type === 'status')

    for (const r of d.rows) {
      const values = (r.values ?? {}) as Record<string, unknown>
      for (const p of dateProps) {
        const v = values[p.id]
        if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(v)) continue
        const day = v.slice(0, 10)
        const title = `${r.icon ? `${r.icon} ` : ''}${r.title || 'Sin título'}`
        const summary = dateProps.length > 1 ? `${title} · ${p.name}` : title
        const details = chips
          .map((c) => {
            const opt = c.options?.find((o) => o.id === values[c.id])
            return opt ? `${c.name}: ${opt.name}` : null
          })
          .filter(Boolean)
        const url = `${origin}/?row=${r.id}`
        const description = [`${d.icon ?? ''} ${d.title} — ${d.page.title}`.trim(), ...details, url].join('\n')

        lines.push(
          'BEGIN:VEVENT',
          `UID:${r.id}-${p.id}@registro-de-tareas`,
          `DTSTAMP:${stamp}`,
          `LAST-MODIFIED:${icsDateTime(r.updatedAt)}`,
          `DTSTART;VALUE=DATE:${day.replace(/-/g, '')}`,
          `DTEND;VALUE=DATE:${nextDay(day)}`,
          `SUMMARY:${esc(summary)}`,
          `DESCRIPTION:${esc(description)}`,
          `URL:${url}`,
          'TRANSP:TRANSPARENT',
          'END:VEVENT'
        )
      }
    }
  }
  lines.push('END:VCALENDAR')

  return new Response(lines.map(fold).join('\r\n') + '\r\n', {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'inline; filename="proyectos.ics"',
      'Cache-Control': 'private, max-age=300',
    },
  })
}

function icsDateTime(d: Date): string {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
}

function nextDay(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  const n = new Date(Date.UTC(y, m - 1, d + 1))
  return n.toISOString().slice(0, 10).replace(/-/g, '')
}

function esc(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')
}

/** RFC 5545: lines longer than 75 octets are folded with CRLF + space. */
function fold(line: string): string {
  const bytes = new TextEncoder().encode(line)
  if (bytes.length <= 75) return line
  const out: string[] = []
  let cur = ''
  let len = 0
  for (const ch of line) {
    const n = new TextEncoder().encode(ch).length
    if (len + n > (out.length ? 74 : 75)) {
      out.push(cur)
      cur = ''
      len = 0
    }
    cur += ch
    len += n
  }
  out.push(cur)
  return out.join('\r\n ')
}
