'use client'

import { useEffect, useMemo, useState } from 'react'
import { FileText, Loader2, SquareKanban } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { useWorkspace } from '@/lib/workspace-store'
import { searchCards } from '@/lib/api'
import { docPreview } from '@/lib/blocks'
import type { PageSummary, SearchResult } from '@/lib/types'

type Props = {
  pages: PageSummary[]
  onSelectPage: (pageId: string) => void
  onOpenCard: (pageId: string, cardId: string) => void
}

/** Ctrl+K search across every page and card. */
export function SearchDialog({ pages, onSelectPage, onOpenCard }: Props) {
  const open = useWorkspace((s) => s.searchDialogOpen)
  const setOpen = useWorkspace((s) => s.setSearchDialogOpen)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)

  // Ctrl+K / Cmd+K opens the dialog from anywhere.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen(!useWorkspace.getState().searchDialogOpen)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [setOpen])

  // Debounced server search for cards.
  useEffect(() => {
    const q = query.trim()
    if (q.length < 2) {
      setResults([])
      setLoading(false)
      return
    }
    setLoading(true)
    const timer = setTimeout(() => {
      searchCards(q)
        .then(setResults)
        .catch(() => setResults([]))
        .finally(() => setLoading(false))
    }, 250)
    return () => clearTimeout(timer)
  }, [query])

  const matchingPages = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return pages
    return pages.filter((p) => p.title.toLowerCase().includes(q))
  }, [pages, query])

  function close() {
    setOpen(false)
    setQuery('')
  }

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? setOpen(true) : close())}>
      <DialogContent className="top-[20%] translate-y-0 overflow-hidden p-0 sm:max-w-xl" showCloseButton={false}>
        <DialogTitle className="sr-only">Buscar</DialogTitle>
        <DialogDescription className="sr-only">
          Buscá páginas y tarjetas por título o contenido
        </DialogDescription>
        {/* Filtering is done here and on the server, not by cmdk. */}
        <Command shouldFilter={false} className="[&_[cmdk-item]]:py-2">
          <CommandInput
            value={query}
            onValueChange={setQuery}
            placeholder="Buscar páginas y tarjetas…"
          />
          <CommandList className="max-h-[60vh]">
            {!loading && (
              <CommandEmpty>
                {query.trim().length < 2 && matchingPages.length === 0
                  ? 'Escribí para buscar'
                  : 'Sin resultados'}
              </CommandEmpty>
            )}

            {matchingPages.length > 0 && (
              <CommandGroup heading="Páginas">
                {matchingPages.map((p) => (
                  <CommandItem
                    key={p.id}
                    value={`page-${p.id}`}
                    onSelect={() => {
                      onSelectPage(p.id)
                      close()
                    }}
                    className="cursor-pointer"
                  >
                    <span className="flex h-5 w-5 items-center justify-center text-sm">
                      {p.icon || <FileText className="h-4 w-4 text-muted-foreground" />}
                    </span>
                    <span className="truncate">{p.title || 'Sin título'}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {loading && (
              <div className="flex items-center gap-2 px-4 py-3 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Buscando tarjetas…
              </div>
            )}

            {!loading && results.length > 0 && (
              <CommandGroup heading="Tarjetas">
                {results.map((r) => {
                  const preview = docPreview(r.description)
                  return (
                    <CommandItem
                      key={r.id}
                      value={`card-${r.id}`}
                      onSelect={() => {
                        onOpenCard(r.pageId, r.id)
                        close()
                      }}
                      className="cursor-pointer items-start"
                    >
                      <SquareKanban className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate">{r.title}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {r.pageTitle} · {r.columnTitle}
                          {preview ? ` — ${preview}` : ''}
                        </span>
                      </span>
                    </CommandItem>
                  )
                })}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  )
}
