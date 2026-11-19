'use client'

import { useEffect, useMemo, useState } from 'react'
import { FileText, History, Loader2, RotateCcw, SquareKanban } from 'lucide-react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import * as api from '@/lib/api'
import { diffSnapshots, type ItemChange } from '@/lib/version-diff'
import { cn } from '@/lib/utils'

function when(iso: string) {
  const d = new Date(iso)
  const today = new Date()
  const yesterday = new Date(Date.now() - 86400000)
  const time = d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
  if (d.toDateString() === today.toDateString()) return `Hoy a las ${time}`
  if (d.toDateString() === yesterday.toDateString()) return `Ayer a las ${time}`
  return `${d.toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric', month: 'short' })} · ${time}`
}

/** Button for the top bar that opens the page's version history. */
export function VersionHistoryButton({ pageId, onRestored }: { pageId: string; onRestored?: () => void }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground"
        title="Historial de versiones"
        aria-label="Historial de versiones"
      >
        <History className="h-4 w-4" />
      </button>
      {open && <VersionHistoryDialog pageId={pageId} onClose={() => setOpen(false)} onRestored={onRestored} />}
    </>
  )
}

function VersionHistoryDialog({ pageId, onClose, onRestored }: { pageId: string; onClose: () => void; onRestored?: () => void }) {
  const [versions, setVersions] = useState<api.VersionInfo[] | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [detail, setDetail] = useState<Awaited<ReturnType<typeof api.fetchVersion>> | null>(null)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [confirmAll, setConfirmAll] = useState(false)
  const [reload, setReload] = useState(0)

  useEffect(() => {
    let cancelled = false
    api
      .fetchVersions(pageId)
      .then((v) => {
        if (cancelled) return
        setVersions(v)
        setSelected((s) => (s && v.some((x) => x.id === s) ? s : v[0]?.id ?? null))
      })
      .catch(() => !cancelled && setVersions([]))
    return () => {
      cancelled = true
    }
  }, [pageId, reload])

  useEffect(() => {
    if (!selected) return
    let cancelled = false
    setLoadingDetail(true)
    setConfirmAll(false)
    api
      .fetchVersion(pageId, selected)
      .then((d) => !cancelled && setDetail(d))
      .catch(() => !cancelled && setDetail(null))
      .finally(() => !cancelled && setLoadingDetail(false))
    return () => {
      cancelled = true
    }
  }, [pageId, selected, reload])

  const diff = useMemo(() => (detail?.current ? diffSnapshots(detail.version, detail.current) : null), [detail])
  const selectedInfo = versions?.find((v) => v.id === selected)

  async function restore(only?: { rowIds?: string[]; cardIds?: string[] }, key = 'all') {
    if (!selected) return
    setBusy(key)
    try {
      const res = await api.restoreVersion(pageId, selected, only)
      if (res.skipped > 0)
        toast.warning('Algunas cosas no se pudieron recuperar solas', {
          description: 'Su tabla o columna ya no existe. Restaurá la página completa para traerlas.',
        })
      else toast.success(only ? 'Recuperado' : 'Página restaurada', { description: 'Si te arrepentís, la versión anterior quedó guardada en el historial.' })
      onRestored?.()
      setReload((n) => n + 1)
      if (!only) onClose()
    } catch {
      toast.error('No se pudo restaurar')
    } finally {
      setBusy(null)
    }
  }

  const groups: { title: string; hint: string; status: ItemChange['status'] }[] = [
    { title: 'Borrado desde entonces', hint: 'Estaba en esta versión y hoy ya no está.', status: 'deleted' },
    { title: 'Modificado desde entonces', hint: 'Al recuperar, vuelve a como estaba en esta versión.', status: 'changed' },
    { title: 'Creado desde entonces', hint: 'No existía todavía. Restaurar la página completa lo quitaría.', status: 'added' },
  ]

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex h-[85vh] max-w-[calc(100%-2rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-5xl">
        <div className="flex min-h-0 flex-1">
          {/* Version list */}
          <aside className="flex w-40 shrink-0 flex-col border-r sm:w-60 border-border">
            <div className="border-b border-border px-4 py-3">
              <DialogTitle className="text-base">Historial de versiones</DialogTitle>
              <p className="mt-0.5 text-xs text-muted-foreground">Se guarda solo, antes de cada cambio.</p>
            </div>
            <div className="notion-scroll flex-1 overflow-y-auto p-1.5">
              {versions === null ? (
                <Loader2 className="mx-auto my-6 h-5 w-5 animate-spin text-muted-foreground" />
              ) : versions.length === 0 ? (
                <p className="px-3 py-6 text-sm text-muted-foreground">
                  Todavía no hay versiones guardadas. Se van a ir guardando a medida que se edite la página.
                </p>
              ) : (
                versions.map((v) => (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => setSelected(v.id)}
                    className={cn(
                      'block w-full rounded-md px-3 py-2 text-left hover:bg-accent',
                      selected === v.id && 'bg-accent'
                    )}
                  >
                    <span className="block text-sm font-medium">{when(v.createdAt)}</span>
                    {v.editedBy && (
                      <span className="block truncate text-xs text-muted-foreground">Después editó {v.editedBy.split(' ')[0]}</span>
                    )}
                  </button>
                ))
              )}
            </div>
          </aside>

          {/* Selected version */}
          <section className="flex min-w-0 flex-1 flex-col">
            <header className="flex flex-wrap items-center gap-2 border-b border-border px-5 py-3 pr-12">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{selectedInfo ? `Así estaba: ${when(selectedInfo.createdAt).toLowerCase()}` : ' '}</p>
                <p className="text-xs text-muted-foreground">Comparado con cómo está ahora.</p>
              </div>
              {selected && diff && (diff.items.length > 0 || diff.other.length > 0) && (
                confirmAll ? (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">¿Volver toda la página a esta versión?</span>
                    <button type="button" onClick={() => setConfirmAll(false)} className="rounded-md px-2.5 py-1.5 text-sm hover:bg-accent">
                      Cancelar
                    </button>
                    <button
                      type="button"
                      disabled={!!busy}
                      onClick={() => restore()}
                      className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
                    >
                      {busy === 'all' && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                      Sí, restaurar
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmAll(true)}
                    className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm font-medium hover:bg-accent"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    Restaurar toda la página
                  </button>
                )
              )}
            </header>

            <div className="notion-scroll flex-1 overflow-y-auto px-5 py-4">
              {!selected ? null : loadingDetail && !detail ? (
                <Loader2 className="mx-auto my-10 h-5 w-5 animate-spin text-muted-foreground" />
              ) : !diff ? (
                <p className="text-sm text-muted-foreground">No se pudo cargar esta versión.</p>
              ) : diff.items.length === 0 && diff.other.length === 0 ? (
                <p className="text-sm text-muted-foreground">Esta versión es igual a la página actual.</p>
              ) : (
                <div className="space-y-6">
                  {groups.map((g) => {
                    const list = diff.items.filter((i) => i.status === g.status)
                    if (!list.length) return null
                    return (
                      <div key={g.status}>
                        <h3 className="text-sm font-semibold">
                          {g.title} <span className="font-normal text-muted-foreground">({list.length})</span>
                        </h3>
                        <p className="mb-2 text-xs text-muted-foreground">{g.hint}</p>
                        <ul className="divide-y divide-border rounded-lg border border-border">
                          {list.map((i) => (
                            <li key={i.kind + i.id} className="flex items-center gap-3 px-3 py-2">
                              <span className="w-5 shrink-0 text-center">
                                {i.icon || (i.kind === 'row' ? <FileText className="mx-auto h-3.5 w-3.5 text-muted-foreground" /> : <SquareKanban className="mx-auto h-3.5 w-3.5 text-muted-foreground" />)}
                              </span>
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-sm">{i.title || 'Sin título'}</p>
                                <p className="truncate text-xs text-muted-foreground">
                                  {i.where}
                                  {i.fields.length > 0 && ` · cambió: ${i.fields.join(', ')}`}
                                </p>
                              </div>
                              {i.status !== 'added' && (
                                <button
                                  type="button"
                                  disabled={!!busy}
                                  onClick={() => restore(i.kind === 'row' ? { rowIds: [i.id] } : { cardIds: [i.id] }, i.id)}
                                  className="flex shrink-0 items-center gap-1 rounded-md border border-border px-2 py-1 text-xs hover:bg-accent disabled:opacity-60"
                                >
                                  {busy === i.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCcw className="h-3 w-3" />}
                                  {i.status === 'deleted' ? 'Recuperar' : 'Volver a como estaba'}
                                </button>
                              )}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )
                  })}
                  {diff.other.length > 0 && (
                    <div>
                      <h3 className="text-sm font-semibold">Otros cambios</h3>
                      <p className="mb-2 text-xs text-muted-foreground">Solo vuelven si restaurás toda la página.</p>
                      <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                        {diff.other.map((o) => (
                          <li key={o}>{o}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  )
}
