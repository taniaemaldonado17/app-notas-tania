'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Search, Shuffle, Trash2 } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'

type Emoji = { emoji: string; category: number; label: string; tags: string[]; version: number }
type EmojiData = { emojis: Emoji[]; categories: { index: number; label: string }[] }

// Spanish emoji names/keywords ship with BlockNote; load them once, on demand.
let dataPromise: Promise<EmojiData> | null = null
function loadEmojiData(): Promise<EmojiData> {
  dataPromise ??= import('@blocknote/core/emoji-data').then(async (m) => {
    const d = await m.loadFrimousseData('es')
    // Windows 10's emoji font stops around Emoji 12; newer ones would show as
    // empty boxes there.
    const maxVersion = /Windows NT 10/.test(navigator.userAgent) ? 12 : Infinity
    return { emojis: d.emojis.filter((e) => e.version <= maxVersion), categories: d.categories }
  })
  return dataPromise
}

const RECENT_KEY = 'notas:recent-emojis'
const CATEGORY_ICONS = ['😀', '👋', '🐻', '🍔', '✈️', '⚽', '💡', '🔣', '🏳️']
/** Handy picks for an architecture studio, shown first. */
const SUGGESTED = ['🏛️', '🏗️', '🏠', '🏡', '🏢', '🏬', '🏘️', '🏚️', '🏭', '🏫', '🏥', '⛪', '🌉', '📐', '📏', '✏️', '🖊️', '📝', '📋', '📁', '📂', '🗂️', '📊', '📅', '🧱', '🖼️', '📌', '🚪', '🛠️', '🔨', '🔧', '🧰', '🦺', '🚧', '💡', '🎨', '🌳', '💰', '✅', '⭐']

function readRecent(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]')
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string').slice(0, 24) : []
  } catch {
    return []
  }
}

function pushRecent(e: string) {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify([e, ...readRecent().filter((x) => x !== e)].slice(0, 24)))
  } catch {
    // ignore
  }
}

/**
 * Notion-style emoji picker in a popover: search in Spanish, categories,
 * recent emojis, random and remove. Wraps any trigger element.
 */
export function EmojiPicker({
  children,
  onSelect,
  onRemove,
  align = 'start',
}: {
  children: React.ReactNode
  onSelect: (emoji: string) => void
  /** Shows a "Quitar" button when provided. */
  onRemove?: () => void
  align?: 'start' | 'center' | 'end'
}) {
  const [open, setOpen] = useState(false)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent align={align} className="w-[352px] p-0" onClick={(e) => e.stopPropagation()}>
        {open && (
          <PickerBody
            onSelect={(e) => {
              pushRecent(e)
              onSelect(e)
              setOpen(false)
            }}
            onRemove={
              onRemove
                ? () => {
                    onRemove()
                    setOpen(false)
                  }
                : undefined
            }
          />
        )}
      </PopoverContent>
    </Popover>
  )
}

