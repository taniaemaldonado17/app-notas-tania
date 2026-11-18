/**
 * Exporting a database view: cell values as plain text (shared with the
 * future Excel export) and a printable A4 document saved as PDF through the
 * browser's print dialog (keeps emojis, accents and colours intact).
 */

import { resolveValue, rowTitle, type ResolveCtx } from '@/lib/db-resolve'
import {
  findOption,
  formatDate,
  formatNumber,
  getProperty,
  imageSrcFromLink,
  todayISO,
  type DatabaseDef,
  type DbRow,
  type OptionColor,
  type PropertyDef,
  type ViewDef,
} from '@/lib/db-types'

export type ExportPerson = { id: string; name: string | null; email: string }

/** Columns exported for a view: title + visible properties (+ its dates). */
export function exportColumns(db: DatabaseDef, view: ViewDef): PropertyDef[] {
  const lead: string[] = []
  if (view.type === 'timeline' || view.type === 'calendar') {
    for (const id of [view.dateProperty, view.endDateProperty]) if (id) lead.push(id)
  }
  if (view.type === 'board' && view.groupBy) lead.push(view.groupBy)
  const ids = [...lead, ...view.visibleProperties.filter((id) => !lead.includes(id))]
  const title = db.properties.find((p) => p.type === 'title')
  const props = ids.map((id) => getProperty(db, id)).filter((p): p is PropertyDef => !!p && p.type !== 'title')
  return title ? [title, ...props] : props
}

