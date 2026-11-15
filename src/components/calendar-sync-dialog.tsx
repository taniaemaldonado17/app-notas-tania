'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { CalendarPlus, Check, Copy, Loader2, RefreshCw } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import * as api from '@/lib/api'

/**
 * Explains and hands out the user's private .ics subscription link so the
 * dates show up in Apple Calendar (iPhone, iPad, Mac) or Google Calendar.
 */
export function CalendarSyncDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const [path, setPath] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open || path) return
    api
      .getCalendarFeed()
      .then((r) => setPath(r.path))
      .catch(() => toast.error('No se pudo obtener el enlace del calendario'))
  }, [open, path])

  const httpsUrl = path ? `${window.location.origin}${path}` : ''
  const webcalUrl = httpsUrl.replace(/^https?:/, 'webcal:')

  async function copy() {
    try {
      await navigator.clipboard.writeText(httpsUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      toast.error('No se pudo copiar')
    }
  }

  async function reset() {
    if (!window.confirm('Se genera un enlace nuevo y el anterior deja de funcionar. Vas a tener que volver a suscribirte en tus dispositivos. ¿Continuar?')) return
    setBusy(true)
    try {
      const r = await api.resetCalendarFeed()
      setPath(r.path)
      toast.success('Enlace nuevo generado')
    } catch {
      toast.error('No se pudo generar el enlace')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="min-w-0 sm:max-w-lg [&>*]:min-w-0">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarPlus className="h-5 w-5 text-primary" />
            Ver en el Calendario del iPhone y iPad
          </DialogTitle>
          <DialogDescription>
            Tus tareas, entregas y fechas de proyectos aparecen en el Calendario de Apple como un calendario más, y se actualizan solas.
          </DialogDescription>
        </DialogHeader>

        {!path ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="min-w-0 space-y-4 text-sm">
            <div className="space-y-2">
              <p className="font-medium">Opción rápida</p>
              <p className="text-muted-foreground">Abrí esta página en el iPhone, iPad o Mac y tocá:</p>
              <Button asChild className="w-full rounded-xl">
                <a href={webcalUrl}>
                  <CalendarPlus className="h-4 w-4" />
                  Suscribirme en Calendario
                </a>
              </Button>
            </div>

            <div className="space-y-2">
              <p className="font-medium">O a mano</p>
              <div className="flex items-center gap-1 rounded-xl bg-muted p-1 pl-3">
                <code className="min-w-0 flex-1 truncate font-mono text-xs">{httpsUrl}</code>
                <Button size="sm" variant="ghost" className="h-8 shrink-0 rounded-lg" onClick={copy}>
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  {copied ? 'Copiado' : 'Copiar'}
                </Button>
              </div>
              <ol className="list-decimal space-y-1 pl-5 text-muted-foreground">
                <li>
                  En el iPhone/iPad: <b className="text-foreground">Ajustes → Apps → Calendario → Cuentas de calendario → Añadir cuenta → Otra</b>.
                </li>
                <li>
                  Tocá <b className="text-foreground">Añadir calendario suscrito</b>, pegá el enlace y guardá.
                </li>
                <li>
                  En Google Calendar (web): <b className="text-foreground">Otros calendarios → + → Desde URL</b>.
                </li>
              </ol>
            </div>

            <div className="rounded-xl bg-muted/60 p-3 text-xs text-muted-foreground">
              Es de solo lectura: los cambios se hacen acá y el Calendario los trae solo (Apple lo revisa cada tanto; podés elegir la frecuencia en
              los ajustes de la cuenta). El enlace es privado: cualquiera que lo tenga puede ver tus fechas.
            </div>

            <button
              type="button"
              onClick={reset}
              disabled={busy}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Generar un enlace nuevo (anula el anterior)
            </button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