function PickerBody({ onSelect, onRemove }: { onSelect: (e: string) => void; onRemove?: () => void }) {
  const [data, setData] = useState<EmojiData | null>(null)
  const [query, setQuery] = useState('')
  const [recent] = useState(readRecent)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let alive = true
    loadEmojiData()
      .then((d) => alive && setData(d))
      .catch(() => alive && setData({ emojis: [], categories: [] }))
    return () => {
      alive = false
    }
  }, [])

  const results = useMemo(() => {
    if (!data || !query.trim()) return null
    const words = query
      .toLocaleLowerCase('es')
      .normalize('NFD')
      .replace(/\p{M}/gu, '')
      .split(/\s+/)
      .filter(Boolean)
    const norm = (s: string) => s.toLocaleLowerCase('es').normalize('NFD').replace(/\p{M}/gu, '')
    return data.emojis
      .filter((e) => {
        const hay = norm([e.label, ...e.tags].join(' '))
        return words.every((w) => hay.includes(w))
      })
      .slice(0, 160)
  }, [data, query])

  const byCategory = useMemo(() => {
    const map = new Map<number, Emoji[]>()
    for (const e of data?.emojis ?? []) {
      const list = map.get(e.category) ?? []
      list.push(e)
      map.set(e.category, list)
    }
    return map
  }, [data])

  const labelOf = useMemo(() => {
    const m = new Map<string, string>()
    for (const e of data?.emojis ?? []) m.set(e.emoji, e.label)
    return m
  }, [data])

  const cell = (e: string, label?: string) => (
    <button
      key={e}
      type="button"
      onClick={() => onSelect(e)}
      title={label ?? labelOf.get(e) ?? e}
      className="flex h-9 w-9 items-center justify-center rounded-md text-[22px] leading-none hover:bg-accent"
    >
      {e}
    </button>
  )

  const section = (id: string, title: string, items: React.ReactNode) => (
    <div key={id} data-section={id} className="pb-1">
      <p className="sticky top-0 z-10 bg-popover/95 px-1 py-1 text-[11px] font-medium text-muted-foreground backdrop-blur">{title}</p>
      <div className="grid grid-cols-8 gap-0.5">{items}</div>
    </div>
  )

  return (
    <div className="flex h-[380px] flex-col">
      <div className="flex items-center gap-1 border-b border-border p-2">
        <div className="flex flex-1 items-center gap-2 rounded-md bg-muted px-2">
          <Search className="h-3.5 w-3.5 text-muted-foreground" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && results?.[0]) onSelect(results[0].emoji)
            }}
            placeholder="Buscar (ej: casa, lápiz, regla)"
            className="h-8 flex-1 bg-transparent text-sm outline-none"
          />
        </div>
        <button
          type="button"
          title="Al azar"
          aria-label="Emoji al azar"
          disabled={!data?.emojis.length}
          onClick={() => data && onSelect(data.emojis[Math.floor(Math.random() * data.emojis.length)].emoji)}
          className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <Shuffle className="h-4 w-4" />
        </button>
        {onRemove && (
          <button
            type="button"
            onClick={onRemove}
            title="Quitar ícono"
            className="flex h-8 items-center gap-1 rounded-md px-2 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <Trash2 className="h-3.5 w-3.5" /> Quitar
          </button>
        )}
      </div>

      {!results && data && data.categories.length > 0 && (
        <div className="flex justify-between border-b border-border px-2 py-1">
          {data.categories.map((c, i) => (
            <button
              key={c.index}
              type="button"
              title={c.label}
              onClick={() => {
                const el = scrollRef.current?.querySelector(`[data-section="cat-${c.index}"]`) as HTMLElement | null
                if (el && scrollRef.current) scrollRef.current.scrollTop = el.offsetTop - scrollRef.current.offsetTop
              }}
              className="flex h-7 w-7 items-center justify-center rounded text-base opacity-70 hover:bg-accent hover:opacity-100"
            >
              {CATEGORY_ICONS[i] ?? '•'}
            </button>
          ))}
        </div>
      )}

      <div ref={scrollRef} className="notion-scroll relative flex-1 overflow-y-auto px-2 pb-2">
        {!data ? (
          <p className="p-3 text-xs text-muted-foreground">Cargando emojis…</p>
        ) : results ? (
          results.length ? (
            section('results', 'Resultados', results.map((e) => cell(e.emoji, e.label)))
          ) : (
            <p className="p-3 text-xs text-muted-foreground">No se encontró ningún emoji.</p>
          )
        ) : (
          <>
            {recent.length > 0 && section('recent', 'Recientes', recent.map((e) => cell(e)))}
            {section('suggested', 'Sugeridos', SUGGESTED.map((e) => cell(e)))}
            {data.categories.map((c) =>
              section(`cat-${c.index}`, c.label, (byCategory.get(c.index) ?? []).map((e) => cell(e.emoji, e.label)))
            )}
          </>
        )}
      </div>
    </div>
  )
}
