'use client'

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createReactBlockSpec } from '@blocknote/react'
import { CalendarRange, ChevronLeft, ChevronRight, ListPlus, Plus, Trash2 } from 'lucide-react'
import { personName, useEditorPeople } from '@/components/editor-people'

/* ------------------------------- Data ------------------------------------ */

type Item = { id: string; name: string; start: string; end: string; done?: boolean; person?: string }
type Zoom = 'week' | 'month'
type TimelineProps = { items: string; zoom: string }
type TLBlock = { id: string; props: TimelineProps }
type DocNode = { id: string; type: string; props?: Record<string, unknown>; content?: unknown; children?: DocNode[] }
type TLEditor = {
  isEditable: boolean
  document: DocNode[]
  getBlock: (id: string) => { props?: Record<string, unknown> } | undefined
  updateBlock: (id: string, update: { props: Partial<TimelineProps> }) => void
  removeBlocks: (ids: string[]) => void
}

const DAY = 86_400_000
const ROW = 34
const PX: Record<Zoom, number> = { week: 30, month: 11 }
const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

const dayNum = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number)
  return Math.floor(Date.UTC(y, m - 1, d) / DAY)
}
const isoOf = (n: number) => new Date(n * DAY).toISOString().slice(0, 10)
const todayNum = () => {
  const t = new Date()
  return Math.floor(Date.UTC(t.getFullYear(), t.getMonth(), t.getDate()) / DAY)
}
const validIso = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)
const shortDate = (iso: string) => {
  const [, m, d] = iso.split('-').map(Number)
  return `${d}/${m}`
}
const newItemId = () => Math.random().toString(36).slice(2, 10)

function parseItems(raw: unknown): Item[] {
  if (typeof raw !== 'string') return []
  try {
    const list = JSON.parse(raw)
    if (!Array.isArray(list)) return []
    return list
      .filter((x) => x && typeof x === 'object' && typeof x.id === 'string')
      .map((x) => ({
        id: x.id,
        name: typeof x.name === 'string' ? x.name : '',
        start: validIso(x.start) ? x.start : '',
        end: validIso(x.end) ? x.end : '',
        done: !!x.done,
        person: typeof x.person === 'string' ? x.person : undefined,
      }))
  } catch {
    return []
  }
}

