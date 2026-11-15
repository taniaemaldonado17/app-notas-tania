'use client'

import { useEffect, useRef, useState } from 'react'
import { useSession } from 'next-auth/react'
import {
  ChevronsLeft,
  ChevronDown,
  ChevronRight,
  FileText,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Star,
  StarOff,
  Trash2,
} from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useWorkspace } from '@/lib/workspace-store'
import { fetchFavoriteCards } from '@/lib/api'
import type { FavoriteCard, PageSummary } from '@/lib/types'
import { cn } from '@/lib/utils'

type Props = {
  pages: PageSummary[]
  currentPageId: string | null
  onSelectPage: (pageId: string) => void
  onOpenCard: (pageId: string, cardId: string) => void
  onCreatePage: () => void
  onRenamePage: (pageId: string, title: string) => void
  onToggleFavoritePage: (pageId: string) => void
  onDeletePage: (pageId: string) => void
}

/** Notion-style left navigation: search, favourites and the page list. */
export function AppSidebar({
  pages,
  currentPageId,
  onSelectPage,
  onOpenCard,
  onCreatePage,
  onRenamePage,
  onToggleFavoritePage,
  onDeletePage,
}: Props) {
  const { data: session } = useSession()
  const sidebarOpen = useWorkspace((s) => s.sidebarOpen)
  const setSidebarOpen = useWorkspace((s) => s.setSidebarOpen)
  const setSearchDialogOpen = useWorkspace((s) => s.setSearchDialogOpen)
  const favoritesVersion = useWorkspace((s) => s.favoritesVersion)

  const [favoriteCards, setFavoriteCards] = useState<FavoriteCard[]>([])
  const [favOpen, setFavOpen] = useState(true)
  const [pagesOpen, setPagesOpen] = useState(true)

  useEffect(() => {
    let cancelled = false
    fetchFavoriteCards()
      .then((cards) => {
        if (!cancelled) setFavoriteCards(cards)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [favoritesVersion])

  const name = session?.user?.name || session?.user?.email || 'Mi espacio'
  const favoritePages = pages.filter((p) => p.favorite)
  const hasFavorites = favoritePages.length > 0 || favoriteCards.length > 0

  // On phones the sidebar overlays the page; close it after navigating.
  function afterNavigate() {
    if (window.matchMedia('(max-width: 767px)').matches) setSidebarOpen(false)
  }

  return (
    <>
      {/* Backdrop on small screens */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 md:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      <aside
        className={cn(
          'group/sidebar z-40 flex h-dvh w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-[margin,transform] duration-200',
          // Overlay on phones; in the page flow (sticky) on desktop.
          'fixed inset-y-0 left-0 md:sticky md:left-auto md:top-0',
          sidebarOpen
            ? 'translate-x-0 md:ml-0'
            : '-translate-x-full md:-ml-60 md:translate-x-0'
        )}
        aria-label="Navegación"
        aria-hidden={!sidebarOpen}
        inert={!sidebarOpen}
      >
        {/* Workspace header */}
        <div className="flex h-12 items-center gap-2 px-3">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-primary text-xs font-semibold text-primary-foreground">
            {name.charAt(0).toUpperCase()}
          </span>
          <span className="min-w-0 flex-1 truncate text-sm font-medium">
            {name}
          </span>
          <button
            type="button"
            onClick={() => setSidebarOpen(false)}
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-sidebar-accent hover:text-foreground md:opacity-0 md:group-hover/sidebar:opacity-100 md:focus-visible:opacity-100"
            aria-label="Cerrar barra lateral"
            title="Cerrar barra lateral (Ctrl+\)"
          >
            <ChevronsLeft className="h-4 w-4" />
          </button>
        </div>

        {/* Search */}
        <div className="px-2 pb-2">
          <button
            type="button"
            onClick={() => setSearchDialogOpen(true)}
            className="flex h-8 w-full items-center gap-2 rounded-md border border-sidebar-border bg-background/40 px-2 text-sm text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
          >
            <Search className="h-4 w-4" />
            <span className="flex-1 text-left">Buscar</span>
            <kbd className="rounded border border-sidebar-border px-1 text-[10px]">
              Ctrl+K
            </kbd>
          </button>
        </div>

        <nav className="notion-scroll flex-1 overflow-y-auto px-2 pb-3">
          {/* Favourites */}
          {hasFavorites && (
            <SectionHeader
              label="Favoritos"
              open={favOpen}
              onToggle={() => setFavOpen((v) => !v)}
            />
          )}
          {hasFavorites && favOpen && (
            <ul className="mb-3 space-y-px">
              {favoritePages.map((p) => (
                <li key={`p-${p.id}`}>
                  <NavRow
                    icon={p.icon}
                    label={p.title}
                    active={p.id === currentPageId}
                    onClick={() => {
                      onSelectPage(p.id)
                      afterNavigate()
                    }}
                  />
                </li>
              ))}
              {favoriteCards.map((c) => (
                <li key={`c-${c.id}`}>
                  <NavRow
                    icon={c.icon}
                    label={c.title}
                    onClick={() => {
                      onOpenCard(c.pageId, c.id)
                      afterNavigate()
                    }}
                  />
                </li>
              ))}
            </ul>
          )}

          {/* Pages */}
          <SectionHeader
            label="Páginas"
            open={pagesOpen}
            onToggle={() => setPagesOpen((v) => !v)}
            action={
              <button
                type="button"
                onClick={onCreatePage}
                className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground opacity-0 hover:bg-sidebar-accent hover:text-foreground focus-visible:opacity-100 group-hover/section:opacity-100"
                aria-label="Nueva página"
                title="Nueva página"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            }
          />
          {pagesOpen && (
            <ul className="space-y-px">
              {pages.map((p) => (
                <li key={p.id}>
                  <PageRow
                    page={p}
                    active={p.id === currentPageId}
                    canDelete={pages.length > 1}
                    onSelect={() => {
                      onSelectPage(p.id)
                      afterNavigate()
                    }}
                    onRename={(title) => onRenamePage(p.id, title)}
                    onToggleFavorite={() => onToggleFavoritePage(p.id)}
                    onDelete={() => onDeletePage(p.id)}
                  />
                </li>
              ))}
            </ul>
          )}
        </nav>

        {/* New page */}
        <div className="border-t border-sidebar-border p-2">
          <button
            type="button"
            onClick={onCreatePage}
            className="flex h-8 w-full items-center gap-2 rounded-md px-2 text-sm text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
          >
            <Plus className="h-4 w-4" />
            Nueva página
          </button>
        </div>
      </aside>
    </>
  )
}

function SectionHeader({
  label,
  open,
  onToggle,
  action,
}: {
  label: string
  open: boolean
  onToggle: () => void
  action?: React.ReactNode
}) {
  return (
    <div className="group/section mt-2 flex h-7 items-center gap-1 px-2">
      <button
        type="button"
        onClick={onToggle}
        className="flex flex-1 items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
        aria-expanded={open}
      >
        {label}
        {open ? (
          <ChevronDown className="h-3 w-3 opacity-0 group-hover/section:opacity-100" />
        ) : (
          <ChevronRight className="h-3 w-3 opacity-0 group-hover/section:opacity-100" />
        )}
      </button>
      {action}
    </div>
  )
}

function RowIcon({ icon }: { icon: string | null }) {
  return (
    <span className="flex h-5 w-5 shrink-0 items-center justify-center text-sm leading-none">
      {icon || <FileText className="h-4 w-4 text-muted-foreground" />}
    </span>
  )
}

function NavRow({
  icon,
  label,
  active,
  onClick,
}: {
  icon: string | null
  label: string
  active?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-sm hover:bg-sidebar-accent',
        active ? 'bg-sidebar-accent font-medium text-foreground' : 'text-sidebar-foreground/85'
      )}
    >
      <RowIcon icon={icon} />
      <span className="min-w-0 flex-1 truncate">{label || 'Sin título'}</span>
    </button>
  )
}

function PageRow({
  page,
  active,
  canDelete,
  onSelect,
  onRename,
  onToggleFavorite,
  onDelete,
}: {
  page: PageSummary
  active: boolean
  canDelete: boolean
  onSelect: () => void
  onRename: (title: string) => void
  onToggleFavorite: () => void
  onDelete: () => void
}) {
  const [renaming, setRenaming] = useState(false)
  const [draft, setDraft] = useState(page.title)
  const inputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (renaming) {
      inputRef.current?.focus()
      inputRef.current?.select()
    }
  }, [renaming])

  function commit() {
    setRenaming(false)
    const next = draft.trim()
    if (next && next !== page.title) onRename(next)
    else setDraft(page.title)
  }

  if (renaming) {
    return (
      <div className="flex h-8 items-center gap-2 rounded-md bg-sidebar-accent px-2">
        <RowIcon icon={page.icon} />
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit()
            if (e.key === 'Escape') {
              setDraft(page.title)
              setRenaming(false)
            }
          }}
          className="min-w-0 flex-1 bg-transparent text-sm outline-none"
          aria-label="Nombre de la página"
        />
      </div>
    )
  }

  return (
    <div
      className={cn(
        'group/row flex h-8 items-center rounded-md hover:bg-sidebar-accent',
        active && 'bg-sidebar-accent'
      )}
    >
      <button
        type="button"
        onClick={onSelect}
        onDoubleClick={() => {
          setDraft(page.title)
          setRenaming(true)
        }}
        className={cn(
          'flex h-full min-w-0 flex-1 items-center gap-2 px-2 text-left text-sm',
          active ? 'font-medium text-foreground' : 'text-sidebar-foreground/85'
        )}
        aria-current={active ? 'page' : undefined}
      >
        <RowIcon icon={page.icon} />
        <span className="min-w-0 flex-1 truncate">{page.title || 'Sin título'}</span>
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="mr-1 flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground opacity-0 hover:bg-background/60 hover:text-foreground focus-visible:opacity-100 group-hover/row:opacity-100 data-[state=open]:opacity-100"
            aria-label={`Opciones de ${page.title}`}
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" side="right" className="w-52">
          <DropdownMenuItem onClick={onToggleFavorite} className="cursor-pointer text-sm">
            {page.favorite ? (
              <>
                <StarOff className="mr-2 h-3.5 w-3.5" />
                Quitar de favoritos
              </>
            ) : (
              <>
                <Star className="mr-2 h-3.5 w-3.5" />
                Añadir a favoritos
              </>
            )}
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => {
              setDraft(page.title)
              setRenaming(true)
            }}
            className="cursor-pointer text-sm"
          >
            <Pencil className="mr-2 h-3.5 w-3.5" />
            Cambiar nombre
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={onDelete}
            disabled={!canDelete}
            className="cursor-pointer text-sm text-destructive focus:text-destructive"
          >
            <Trash2 className="mr-2 h-3.5 w-3.5" />
            Eliminar página
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
