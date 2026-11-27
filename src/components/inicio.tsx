'use client'

import { useCallback, useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { Database, FileText, KanbanSquare, Loader2, Menu, RefreshCw, Users } from 'lucide-react'
import { MaltaLogo } from '@/components/malta-logo'
import { UserMenu } from '@/components/user-menu'
import { AccesoDialog } from '@/components/acceso-dialog'
import { CypLista } from '@/components/presupuesto/cyp-lista'
import * as api from '@/lib/api'
import { useWorkspace } from '@/lib/workspace-store'
import { useEsAdmin } from '@/hooks/use-es-admin'
import { cn } from '@/lib/utils'

const rtf = new Intl.RelativeTimeFormat('es-AR', { numeric: 'auto' })
const SECCION_KEY = 'malta:inicioSeccion'

/** "hace 5 minutos", "ayer", "el 3 de nov." */
export function haceCuanto(iso: string): string {
  const seg = (new Date(iso).getTime() - Date.now()) / 1000
  const abs = Math.abs(seg)
  if (abs < 60) return 'recién'
  if (abs < 3600) return rtf.format(Math.round(seg / 60), 'minute')
  if (abs < 86400) return rtf.format(Math.round(seg / 3600), 'hour')
  if (abs < 7 * 86400) return rtf.format(Math.round(seg / 86400), 'day')
  return new Date(iso).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })
}

/**
 * Home screen: latest changes in every page, the pages by last activity, and
 * who has access to my pages. Also the "bottom" of the back button.
 */