/** A cell as text, the way it reads on screen. */
export function cellText(ctx: ResolveCtx, db: DatabaseDef, row: DbRow, prop: PropertyDef, people: ExportPerson[]): string {
  const v = resolveValue(ctx, db, row, prop)
  if (v === null || v === undefined || v === '') return ''
  switch (prop.type) {
    case 'title':
      return `${row.icon ? `${row.icon} ` : ''}${row.title || 'Sin título'}`
    case 'number':
      return typeof v === 'number' ? formatNumber(v, prop.numberFormat) : ''
    case 'formula':
      if (typeof v === 'number') return formatNumber(v, prop.numberFormat)
      if (typeof v === 'boolean') return v ? 'Sí' : 'No'
      return String(v)
    case 'select':
    case 'status':
      return findOption(prop, v)?.name ?? ''
    case 'multi_select':
      return (Array.isArray(v) ? v : []).map((id) => findOption(prop, id)?.name).filter(Boolean).join(', ')
    case 'date':
      return formatDate(v)
    case 'created_time':
    case 'updated_time':
      return typeof v === 'string'
        ? new Intl.DateTimeFormat('es-AR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(v))
        : ''
    case 'checkbox':
      return v === true ? 'Sí' : ''
    case 'person':
      return (Array.isArray(v) ? v : [])
        .map((id) => {
          const p = people.find((x) => x.id === id)
          return p ? p.name || p.email : ''
        })
        .filter(Boolean)
        .join(', ')
    case 'relation':
    case 'backlink':
      return (Array.isArray(v) ? v : [])
        .map((id) => rowTitle(ctx, id)?.title)
        .filter(Boolean)
        .join(', ')
    default:
      return Array.isArray(v) ? v.join(', ') : String(v)
  }
}

/* ------------------------------------------------------------------ */
/* PDF (print)                                                         */
/* ------------------------------------------------------------------ */

const PRINT_COLORS: Record<OptionColor, [string, string]> = {
  default: ['#ececec', '#37352f'],
  gray: ['#e3e2e0', '#32302c'],
  brown: ['#eee0da', '#442a1e'],
  orange: ['#fadec9', '#49290e'],
  yellow: ['#fbf3db', '#402c1b'],
  green: ['#dbeddb', '#1c3829'],
  blue: ['#d3e5ef', '#183347'],
  purple: ['#e8deee', '#412454'],
  pink: ['#f5e0e9', '#4c2337'],
  red: ['#ffe2dd', '#5d1715'],
}
const BAR_COLORS: Record<OptionColor, string> = {
  default: '#9b9a97',
  gray: '#9b9a97',
  brown: '#a27763',
  orange: '#e9893b',
  yellow: '#dfab01',
  green: '#4dab6f',
  blue: '#2f80ed',
  purple: '#9a6dd7',
  pink: '#e255a1',
  red: '#e5484d',
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
}

function chip(name: string, color: OptionColor): string {
  const [bg, fg] = PRINT_COLORS[color] ?? PRINT_COLORS.default
  return `<span class="chip" style="background:${bg};color:${fg}">${esc(name)}</span>`
}

function cellHtml(ctx: ResolveCtx, db: DatabaseDef, row: DbRow, prop: PropertyDef, people: ExportPerson[]): string {
  if (prop.type === 'select' || prop.type === 'status') {
    const opt = findOption(prop, row.values[prop.id])
    return opt ? chip(opt.name, opt.color) : ''
  }
  if (prop.type === 'multi_select') {
    const ids = row.values[prop.id]
    return (Array.isArray(ids) ? ids : [])
      .map((id) => findOption(prop, id))
      .filter((o): o is NonNullable<typeof o> => !!o)
      .map((o) => chip(o.name, o.color))
      .join(' ')
  }
  if (prop.type === 'checkbox') return row.values[prop.id] === true ? '✓' : ''
  const text = esc(cellText(ctx, db, row, prop, people))
  if (prop.type === 'title') return `<strong>${text}</strong>`
  return text.replace(/\n/g, '<br>')
}

const DAY = 86_400_000
const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sept', 'oct', 'nov', 'dic']

function dayNum(iso: string): number {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  return Math.round(Date.UTC(y, m - 1, d) / DAY)
}

/** Gantt chart of a timeline view as HTML (percent positions, prints well). */
function ganttHtml(ctx: ResolveCtx, db: DatabaseDef, view: ViewDef, rows: DbRow[]): string {
  const startProp = view.dateProperty ? getProperty(db, view.dateProperty) : undefined
  if (!startProp) return ''
  const endProp = view.endDateProperty ? getProperty(db, view.endDateProperty) : undefined
  const statusProp =
    db.properties.find((p) => p.type === 'status') ?? db.properties.find((p) => p.type === 'select' && /estado|status|etapa/i.test(p.name))

  const spans = rows.map((r) => {
    const s = resolveValue(ctx, db, r, startProp)
    const e = endProp ? resolveValue(ctx, db, r, endProp) : null
    const a = typeof s === 'string' && s ? dayNum(s) : null
    const b = typeof e === 'string' && e ? dayNum(e) : null
    if (a === null && b === null) return null
    return { start: Math.min(a ?? b!, b ?? a!), end: Math.max(a ?? b!, b ?? a!) }
  })
  const dated = spans.filter((s): s is { start: number; end: number } => !!s)
  if (!dated.length) return ''

  const today = dayNum(todayISO())
  const first = new Date(Math.min(...dated.map((s) => s.start)) * DAY)
  const last = new Date(Math.max(...dated.map((s) => s.end)) * DAY)
  const from = Math.round(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), 1) / DAY)
  const to = Math.round(Date.UTC(last.getUTCFullYear(), last.getUTCMonth() + 1, 0) / DAY)
  const total = to - from + 1
  const pct = (n: number) => `${((n - from) / total) * 100}%`

  let months = ''
  for (let n = from; n <= to; ) {
    const d = new Date(n * DAY)
    const next = Math.round(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1) / DAY)
    const label = `${MONTHS[d.getUTCMonth()]}${d.getUTCMonth() === 0 || n === from ? ` ${d.getUTCFullYear()}` : ''}`
    months += `<div class="g-month" style="left:${pct(n)};width:${((next - n) / total) * 100}%">${label}</div>`
    n = next
  }

  const lines = rows
    .map((r, i) => {
      const s = spans[i]
      const title = esc(`${r.icon ? `${r.icon} ` : ''}${r.title || 'Sin título'}`)
      if (!s) return `<div class="g-row"><div class="g-label">${title}</div><div class="g-track"><span class="g-none">sin fecha</span></div></div>`
      const opt = statusProp ? findOption(statusProp, r.values[statusProp.id]) : undefined
      const color = BAR_COLORS[opt?.color ?? 'blue']
      const width = `${((s.end - s.start + 1) / total) * 100}%`
      return `<div class="g-row"><div class="g-label">${title}</div><div class="g-track"><div class="g-bar" style="left:${pct(s.start)};width:${width};background:${color}"></div></div></div>`
    })
    .join('')

  const todayLine =
    today >= from && today <= to ? `<div class="g-today" style="left:calc(var(--label) + (100% - var(--label)) * ${(today - from + 0.5) / total})"></div>` : ''

  return `<section class="gantt"><div class="g-head"><div class="g-label"></div><div class="g-track">${months}</div></div><div class="g-body">${lines}${todayLine}</div></section>`
}

