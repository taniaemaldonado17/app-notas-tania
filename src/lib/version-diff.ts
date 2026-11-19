import type { PageSnapshot, SnapCard, SnapRow } from '@/lib/versions'
import { sameJson } from '@/lib/stable-json'

export type ItemChange = {
  kind: 'row' | 'card'
  id: string
  title: string
  icon: string | null
  /** Database or column it belongs to (in the saved version when it exists there). */
  where: string
  /** deleted: was there, now gone · added: created since · changed: edited since */
  status: 'deleted' | 'added' | 'changed'
  /** What changed (for status 'changed'). */
  fields: string[]
}

export type VersionDiff = {
  items: ItemChange[]
  /** Other differences, in words (page title, columns of a table, views…). */
  other: string[]
}

const same = sameJson
const propName = (props: unknown, id: string) =>
  (Array.isArray(props) ? (props as { id?: string; name?: string }[]) : []).find((p) => p.id === id)?.name ?? 'una propiedad'

/** Differences between a saved version and the page as it is now. */
export function diffSnapshots(version: PageSnapshot, current: PageSnapshot): VersionDiff {
  const items: ItemChange[] = []
  const other: string[] = []

  if (version.page.title !== current.page.title) other.push(`El título de la página era «${version.page.title}»`)
  if (version.page.icon !== current.page.icon || version.page.coverUrl !== current.page.coverUrl || version.page.subtitle !== current.page.subtitle)
    other.push('El ícono, la portada o la descripción de la página eran distintos')
  if (!same(version.page.layout, current.page.layout)) other.push('La disposición de las secciones era distinta')

  /* Databases */
  const curDbs = new Map(current.databases.map((d) => [d.id, d]))
  const verDbs = new Map(version.databases.map((d) => [d.id, d]))
  for (const d of current.databases) if (!verDbs.has(d.id)) other.push(`La base «${d.title}» no existía (se creó después)`)
  for (const d of version.databases) {
    const cur = curDbs.get(d.id)
    if (!cur) other.push(`La base «${d.title}» se borró después (con ${d.rows.length} filas)`)
    else {
      if (d.title !== cur.title || d.icon !== cur.icon) other.push(`La base «${cur.title}» se llamaba «${d.title}»`)
      if (!same(d.properties, cur.properties)) other.push(`Las columnas de «${d.title}» eran distintas`)
      if (!same(d.views, cur.views)) other.push(`Las vistas (filtros, orden, anchos) de «${d.title}» eran distintas`)
    }
    const curRows = new Map((cur?.rows ?? []).map((r) => [r.id, r]))
    for (const r of d.rows) {
      const now = curRows.get(r.id)
      if (!now) {
        items.push({ kind: 'row', id: r.id, title: r.title, icon: r.icon, where: d.title, status: 'deleted', fields: [] })
        continue
      }
      const fields = rowFields(r, now, d.properties)
      if (fields.length) items.push({ kind: 'row', id: r.id, title: r.title, icon: r.icon, where: d.title, status: 'changed', fields })
    }
    if (cur) {
      const ids = new Set(d.rows.map((r) => r.id))
      for (const r of cur.rows)
        if (!ids.has(r.id)) items.push({ kind: 'row', id: r.id, title: r.title, icon: r.icon, where: cur.title, status: 'added', fields: [] })
    }
  }

  /* Board columns and cards */
  const curCols = new Map(current.columns.map((c) => [c.id, c]))
  const verCols = new Map(version.columns.map((c) => [c.id, c]))
  const curCards = new Map(current.columns.flatMap((c) => c.cards.map((k) => [k.id, { card: k, column: c.title, columnId: c.id }] as const)))
  const verCardIds = new Set(version.columns.flatMap((c) => c.cards.map((k) => k.id)))
  for (const c of current.columns) if (!verCols.has(c.id)) other.push(`La columna «${c.title}» no existía (se creó después)`)
  for (const c of version.columns) {
    const cur = curCols.get(c.id)
    if (!cur) other.push(`La columna «${c.title}» se borró después`)
    else if (cur.title !== c.title || cur.accentColor !== c.accentColor) other.push(`La columna «${cur.title}» se llamaba «${c.title}»`)
    for (const k of c.cards) {
      const now = curCards.get(k.id)
      if (!now) {
        items.push({ kind: 'card', id: k.id, title: k.title, icon: k.icon, where: c.title, status: 'deleted', fields: [] })
        continue
      }
      const fields = cardFields(k, now.card)
      if (now.columnId !== c.id) fields.push(`columna (estaba en «${c.title}»)`)
      if (fields.length) items.push({ kind: 'card', id: k.id, title: k.title, icon: k.icon, where: c.title, status: 'changed', fields })
    }
  }
  for (const [id, now] of curCards)
    if (!verCardIds.has(id)) items.push({ kind: 'card', id, title: now.card.title, icon: now.card.icon, where: now.column, status: 'added', fields: [] })

  return { items, other }
}

function rowFields(was: SnapRow, now: SnapRow, props: unknown): string[] {
  const out: string[] = []
  if (was.title !== now.title) out.push(`título (era «${was.title || 'Sin título'}»)`)
  if (was.icon !== now.icon) out.push('ícono')
  if ((was.content ?? '') !== (now.content ?? '')) out.push('contenido de la página')
  const a = (was.values ?? {}) as Record<string, unknown>
  const b = (now.values ?? {}) as Record<string, unknown>
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) if (!same(a[k] ?? null, b[k] ?? null)) out.push(propName(props, k))
  if (!out.length && was.position !== now.position) out.push('orden')
  return out
}

function cardFields(was: SnapCard, now: SnapCard): string[] {
  const out: string[] = []
  if (was.title !== now.title) out.push(`título (era «${was.title}»)`)
  if ((was.description ?? '') !== (now.description ?? '')) out.push('contenido')
  if (!same(was.checklist, now.checklist)) out.push('checklist')
  if (!same(was.attachments, now.attachments)) out.push('adjuntos')
  if (was.coverUrl !== now.coverUrl || was.accentColor !== now.accentColor || was.icon !== now.icon) out.push('portada, color o ícono')
  if (!out.length && was.position !== now.position) out.push('orden')
  return out
}