/** Text of a block without the @mentions, plus the first person mentioned. */
function textAndPerson(content: unknown): { text: string; person?: string } {
  let person: string | undefined
  const walk = (c: unknown): string => {
    if (typeof c === 'string') return c
    if (!Array.isArray(c)) return ''
    return c
      .map((n) => {
        if (!n || typeof n !== 'object') return ''
        const node = n as { type?: string; text?: string; content?: unknown; props?: { userId?: string } }
        if (node.type === 'mention') {
          person ??= node.props?.userId || undefined
          return ''
        }
        if (typeof node.text === 'string') return node.text
        return walk(node.content)
      })
      .join('')
  }
  const text = walk(content).replace(/\s+/g, ' ').replace(/[\s:(]+$/, '').replace(/\(\s*\)/g, '').trim()
  return { text, person }
}

/** Toggles, headings and to-dos of the note, as candidate tasks. */
function noteTasks(doc: DocNode[]) {
  const out: { key: string; name: string; person?: string; done: boolean; depth: number; heading: boolean }[] = []
  const walk = (blocks: DocNode[] | undefined, depth: number) => {
    for (const b of blocks ?? []) {
      if (['toggleListItem', 'checkListItem', 'heading'].includes(b.type)) {
        const { text, person } = textAndPerson(b.content)
        if (text) out.push({ key: b.id, name: text.slice(0, 200), person, done: b.type === 'checkListItem' && !!b.props?.checked, depth, heading: b.type === 'heading' })
      }
      walk(b.children, depth + 1)
    }
  }
  walk(doc, 0)
  return out
}

/* ------------------------------- Block ----------------------------------- */

export const TimelineBlock = createReactBlockSpec(
  {
    type: 'timeline',
    propSchema: {
      items: { default: '[]' },
      zoom: { default: 'week' },
    },
    content: 'none',
  },
  {
    render: (p) => <TimelineBlockView block={p.block as unknown as TLBlock} editor={p.editor as unknown as TLEditor} />,
    toExternalHTML: (p) => (
      <table>
        <tbody>
          {parseItems((p.block.props as TimelineProps).items).map((it) => (
            <tr key={it.id}>
              <td>{it.done ? '☑' : '☐'} {it.name}</td>
              <td>{it.start}</td>
              <td>{it.end}</td>
            </tr>
          ))}
        </tbody>
      </table>
    ),
  }
)

type Drag = { id: string; mode: 'move' | 'start' | 'end'; x0: number; s0: number; e0: number; s: number; e: number; moved: boolean }

function TimelineBlockView({ block, editor }: { block: TLBlock; editor: TLEditor }) {
  const editable = editor.isEditable
  const people = useEditorPeople()
  const items = parseItems(block.props.items)
  const zoom: Zoom = block.props.zoom === 'month' ? 'month' : 'week'
  const px = PX[zoom]
  const today = todayNum()
  const scrollRef = useRef<HTMLDivElement>(null)
  const [drag, setDrag] = useState<Drag | null>(null)
  const [editingDates, setEditingDates] = useState<string | null>(null)
  const [picking, setPicking] = useState(false)
  const [scrollLeft, setScrollLeft] = useState(0)

  const latest = () => parseItems(editor.getBlock(block.id)?.props?.items)
  const save = (list: Item[]) => editor.updateBlock(block.id, { props: { items: JSON.stringify(list) } })
  const patch = (id: string, change: Partial<Item>) => save(latest().map((it) => (it.id === id ? { ...it, ...change } : it)))

  // Visible range: all dates plus today, with some margin, starting on a Monday.
  const range = useMemo(() => {
    const nums = items.flatMap((it) => [it.start, it.end]).filter(validIso).map(dayNum)
    let from = Math.min(today, ...nums) - 7
    const to = Math.max(today + 21, ...nums.map((n) => n + 14))
    from -= (new Date(from * DAY).getUTCDay() + 6) % 7 // back to Monday
    return { from, days: to - from + 1 }
  }, [items, today])

  const x = (n: number) => (n - range.from) * px

  function scrollToToday(smooth = true) {
    const el = scrollRef.current
    if (!el) return
    el.scrollTo({ left: Math.max(0, x(today) - el.clientWidth / 3), behavior: smooth ? 'smooth' : 'auto' })
  }
  useLayoutEffect(() => scrollToToday(false), [zoom])  

  // Keep the editor from selecting the block when clicking our controls
  // (keys typed in inputs are already ignored by the editor).
  const rootRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = rootRef.current
    if (!el) return
    const stop = (e: Event) => {
      if ((e.target as HTMLElement).closest?.('input, select, button, .tl-bar')) e.stopPropagation()
    }
    el.addEventListener('mousedown', stop)
    return () => {
      el.removeEventListener('mousedown', stop)
    }
  }, [])

  function addItem(name = '') {
    save([...latest(), { id: newItemId(), name, start: isoOf(today), end: isoOf(today + 6) }])
  }

  function startDrag(e: React.PointerEvent, it: Item, mode: Drag['mode']) {
    if (!editable || !it.start || !it.end) return
    e.preventDefault()
    e.stopPropagation()
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    const s0 = dayNum(it.start)
    const e0 = dayNum(it.end)
    setDrag({ id: it.id, mode, x0: e.clientX, s0, e0, s: s0, e: e0, moved: false })
  }
  function moveDrag(e: React.PointerEvent) {
    if (!drag) return
    const d = Math.round((e.clientX - drag.x0) / px)
    let s = drag.s0
    let en = drag.e0
    if (drag.mode === 'move') {
      s += d
      en += d
    } else if (drag.mode === 'start') s = Math.min(drag.s0 + d, drag.e0)
    else en = Math.max(drag.e0 + d, drag.s0)
    if (s !== drag.s || en !== drag.e) setDrag({ ...drag, s, e: en, moved: true })
  }
  function endDrag() {
    if (!drag) return
    if (drag.moved) patch(drag.id, { start: isoOf(drag.s), end: isoOf(drag.e) })
    setDrag(null)
  }

  // Header: months and days.
  const monthMarks: { left: number; label: string }[] = []
  const dayMarks: { left: number; label: string; weekend: boolean; monday: boolean }[] = []
  for (let n = range.from; n < range.from + range.days; n++) {
    const d = new Date(n * DAY)
    const dom = d.getUTCDate()
    const dow = d.getUTCDay()
    if (dom === 1 || n === range.from) monthMarks.push({ left: x(n), label: `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}` })
    dayMarks.push({ left: x(n), label: String(dom), weekend: dow === 0 || dow === 6, monday: dow === 1 })
  }
  const width = range.days * px

  const candidates = picking ? noteTasks(editor.document).filter((c) => !items.some((it) => it.name === c.name)) : []

  return (
    <div ref={rootRef} className="tl-block" contentEditable={false}>
      <div className="tl-toolbar">
        <span className="tl-title">
          <CalendarRange size={15} /> Cronograma
        </span>
        <div className="tl-seg">
          {(['week', 'month'] as Zoom[]).map((z) => (
            <button key={z} type="button" data-active={zoom === z || undefined} onClick={() => editor.updateBlock(block.id, { props: { zoom: z } })}>
              {z === 'week' ? 'Semanas' : 'Meses'}
            </button>
          ))}
        </div>
        <button type="button" onClick={() => scrollRef.current?.scrollBy({ left: -7 * px * (zoom === 'week' ? 1 : 4), behavior: 'smooth' })} aria-label="Antes">
          <ChevronLeft size={15} />
        </button>
        <button type="button" onClick={() => scrollToToday()}>Hoy</button>
        <button type="button" onClick={() => scrollRef.current?.scrollBy({ left: 7 * px * (zoom === 'week' ? 1 : 4), behavior: 'smooth' })} aria-label="Después">
          <ChevronRight size={15} />
        </button>
        {editable && (
          <span className="tl-actions">
            <button type="button" onClick={() => setPicking((v) => !v)} data-active={picking || undefined} title="Elegí tareas que ya escribiste en esta nota">
              <ListPlus size={15} /> Traer de la nota
            </button>
            <button type="button" onClick={() => addItem()}>
              <Plus size={15} /> Tarea
            </button>
            <button type="button" onClick={() => window.confirm('¿Eliminar el cronograma?') && editor.removeBlocks([block.id])} title="Eliminar cronograma" aria-label="Eliminar cronograma">
              <Trash2 size={14} />
            </button>
          </span>
        )}
      </div>

      {picking && (
        <NotePicker
          candidates={candidates}
          onCancel={() => setPicking(false)}
          onAdd={(chosen) => {
            const base = latest()
            save([
              ...base,
              ...chosen.map((c) => ({ id: newItemId(), name: c.name, start: isoOf(today), end: isoOf(today + 6), done: c.done, person: c.person })),
            ])
            setPicking(false)
          }}
        />
      )}

      <div className="tl-grid">
        {/* Left: task list */}
        <div className="tl-left">
          <div className="tl-head tl-left-head">
            <span>Tarea</span>
            <span>Resp.</span>
            <span>Fechas</span>
          </div>
          {items.map((it) => (
            <div key={it.id} className="tl-row" style={{ height: ROW }}>
              <input
                type="checkbox"
                checked={!!it.done}
                disabled={!editable}
                onChange={(e) => patch(it.id, { done: e.target.checked })}
                aria-label="Hecha"
              />
              <NameInput value={it.name} disabled={!editable} done={!!it.done} onSave={(name) => patch(it.id, { name })} />
              <select
                className="tl-person"
                value={it.person ?? ''}
                disabled={!editable}
                onChange={(e) => patch(it.id, { person: e.target.value || undefined })}
                title="Responsable"
              >
                <option value="">—</option>
                {people.map((p) => (
                  <option key={p.id} value={p.id}>
                    {personName(p).split(' ')[0]}
                  </option>
                ))}
              </select>
              <span className="tl-dates-cell">
                <button type="button" className="tl-dates" disabled={!editable} onClick={() => setEditingDates(editingDates === it.id ? null : it.id)}>
                  {it.start ? `${shortDate(it.start)} → ${shortDate(it.end || it.start)}` : 'Sin fecha'}
                </button>
                {editingDates === it.id && (
                  <span className="tl-date-pop">
                    <label>
                      Inicio
                      <input
                        type="date"
                        value={it.start}
                        onChange={(e) => {
                          const v = e.target.value
                          if (!validIso(v)) return
                          patch(it.id, { start: v, end: it.end && it.end >= v ? it.end : v })
                        }}
                      />
                    </label>
                    <label>
                      Fin
                      <input
                        type="date"
                        value={it.end}
                        min={it.start || undefined}
                        onChange={(e) => {
                          const v = e.target.value
                          if (!validIso(v)) return
                          patch(it.id, { end: v, start: it.start && it.start <= v ? it.start : v })
                        }}
                      />
                    </label>
                    <button type="button" className="primary" onClick={() => setEditingDates(null)}>
                      Listo
                    </button>
                  </span>
                )}
              </span>
              {editable && (
                <button type="button" className="tl-del" onClick={() => save(latest().filter((x) => x.id !== it.id))} title="Quitar tarea" aria-label="Quitar tarea">
                  <Trash2 size={13} />
                </button>
              )}
            </div>
          ))}
          {items.length === 0 && (
            <div className="tl-empty">
              {editable ? 'Agregá tareas con «+ Tarea» o traelas de esta nota.' : 'Sin tareas'}
            </div>
          )}
        </div>

        {/* Right: bars */}
        <div ref={scrollRef} className="tl-right" onScroll={(e) => setScrollLeft(e.currentTarget.scrollLeft)}>
          <div style={{ width, position: 'relative' }}>
            <div className="tl-head" style={{ width }}>
              {/* Month of the first visible day, always shown; other months where they start. */}
              {(() => {
                const first = new Date((range.from + Math.floor(scrollLeft / px)) * DAY)
                const label = `${MONTHS[first.getUTCMonth()]} ${first.getUTCFullYear()}`
                const next = monthMarks.find((m) => m.left > scrollLeft)
                const hidden = next && next.left - scrollLeft < 70
                return (
                  <>
                    {!hidden && (
                      <span className="tl-month" style={{ left: scrollLeft }}>
                        {label}
                      </span>
                    )}
                    {monthMarks
                      .filter((m) => m.left > scrollLeft)
                      .map((m) => (
                        <span key={m.left} className="tl-month" style={{ left: m.left }}>
                          {m.label}
                        </span>
                      ))}
                  </>
                )
              })()}
              {dayMarks.map((d) =>
                zoom === 'week' || d.monday ? (
                  <span key={d.left} className="tl-day" style={{ left: d.left, width: zoom === 'week' ? px : undefined }}>
                    {d.label}
                  </span>
                ) : null
              )}
            </div>
            <div className="tl-canvas" style={{ height: Math.max(items.length, 1) * ROW }}>
              {zoom === 'week' &&
                dayMarks.map((d) => (d.weekend ? <span key={d.left} className="tl-weekend" style={{ left: d.left, width: px }} /> : null))}
              {dayMarks.map((d) => (d.monday ? <span key={`l${d.left}`} className="tl-vline" style={{ left: d.left }} /> : null))}
              <span className="tl-today" style={{ left: x(today) + px / 2 }} />
              {items.map((it, i) => {
                const top = i * ROW
                if (!it.start || !it.end) {
                  return editable ? (
                    <button
                      key={it.id}
                      type="button"
                      className="tl-undated"
                      style={{ top: top + 7, left: x(today) + 4 }}
                      onClick={() => patch(it.id, { start: isoOf(today), end: isoOf(today + 6) })}
                    >
                      + Poner fechas
                    </button>
                  ) : null
                }
                const live = drag?.id === it.id ? drag : null
                const s = live ? live.s : dayNum(it.start)
                const e = live ? live.e : dayNum(it.end)
                const late = !it.done && e < today ? today - e : 0
                const state = it.done ? 'done' : late ? 'late' : s <= today && today <= e ? 'now' : 'todo'
                return (
                  <div key={it.id} className="tl-bar-row" style={{ top }}>
                    <div
                      className="tl-bar"
                      data-state={state}
                      data-dragging={live ? true : undefined}
                      style={{ left: x(s) + 1, width: Math.max((e - s + 1) * px - 2, 6) }}
                      title={`${it.name || 'Sin título'} · ${shortDate(isoOf(s))} → ${shortDate(isoOf(e))}`}
                      onPointerDown={(ev) => startDrag(ev, it, 'move')}
                      onPointerMove={moveDrag}
                      onPointerUp={endDrag}
                      onPointerCancel={endDrag}
                    >
                      {editable && <span className="tl-handle left" onPointerDown={(ev) => startDrag(ev, it, 'start')} />}
                      <span className="tl-bar-label">{(e - s + 1) * px > 70 ? it.name : ''}</span>
                      {editable && <span className="tl-handle right" onPointerDown={(ev) => startDrag(ev, it, 'end')} />}
                    </div>
                    {late > 0 && (
                      <span className="tl-late" style={{ left: x(e) + px + 6 }}>
                        ⚠ {late} {late === 1 ? 'día' : 'días'} de retraso
                      </span>
                    )}
                    {live && (
                      <span className="tl-drag-dates" style={{ left: x(s) }}>
                        {shortDate(isoOf(s))} → {shortDate(isoOf(e))}
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function NameInput({ value, disabled, done, onSave }: { value: string; disabled: boolean; done: boolean; onSave: (v: string) => void }) {
  const [v, setV] = useState(value)
  useEffect(() => setV(value), [value])
  return (
    <input
      className="tl-name"
      data-done={done || undefined}
      value={v}
      disabled={disabled}
      placeholder="Nueva tarea"
      onChange={(e) => setV(e.target.value)}
      onBlur={() => v !== value && onSave(v.trim())}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
        if (e.key === 'Escape') {
          setV(value)
          ;(e.target as HTMLInputElement).blur()
        }
      }}
    />
  )
}

function NotePicker({
  candidates,
  onAdd,
  onCancel,
}: {
  candidates: ReturnType<typeof noteTasks>
  onAdd: (chosen: ReturnType<typeof noteTasks>) => void
  onCancel: () => void
}) {
  const [sel, setSel] = useState<Set<string>>(() => new Set(candidates.filter((c) => c.depth === 0 && !c.heading).map((c) => c.key)))
  if (!candidates.length) {
    return (
      <div className="tl-picker">
        <p>No encontré tareas nuevas en la nota. Se toman los desplegables, títulos y casillas de verificación.</p>
        <div className="tl-picker-actions">
          <button type="button" onClick={onCancel}>Cerrar</button>
        </div>
      </div>
    )
  }
  return (
    <div className="tl-picker">
      <p>Elegí qué tareas de la nota sumar al cronograma (empiezan hoy y duran una semana; después las ajustás):</p>
      <div className="tl-picker-list">
        {candidates.map((c) => (
          <label key={c.key} style={{ paddingLeft: c.depth * 16 }}>
            <input
              type="checkbox"
              checked={sel.has(c.key)}
              onChange={(e) => {
                const next = new Set(sel)
                if (e.target.checked) next.add(c.key)
                else next.delete(c.key)
                setSel(next)
              }}
            />
            <span data-done={c.done || undefined}>{c.name}</span>
          </label>
        ))}
      </div>
      <div className="tl-picker-actions">
        <button type="button" onClick={onCancel}>Cancelar</button>
        <button type="button" className="primary" disabled={!sel.size} onClick={() => onAdd(candidates.filter((c) => sel.has(c.key)))}>
          Agregar {sel.size || ''}
        </button>
      </div>
    </div>
  )
}