/* ------------------------- Layouts per view type ------------------------- */

type LayoutArgs = { ctx: ResolveCtx; db: DatabaseDef; view: ViewDef; rows: DbRow[]; people: ExportPerson[] }

function rowTitleHtml(r: DbRow): string {
  return esc(`${r.icon ? `${r.icon} ` : ''}${r.title || 'Sin título'}`)
}

/** Visible non-title properties with something to show for this row. */
function shownValues({ ctx, db, view, people }: LayoutArgs, r: DbRow, skip: (string | undefined)[] = []): string[] {
  return view.visibleProperties
    .map((id) => getProperty(db, id))
    .filter((p): p is PropertyDef => !!p && p.type !== 'title' && !skip.includes(p.id))
    .map((p) => cellHtml(ctx, db, r, p, people))
    .filter((h) => h !== '')
}

function tableHtml({ ctx, db, view, rows, people }: LayoutArgs): string {
  const cols = exportColumns(db, view)
  const head = cols.map((p) => `<th>${esc(p.name)}</th>`).join('')
  const body = rows.map((r) => `<tr>${cols.map((p) => `<td>${cellHtml(ctx, db, r, p, people)}</td>`).join('')}</tr>`).join('')
  return `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`
}

function cardHtml(a: LayoutArgs, r: DbRow, skip: (string | undefined)[] = [], cover?: string | null): string {
  const vals = shownValues(a, r, skip)
    .map((h) => `<div class="val">${h}</div>`)
    .join('')
  const inner = `<div class="title">${rowTitleHtml(r)}</div>${vals}`
  if (cover === undefined) return `<div class="card">${inner}</div>`
  const bg = cover ? ` style="background-image:url('${esc(cover)}')"` : ''
  return `<div class="card has-cover"><div class="cover"${bg}></div><div class="inner">${inner}</div></div>`
}

/** Board: one section per group (option of the "group by" property). */
function boardHtml(a: LayoutArgs): string {
  const { ctx, db, view, rows, people } = a
  const prop = view.groupBy ? getProperty(db, view.groupBy) : undefined
  if (!prop) return `<div class="cards">${rows.map((r) => cardHtml(a, r)).join('')}</div>`

  type G = { key: string; head: string }
  const groups: G[] = []
  if (prop.type === 'checkbox') {
    groups.push({ key: 'true', head: '✅ Marcada' }, { key: '__none', head: '<span class="muted">Sin marcar</span>' })
  } else if (prop.type === 'person') {
    groups.push({ key: '__none', head: `<span class="muted">Sin ${esc(prop.name.toLowerCase())}</span>` })
    for (const p of people) groups.push({ key: p.id, head: esc(p.name || p.email) })
  } else {
    groups.push({ key: '__none', head: `<span class="muted">Sin ${esc(prop.name.toLowerCase())}</span>` })
    for (const o of prop.options ?? []) groups.push({ key: o.id, head: chip(o.name, o.color) })
  }
  const by = new Map<string, DbRow[]>(groups.map((g) => [g.key, []]))
  for (const r of rows) {
    const v = resolveValue(ctx, db, r, prop)
    let key = '__none'
    if (prop.type === 'checkbox') key = v === true ? 'true' : '__none'
    else if (Array.isArray(v)) key = v[0] ?? '__none'
    else if (typeof v === 'string' && v) key = v
    ;(by.get(key) ?? by.get('__none'))!.push(r)
  }
  // Columns side by side, like on screen (wrapping after 5).
  const shown = groups.filter((g) => by.get(g.key)!.length > 0)
  const cols = Math.min(Math.max(shown.length, 1), 5)
  return `<div class="board" style="grid-template-columns:repeat(${cols},minmax(0,1fr))">${shown
    .map((g) => {
      const list = by.get(g.key)!
      return `<section class="column"><div class="group-head">${g.head}<span class="count">${list.length}</span></div>${list
        .map((r) => cardHtml(a, r, [prop.id]))
        .join('')}</section>`
    })
    .join('')}</div>`
}

