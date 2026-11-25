'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Check, Copy, Loader2, PlugZap, RefreshCw, Unplug } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { formatDateAR } from '@/lib/utils'
import * as api from '@/lib/api'

/**
 * Hands out the private link that connects Claude to Malta (an MCP custom
 * connector), so Claude can read pages and create or update documents.
 */
export function ClaudeConnectDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const [status, setStatus] = useState<{ connected: boolean; createdAt: string | null } | null>(null)
  const [url, setUrl] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) {
      // The link is shown once: forget it when the dialog closes.
      setUrl(null)
      return
    }
    api
      .getClaudeConnector()
      .then(setStatus)
      .catch(() => toast.error('No se pudo consultar la conexión con Claude'))
  }, [open])

  async function generate() {
    if (status?.connected && !window.confirm('Se genera un enlace nuevo y el anterior deja de funcionar: vas a tener que actualizarlo en Claude. ¿Continuar?')) return
    setBusy(true)
    try {
      const r = await api.createClaudeConnector()
      setUrl(r.url)
      setStatus({ connected: true, createdAt: r.createdAt })
    } catch {
      toast.error('No se pudo generar el enlace')
    } finally {
      setBusy(false)
    }
  }

  async function disconnect() {
    if (!window.confirm('Claude deja de tener acceso a Malta. ¿Desconectar?')) return
    setBusy(true)
    try {
      await api.deleteClaudeConnector()
      setUrl(null)
      setStatus({ connected: false, createdAt: null })
      toast.success('Claude desconectado')
    } catch {
      toast.error('No se pudo desconectar')
    } finally {
      setBusy(false)
    }
  }

  async function copy() {
    if (!url) return
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      toast.error('No se pudo copiar')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="min-w-0 sm:max-w-lg [&>*]:min-w-0">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PlugZap className="h-5 w-5 text-primary" />
            Conectar con Claude
          </DialogTitle>
          <DialogDescription>
            Claude va a poder ver tus páginas y crear o actualizar documentos en Malta (por ejemplo, guardar un presupuesto en un proyecto) desde el chat.
          </DialogDescription>
        </DialogHeader>

        {!status ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="min-w-0 space-y-4 text-sm">
            {url ? (
              <div className="space-y-2">
                <p className="font-medium">Tu enlace para Claude</p>
                <div className="flex items-center gap-1 rounded-xl bg-muted p-1 pl-3">
                  <code className="min-w-0 flex-1 truncate font-mono text-xs">{url}</code>
                  <Button size="sm" variant="ghost" className="h-8 shrink-0 rounded-lg" onClick={copy}>
                    {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    {copied ? 'Copiado' : 'Copiar'}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">Copialo ahora: por seguridad no se vuelve a mostrar. Si lo perdés, generá uno nuevo.</p>
              </div>
            ) : status.connected ? (
              <div className="rounded-xl bg-muted/60 p-3">
                <p className="font-medium">Claude está conectado</p>
                {status.createdAt && <p className="text-xs text-muted-foreground">Enlace generado el {formatDateAR(status.createdAt)}</p>}
              </div>
            ) : (
              <Button className="w-full rounded-xl" onClick={generate} disabled={busy}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlugZap className="h-4 w-4" />}
                Generar enlace para Claude
              </Button>
            )}

            <div className="space-y-2">
              <p className="font-medium">Cómo agregarlo en Claude</p>
              <ol className="list-decimal space-y-1 pl-5 text-muted-foreground">
                <li>
                  En claude.ai, andá a <b className="text-foreground">Personalizar → Conectores</b>, tocá <b className="text-foreground">+</b> y elegí{' '}
                  <b className="text-foreground">Agregar conector personalizado</b>.
                </li>
                <li>
                  Nombre: <b className="text-foreground">Malta</b>. URL: pegá el enlace. Dejá vacíos los campos de OAuth.
                </li>
                <li>En un chat, activá el conector y pedile a Claude, por ejemplo, “guardá este presupuesto en el proyecto del predio en Malta”.</li>
              </ol>
            </div>

            <div className="rounded-xl bg-muted/60 p-3 text-xs text-muted-foreground">
              El enlace es privado y funciona como una contraseña: quien lo tenga puede leer y modificar lo mismo que vos. Cada cambio que hace Claude queda en el historial
              de versiones de la página.
            </div>

            {status.connected && (
              <div className="flex flex-wrap gap-x-4 gap-y-2">
                <button
                  type="button"
                  onClick={generate}
                  disabled={busy}
                  className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Generar un enlace nuevo (anula el anterior)
                </button>
                <button
                  type="button"
                  onClick={disconnect}
                  disabled={busy}
                  className="flex items-center gap-1.5 text-xs text-destructive hover:underline disabled:opacity-50"
                >
                  <Unplug className="h-3.5 w-3.5" />
                  Desconectar
                </button>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
