'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { Loader2, NotebookPen } from 'lucide-react'
import { AuthScreen } from '@/components/auth-screen'
import { TopBar, CoverBanner } from '@/components/top-bar'
import { Board } from '@/components/board'
import { CardDetailPanel } from '@/components/card-detail-panel'
import { fetchPages } from '@/lib/api'
import { useWorkspacePage } from '@/hooks/use-workspace-page'

export default function Home() {
  const { data: session, status } = useSession()
  const [pageId, setPageId] = useState<string | null>(null)
  const [loadingPage, setLoadingPage] = useState(true)

  // Once we have a session, fetch the user's first page (or seed one if missing).
  useEffect(() => {
    if (status !== 'authenticated') return
    let cancelled = false
    ;(async () => {
      setLoadingPage(true)
      try {
        const pages = await fetchPages()
        if (cancelled) return
        if (pages.length === 0) {
          // No pages yet: create one (server already does this on register,
          // but a user could've deleted everything — recover gracefully).
          const res = await fetch('/api/pages', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: 'Registro de tareas diarias' }),
          })
          const data = await res.json()
          setPageId(data.page.id)
        } else {
          setPageId(pages[0].id)
        }
      } catch (err) {
        console.error('page load failed', err)
      } finally {
        if (!cancelled) setLoadingPage(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [status])

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

  return <Workspace pageId={pageId} loadingPage={loadingPage} />
}

function Workspace({
  pageId,
  loadingPage,
}: {
  pageId: string | null
  loadingPage: boolean
}) {
  const workspace = useWorkspacePage(pageId)
  const page = workspace.page

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <TopBar page={page ?? null} />

      <main className="flex flex-1 flex-col">
        {loadingPage || !page ? (
          <div className="flex flex-1 items-center justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            <CoverBanner
              page={page}
              onCoverChange={async (url) => {
                await workspace.updatePageMeta({ coverUrl: url })
              }}
              onTitleChange={async (next) => {
                await workspace.updatePageMeta({ title: next })
              }}
              onSubtitleChange={async (next) => {
                await workspace.updatePageMeta({ subtitle: next })
              }}
              onIconChange={async (next) => {
                await workspace.updatePageMeta({ icon: next })
              }}
            />
            <div className="flex-1 overflow-hidden pb-6">
              <Board page={page} workspace={workspace} />
            </div>
          </>
        )}
      </main>

      <footer className="mt-auto border-t border-border bg-background/80 px-4 py-3 text-center text-[11px] text-muted-foreground">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <span className="flex items-center gap-1">
            <NotebookPen className="h-3 w-3" />
            Registro de tareas diarias · tablero Kanban
          </span>
          <span>Datos guardados localmente · Argentina · es-AR</span>
        </div>
      </footer>

      <CardDetailPanel workspace={workspace} />
    </div>
  )
}
