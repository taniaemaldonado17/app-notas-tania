'use client'

import { useCallback, useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { toast } from 'sonner'
import { Loader2, NotebookPen } from 'lucide-react'
import { AuthScreen } from '@/components/auth-screen'
import { TopBar, CoverBanner } from '@/components/top-bar'
import { Board } from '@/components/board'
import { CardDetailPanel } from '@/components/card-detail-panel'
import { AppSidebar } from '@/components/app-sidebar'
import { SearchDialog } from '@/components/search-dialog'
import { ShareDialog } from '@/components/share-dialog'
import * as api from '@/lib/api'
import type { Page, PageSummary } from '@/lib/types'
import { useWorkspace } from '@/lib/workspace-store'
import { useWorkspacePage } from '@/hooks/use-workspace-page'

const LAST_PAGE_KEY = 'notas:lastPageId'
const SIDEBAR_KEY = 'notas:sidebarOpen'

function readStorage(key: string): string | null {
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

function writeStorage(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value)
  } catch {
    // storage unavailable (private mode, etc.) — not important
  }
}

export default function Home() {
  const { data: session, status } = useSession()

  if (status === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (status !== 'authenticated' || !session) {
    return <AuthScreen />
  }

  return <AppShell />
}

function AppShell() {
  const { data: session } = useSession()
  const [pages, setPages] = useState<PageSummary[] | null>(null)
  const [shareOpen, setShareOpen] = useState(false)
  const [pageId, setPageId] = useState<string | null>(null)
  const workspace = useWorkspacePage(pageId)
  const { openCard, closeCard, setSearchQuery } = useWorkspace()
  const sidebarOpen = useWorkspace((s) => s.sidebarOpen)
  const setSidebarOpen = useWorkspace((s) => s.setSidebarOpen)

  // Sidebar: open by default on desktop, closed on phones; remember the choice.
  useEffect(() => {
    const stored = readStorage(SIDEBAR_KEY)
    const isDesktop = window.matchMedia('(min-width: 768px)').matches
    setSidebarOpen(isDesktop ? stored !== 'false' : false)
  }, [setSidebarOpen])

  useEffect(() => {
    if (window.matchMedia('(min-width: 768px)').matches) {
      writeStorage(SIDEBAR_KEY, String(sidebarOpen))
    }
  }, [sidebarOpen])

  // Ctrl+\ toggles the sidebar (same shortcut as Notion).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === '\\') {
        e.preventDefault()
        setSidebarOpen(!useWorkspace.getState().sidebarOpen)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [setSidebarOpen])

  // Load the page list once and pick the page to show.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        let list = await api.fetchPages()
        if (list.length === 0) {
          const created = await api.createPage({ title: 'Registro de tareas diarias', icon: '📓' })
          list = [created]
        }
        if (cancelled) return
        setPages(list)
        const last = readStorage(LAST_PAGE_KEY)
        setPageId(list.some((p) => p.id === last) ? last : list[0].id)
      } catch (err) {
        console.error('pages load failed', err)
        toast.error('No se pudieron cargar las páginas')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (pageId) writeStorage(LAST_PAGE_KEY, pageId)
  }, [pageId])

  const reloadPages = useCallback(async () => {
    try {
      setPages(await api.fetchPages())
    } catch {
      // keep the current list
    }
  }, [])

  // Pick up changes made by collaborators: when coming back to the tab,
  // and every 30 s while the tab is visible.
  const { refresh } = workspace
  useEffect(() => {
    function onFocus() {
      if (document.visibilityState !== 'visible') return
      refresh()
      reloadPages()
    }
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') refresh()
    }, 30_000)
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onFocus)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onFocus)
    }
  }, [refresh, reloadPages])

  const selectPage = useCallback(
    (id: string) => {
      if (id !== pageId) {
        closeCard()
        setSearchQuery('')
      }
      setPageId(id)
    },
    [pageId, closeCard, setSearchQuery]
  )

  const openCardOnPage = useCallback(
    (targetPageId: string, cardId: string) => {
      selectPage(targetPageId)
      openCard(cardId)
    },
    [selectPage, openCard]
  )

  // Page meta edits from the cover/title area also update the sidebar.
  const updatePageMeta = useCallback(
    async (payload: Partial<Pick<Page, 'title' | 'subtitle' | 'icon' | 'coverUrl'>>) => {
      setPages((ps) => ps?.map((p) => (p.id === pageId ? { ...p, ...payload } : p)) ?? ps)
      await workspace.updatePageMeta(payload)
    },
    [pageId, workspace]
  )

  async function handleCreatePage() {
    try {
      const created = await api.createPage({ title: 'Sin título', icon: '📄' })
      setPages((ps) => [...(ps ?? []), created])
      selectPage(created.id)
      toast.success('Página creada')
    } catch {
      toast.error('No se pudo crear la página')
    }
  }

  async function handleRenamePage(id: string, title: string) {
    const previous = pages
    setPages((ps) => ps?.map((p) => (p.id === id ? { ...p, title } : p)) ?? ps)
    try {
      if (id === pageId) await workspace.updatePageMeta({ title })
      else await api.updatePage(id, { title })
    } catch {
      setPages(previous)
      toast.error('No se pudo cambiar el nombre')
    }
  }

  async function handleToggleFavoritePage(id: string) {
    const target = pages?.find((p) => p.id === id)
    if (!target) return
    const favorite = !target.favorite
    setPages((ps) => ps?.map((p) => (p.id === id ? { ...p, favorite } : p)) ?? ps)
    try {
      await api.setFavorite({ pageId: id }, favorite)
    } catch {
      setPages((ps) => ps?.map((p) => (p.id === id ? { ...p, favorite: !favorite } : p)) ?? ps)
      toast.error('No se pudo actualizar favoritos')
    }
  }

  async function handleDeletePage(id: string) {
    const target = pages?.find((p) => p.id === id)
    if (!target || !pages || pages.length <= 1) return
    const ok = window.confirm(
      `¿Eliminar la página "${target.title}"?\n\nSe borran todas sus columnas, tarjetas y comentarios. No se puede deshacer.`
    )
    if (!ok) return
    try {
      await api.deletePage(id)
      const remaining = pages.filter((p) => p.id !== id)
      setPages(remaining)
      if (id === pageId) selectPage(remaining[0].id)
      useWorkspace.getState().bumpFavorites()
      toast.success('Página eliminada')
    } catch {
      toast.error('No se pudo eliminar la página')
    }
  }

  // After leaving or losing access to a page, show another one.
  function dropPage(id: string) {
    const remaining = (pages ?? []).filter((p) => p.id !== id)
    setPages(remaining)
    useWorkspace.getState().bumpFavorites()
    if (id === pageId) {
      if (remaining.length > 0) selectPage(remaining[0].id)
      else window.location.reload()
    }
  }

  async function handleLeavePage(id: string) {
    const target = pages?.find((p) => p.id === id)
    if (!target) return
    const ok = window.confirm(
      `¿Salir de "${target.title}"?\n\nDejás de verla. Para volver, te tienen que invitar de nuevo.`
    )
    if (!ok) return
    try {
      await api.removeMember(id, 'me')
      dropPage(id)
      toast.success('Saliste de la página')
    } catch {
      toast.error('No se pudo salir de la página')
    }
  }

  const currentSummary = pages?.find((p) => p.id === pageId)

  return (
    <div className="flex min-h-dvh bg-background">
      <AppSidebar
        pages={pages ?? []}
        currentPageId={pageId}
        onSelectPage={selectPage}
        onOpenCard={openCardOnPage}
        onCreatePage={handleCreatePage}
        onRenamePage={handleRenamePage}
        onToggleFavoritePage={handleToggleFavoritePage}
        onDeletePage={handleDeletePage}
        onLeavePage={handleLeavePage}
      />
      <SearchDialog
        pages={pages ?? []}
        onSelectPage={selectPage}
        onOpenCard={openCardOnPage}
      />
      {pageId && currentSummary && (
        <ShareDialog
          open={shareOpen}
          onOpenChange={setShareOpen}
          pageId={pageId}
          pageTitle={currentSummary.title}
          currentUserId={session?.user?.id}
          onChanged={reloadPages}
          onLeft={() => dropPage(pageId)}
        />
      )}
      <Workspace
        workspace={workspace}
        loadingPage={!pageId || workspace.loading}
        onUpdatePageMeta={updatePageMeta}
        memberCount={currentSummary?.memberCount ?? 0}
        onShare={() => setShareOpen(true)}
      />
    </div>
  )
}