export function Inicio({
  pagesVersion,
  onSelectPage,
  onOpenCard,
  onOpenRow,
  onAccesoChanged,
}: {
  /** Changes when the page list changes (reload). */
  pagesVersion: number
  onSelectPage: (pageId: string) => void
  onOpenCard: (pageId: string, cardId: string) => void
  onOpenRow: (pageId: string, rowId: string) => void
  onAccesoChanged: () => void
}) {
  const { data: session } = useSession()
  const sidebarOpen = useWorkspace((s) => s.sidebarOpen)
  const setSidebarOpen = useWorkspace((s) => s.setSidebarOpen)
  const [data, setData] = useState<Awaited<ReturnType<typeof api.fetchInicio>> | null>(null)
  const [error, setError] = useState(false)
  const [cargando, setCargando] = useState(false)
  const [accesoOpen, setAccesoOpen] = useState(false)
  const [seccionElegida, setSeccion] = useState<'inicio' | 'cyp'>('inicio')
  // «Cómputo y presupuesto» and sharing are only for the app admins.
  const esAdmin = useEsAdmin()
  const seccion = esAdmin ? seccionElegida : 'inicio'
  // Remember the tab when coming back to Inicio.
  useEffect(() => {
    try {
      if (window.localStorage.getItem(SECCION_KEY) === 'cyp') setSeccion('cyp')
    } catch {
      // storage unavailable
    }
  }, [])
  function elegirSeccion(k: 'inicio' | 'cyp') {
    setSeccion(k)
    try {
      window.localStorage.setItem(SECCION_KEY, k)
    } catch {
      // storage unavailable
    }
  }

  const cargar = useCallback(async () => {
    setCargando(true)
    try {
      setData(await api.fetchInicio())
      setError(false)
    } catch {
      setError(true)
    } finally {
      setCargando(false)
    }
  }, [])

  useEffect(() => {
    void cargar()
  }, [cargar, pagesVersion])

  // Fresh when coming back to the app.
  useEffect(() => {
    const f = () => document.visibilityState === 'visible' && void cargar()
    document.addEventListener('visibilitychange', f)
    return () => document.removeEventListener('visibilitychange', f)
  }, [cargar])

  const nombre = session?.user?.name?.split(' ')[0]
  const propias = data?.paginas.filter((p) => p.propia).length ?? 0

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-border/60 bg-background/80 px-3 backdrop-blur">
        <button
          type="button"
          onClick={() => setSidebarOpen(true)}
          className={cn(
            'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground',
            sidebarOpen && 'md:hidden'
          )}
          aria-label="Abrir barra lateral"
        >
          <Menu className="h-4 w-4" />
        </button>
        <MaltaLogo className="h-5 w-7 text-foreground" />
        <span className="text-sm font-semibold tracking-wide">MALTA</span>
        <span className="text-sm text-muted-foreground">workspace</span>
        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={() => void cargar()}
            className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground"
            aria-label="Actualizar"
            title="Actualizar"
          >
            <RefreshCw className={cn('h-4 w-4', cargando && 'animate-spin')} />
          </button>
          <UserMenu />
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 space-y-6 px-4 py-8 sm:px-6">
        <h1 className="text-3xl font-bold">{nombre ? `Hola, ${nombre}` : 'Inicio'}</h1>

        {esAdmin && (
          <nav className="flex gap-1 border-b border-border" role="tablist">
            {(
              [
                ['inicio', 'Actividad'],
                ['cyp', 'Cómputo y presupuesto'],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                type="button"
                role="tab"
                aria-selected={seccion === k}
                onClick={() => elegirSeccion(k)}
                className={cn(
                  '-mb-px border-b-2 px-3 py-2 text-sm font-medium transition',
                  seccion === k ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'
                )}
              >
                {label}
              </button>
            ))}
          </nav>
        )}

        {seccion === 'cyp' ? (
          <CypLista />
        ) : error && !data ? (
          <p className="text-sm text-muted-foreground">No se pudo cargar el inicio. Revisá la conexión y tocá actualizar.</p>
        ) : !data ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            <section className="space-y-3">
              <h2 className="text-lg font-semibold">Páginas</h2>
              {data.paginas.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Todavía no tenés páginas. Creá una con «Nueva página» en la barra de la izquierda.
                </p>
              ) : (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {data.paginas.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => onSelectPage(p.id)}
                      className="flex items-start gap-3 rounded-xl border border-border bg-card p-4 text-left transition hover:border-primary/40 hover:bg-accent/40"
                    >
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted text-lg">
                        {p.icon || (p.kind === 'databases' ? <Database className="h-4 w-4" /> : <KanbanSquare className="h-4 w-4" />)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{p.title}</span>
                        <span className="block text-xs text-muted-foreground">
                          {haceCuanto(p.ultimaActividad)}
                          {p.ultimoAutor ? ` · ${p.ultimoAutor}` : ''}
                        </span>
                        {!p.propia && <span className="mt-1 inline-block rounded bg-muted px-1.5 py-0.5 text-[10px]">Compartida conmigo</span>}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </section>

            {esAdmin && propias > 0 && (
              <section className="space-y-3">
                <h2 className="text-lg font-semibold">Personas con acceso</h2>
                <button
                  type="button"
                  onClick={() => setAccesoOpen(true)}
                  className="flex w-full items-center gap-3 rounded-xl border border-border bg-card p-4 text-left transition hover:bg-accent/40"
                >
                  <Users className="h-5 w-5 text-muted-foreground" />
                  <span className="flex-1 text-sm">
                    Elegí qué páginas tuyas ve cada persona.
                    <span className="block text-xs text-muted-foreground">
                      Cada uno ve solo lo que le compartís, y sus páginas propias no las ves vos salvo que te las compartan.
                    </span>
                  </span>
                </button>
              </section>
            )}
            <section className="space-y-3">
              <h2 className="text-lg font-semibold">Últimos cambios</h2>
              {data.actividad.length === 0 ? (
                <p className="text-sm text-muted-foreground">Todavía no hay cambios.</p>
              ) : (
                <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
                  {data.actividad.map((a) => (
                    <li key={`${a.tipo}-${a.id}`}>
                      <button
                        type="button"
                        onClick={() => (a.tipo === 'tarjeta' ? onOpenCard(a.pageId, a.id) : onOpenRow(a.pageId, a.id))}
                        className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition hover:bg-accent/40"
                      >
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center text-base">
                          {a.icono || <FileText className="h-4 w-4 text-muted-foreground" />}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">{a.titulo}</span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {a.paginaIcono ? `${a.paginaIcono} ` : ''}
                            {a.pagina} › {a.lugar}
                          </span>
                        </span>
                        <span className="shrink-0 text-xs text-muted-foreground">{haceCuanto(a.at)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>

          </>
        )}
      </main>

      <AccesoDialog
        open={accesoOpen}
        onOpenChange={setAccesoOpen}
        onChanged={() => {
          onAccesoChanged()
          void cargar()
        }}
      />
    </div>
  )
}