function galleryHtml(a: LayoutArgs): string {
  const { view, rows } = a
  return `<div class="cards gallery">${rows
    .map((r) => cardHtml(a, r, [view.coverProperty], view.coverProperty ? imageSrcFromLink(r.values[view.coverProperty]) : undefined))
    .join('')}</div>`
}

function listHtml(a: LayoutArgs): string {
  return `<div class="list">${a.rows
    .map((r) => `<div class="item"><span class="title">${rowTitleHtml(r)}</span><span class="vals">${shownValues(a, r).join('<span class="muted">·</span>')}</span></div>`)
    .join('')}</div>`
}

const LONG_MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const CAL_MAX_PER_DAY = 5

/** Calendar: a month grid (Monday first) per month that has items. */
function calendarHtml({ ctx, db, view, rows }: LayoutArgs): string {
  const dateProp = view.dateProperty ? getProperty(db, view.dateProperty) : undefined
  if (!dateProp) return '<p class="empty">La vista no tiene una propiedad de fecha.</p>'
  const colorProp =
    view.visibleProperties.map((id) => getProperty(db, id)).find((p) => p && (p.type === 'select' || p.type === 'status')) ??
    db.properties.find((p) => p.type === 'status' || p.type === 'select')

  const byDay = new Map<number, DbRow[]>()
  for (const r of rows) {
    const v = resolveValue(ctx, db, r, dateProp)
    if (typeof v !== 'string' || !v) continue
    const n = dayNum(v)
    byDay.set(n, [...(byDay.get(n) ?? []), r])
  }
  const today = dayNum(todayISO())
  const days = [...byDay.keys()]
  const first = new Date((days.length ? Math.min(...days) : today) * DAY)
  const last = new Date((days.length ? Math.max(...days) : today) * DAY)
  const months: { y: number; m: number }[] = []
  for (let y = first.getUTCFullYear(), m = first.getUTCMonth(); y < last.getUTCFullYear() || (y === last.getUTCFullYear() && m <= last.getUTCMonth()); ) {
    months.push({ y, m })
    if (++m === 12) {
      m = 0
      y++
    }
    if (months.length >= 24) break
  }

  const undated = rows.length - [...byDay.values()].reduce((s, l) => s + l.length, 0)
  const head = ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'].map((d) => `<th>${d}</th>`).join('')

  const grids = months.map(({ y, m }) => {
    const start = Math.round(Date.UTC(y, m, 1) / DAY)
    const end = Math.round(Date.UTC(y, m + 1, 0) / DAY)
    const gridStart = start - ((new Date(start * DAY).getUTCDay() + 6) % 7)
    const weeks: string[] = []
    for (let w = gridStart; w <= end; w += 7) {
      const cells = Array.from({ length: 7 }, (_, i) => {
        const n = w + i
        const d = new Date(n * DAY)
        const items = n < start || n > end ? [] : (byDay.get(n) ?? [])
        const evs = items
          .slice(0, CAL_MAX_PER_DAY)
          .map((r) => {
            const opt = colorProp ? findOption(colorProp, r.values[colorProp.id]) : undefined
            const [bg, fg] = PRINT_COLORS[opt?.color ?? 'blue']
            return `<span class="ev" style="background:${bg};color:${fg}">${rowTitleHtml(r)}</span>`
          })
          .join('')
        const more = items.length > CAL_MAX_PER_DAY ? `<span class="more">${items.length - CAL_MAX_PER_DAY} más</span>` : ''
        const cls = [n < start || n > end ? 'out' : i >= 5 ? 'wknd' : ''].filter(Boolean).join(' ')
        return `<td class="${cls}"><div class="num${n === today ? ' today' : ''}"><span>${d.getUTCDate()}</span></div>${evs}${more}</td>`
      })
      weeks.push(`<tr>${cells.join('')}</tr>`)
    }
    return `<section class="month"><h2>${LONG_MONTHS[m]} ${y}</h2><table class="cal"><thead><tr>${head}</tr></thead><tbody>${weeks.join('')}</tbody></table></section>`
  })
  const note = undated > 0 ? `<p class="muted">${undated} ${undated === 1 ? 'fila sin fecha' : 'filas sin fecha'} (no aparecen en el calendario).</p>` : ''
  return grids.join('') + note
}