function Workspace({
  workspace,
  loadingPage,
  onUpdatePageMeta,
  memberCount,
  onShare,
}: {
  workspace: ReturnType<typeof useWorkspacePage>
  loadingPage: boolean
  onUpdatePageMeta: (
    payload: Partial<Pick<Page, 'title' | 'subtitle' | 'icon' | 'coverUrl'>>
  ) => Promise<void>
  memberCount: number
  onShare: () => void
}) {
  const page = workspace.page

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <TopBar page={page ?? null} memberCount={memberCount} onShare={onShare} />

      <main className="flex flex-1 flex-col">
        {workspace.error ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 py-20 text-center text-sm text-muted-foreground">
            <p>No se pudo abrir esta página. Puede que ya no tengas acceso.</p>
            <p>Elegí otra en el menú de la izquierda.</p>
          </div>
        ) : loadingPage || !page ? (
          <div className="flex flex-1 items-center justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            <CoverBanner
              key={page.id}
              page={page}
              onCoverChange={async (url) => {
                await onUpdatePageMeta({ coverUrl: url })
              }}
              onTitleChange={async (next) => {
                await onUpdatePageMeta({ title: next })
              }}
              onSubtitleChange={async (next) => {
                await onUpdatePageMeta({ subtitle: next })
              }}
              onIconChange={async (next) => {
                await onUpdatePageMeta({ icon: next })
              }}
            />
            <div className="flex-1 overflow-hidden pb-6">
              <Board page={page} workspace={workspace} />
            </div>
          </>
        )}
      </main>

      <footer className="mt-auto border-t border-border bg-background/80 px-4 py-3 text-center text-[11px] text-muted-foreground">
        <div className="mx-auto flex max-w-5xl items-center justify-center">
          <span className="flex items-center gap-1">
            <NotebookPen className="h-3 w-3" />
            Registro de tareas diarias · tablero Kanban
          </span>
        </div>
      </footer>

      <CardDetailPanel workspace={workspace} />
    </div>
  )
}