/** Full printable document for a view. */
export function viewPrintHtml(opts: {
  ctx: ResolveCtx
  db: DatabaseDef
  view: ViewDef
  rows: DbRow[]
  people: ExportPerson[]
  pageTitle?: string
  docTitle: string
}): string {
  const { ctx, db, view, rows, people } = opts
  const generated = new Intl.DateTimeFormat('es-AR', { dateStyle: 'long', timeStyle: 'short' }).format(new Date())
  const filtered = view.filters.length ? ` · ${view.filters.length} ${view.filters.length === 1 ? 'filtro' : 'filtros'}` : ''
  const p: LayoutArgs = { ctx, db, view, rows, people }
  let content: string
  if (!rows.length) content = '<p class="empty">No hay filas en esta vista.</p>'
  else if (view.type === 'board') content = boardHtml(p)
  else if (view.type === 'gallery') content = galleryHtml(p)
  else if (view.type === 'list') content = listHtml(p)
  else if (view.type === 'calendar') content = calendarHtml(p)
  else if (view.type === 'timeline') content = ganttHtml(ctx, db, view, rows) + `<h2 class="detail">Detalle</h2>` + tableHtml(p)
  else content = tableHtml(p)

  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><title>${esc(opts.docTitle)}</title>
<style>
@page { size: A4 landscape; margin: 12mm; }
* { box-sizing: border-box; }
body { margin: 0; font: 10px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", Inter, Roboto, sans-serif; color: #1d1d1f; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
header { display: flex; align-items: flex-end; justify-content: space-between; gap: 16px; border-bottom: 2px solid #1d1d1f; padding-bottom: 6px; margin-bottom: 10px; }
h1 { margin: 0; font-size: 18px; letter-spacing: -0.01em; }
.sub { color: #6e6e73; font-size: 10px; margin-top: 2px; }
.meta { color: #6e6e73; font-size: 9px; text-align: right; white-space: nowrap; }
table { width: 100%; border-collapse: collapse; table-layout: auto; }
thead { display: table-header-group; }
th { text-align: left; font-weight: 600; font-size: 9px; text-transform: uppercase; letter-spacing: 0.03em; color: #6e6e73; background: #f5f5f7; border-bottom: 1px solid #d2d2d7; padding: 5px 6px; }
td { border-bottom: 1px solid #e5e5ea; padding: 5px 6px; vertical-align: top; word-break: break-word; }
tr { break-inside: avoid; }
.chip { display: inline-block; border-radius: 4px; padding: 0 5px; font-size: 9px; line-height: 15px; white-space: nowrap; margin: 1px 0; }
.empty { text-align: center; color: #6e6e73; padding: 20px; }
.gantt { --label: 30%; margin-bottom: 14px; break-inside: avoid; }
.g-head, .g-row { display: flex; }
.g-label { width: var(--label); flex: none; padding: 3px 8px 3px 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.g-track { position: relative; flex: 1; align-self: stretch; }
.g-head { border-bottom: 1px solid #d2d2d7; height: 18px; }
.g-month { position: absolute; top: 0; height: 18px; border-left: 1px solid #d2d2d7; padding-left: 4px; font-size: 9px; color: #6e6e73; text-transform: capitalize; }
.g-body { position: relative; }
.g-row { border-bottom: 1px solid #f0f0f2; height: 20px; align-items: center; }
.g-bar { position: absolute; top: 4px; height: 12px; border-radius: 3px; min-width: 3px; }
.g-none { color: #aeaeb2; font-size: 9px; padding-left: 4px; }
.g-today { position: absolute; top: 0; bottom: 0; width: 1px; background: #ff3b30; }
h2.detail { font-size: 11px; margin: 16px 0 6px; color: #6e6e73; text-transform: uppercase; letter-spacing: 0.04em; }
/* Board / gallery cards */
.group { margin-bottom: 14px; }
.group-head { display: flex; align-items: center; gap: 6px; margin-bottom: 6px; font-size: 11px; font-weight: 600; break-after: avoid; }
.group-head .count { color: #6e6e73; font-weight: 400; }
.board { display: grid; gap: 10px; align-items: start; }
.column { background: #f7f7f8; border-radius: 10px; padding: 6px; }
.column .card { margin-bottom: 6px; }
.cards { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; }
.cards.gallery { grid-template-columns: repeat(4, minmax(0, 1fr)); }
.card { border: 1px solid #d2d2d7; border-radius: 8px; padding: 7px 8px; break-inside: avoid; background: #fff; overflow: hidden; }
.card.has-cover { padding: 0; }
.card .cover { height: 90px; background: #f5f5f7 center / cover no-repeat; }
.card .inner { padding: 7px 8px; }
.card .title { font-weight: 600; font-size: 10.5px; margin-bottom: 3px; }
.card .val { margin-top: 3px; color: #3a3a3c; display: -webkit-box; -webkit-line-clamp: 4; -webkit-box-orient: vertical; overflow: hidden; }
.muted { color: #8e8e93; }
/* List */
.list .item { display: flex; gap: 10px; align-items: baseline; border-bottom: 1px solid #e5e5ea; padding: 5px 2px; break-inside: avoid; }
.list .item .title { font-weight: 600; flex: none; max-width: 40%; }
.list .item .vals { display: flex; flex-wrap: wrap; gap: 4px 12px; color: #3a3a3c; }
/* Calendar */
.month { break-inside: avoid; margin-bottom: 12px; }
.month + .month { break-before: page; }
.month h2 { font-size: 15px; margin: 0 0 6px; text-transform: capitalize; }
.cal { width: 100%; border-collapse: collapse; table-layout: fixed; }
.cal th { text-align: right; background: none; border: 0; border-bottom: 1px solid #d2d2d7; }
.cal td { height: 78px; border: 1px solid #e5e5ea; padding: 3px; vertical-align: top; }
.cal td.out { background: #fafafa; color: #aeaeb2; }
.cal td.wknd { background: #fafafa; }
.cal .num { text-align: right; font-size: 10px; margin-bottom: 2px; }
.cal .num.today span { background: #ff3b30; color: #fff; border-radius: 9px; padding: 0 5px; font-weight: 600; }
.ev { display: block; border-radius: 3px; padding: 1px 4px; margin-bottom: 2px; font-size: 8.5px; line-height: 12px; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.cal .more { font-size: 8px; color: #6e6e73; }
</style></head>
<body>
<header>
  <div>
    <h1>${esc(`${db.icon ? `${db.icon} ` : ''}${db.title}`)}</h1>
    <div class="sub">${esc([opts.pageTitle, view.name].filter(Boolean).join(' · '))}</div>
  </div>
  <div class="meta">${rows.length} ${rows.length === 1 ? 'fila' : 'filas'}${filtered}<br>${esc(generated)}</div>
</header>
${content}
</body></html>`
}

/**
 * Opens the print dialog for an HTML document (choose "Guardar como PDF").
 * Uses a hidden iframe so no pop-up blocker gets in the way.
 */
export function printHtml(html: string, fileName: string) {
  const iframe = document.createElement('iframe')
  iframe.setAttribute('aria-hidden', 'true')
  iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden'
  document.body.appendChild(iframe)
  const prevTitle = document.title
  const cleanup = () => {
    document.title = prevTitle
    setTimeout(() => iframe.remove(), 500)
  }
  iframe.onload = () => {
    const win = iframe.contentWindow
    if (!win) return cleanup()
    // Chrome/Safari suggest the page title as the PDF file name.
    document.title = fileName
    win.addEventListener('afterprint', cleanup, { once: true })
    win.focus()
    win.print()
    // Safari doesn't always fire afterprint.
    setTimeout(() => {
      if (document.title === fileName) document.title = prevTitle
    }, 60_000)
  }
  iframe.srcdoc = html
}

/** 'Base de datos - Tabla - 2026-11-18' without characters files can't have. */
export function exportFileName(db: DatabaseDef, view: ViewDef): string {
  return `${db.title} - ${view.name} - ${todayISO()}`.replace(/[\\/:*?"<>|]+/g, '-').trim()
}
