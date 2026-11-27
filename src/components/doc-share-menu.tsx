'use client'

import { useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { Download, Globe, Link2, Loader2, MessageCircle, Share, Share2, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import * as api from '@/lib/api'
import { useEsAdmin } from '@/hooks/use-es-admin'
import { printDoc } from '@/lib/print-doc'
import type { PaperDoc } from '@/components/doc-read-only'
import type { DocRef } from '@/lib/subpages'

/**
 * Copies text that may still be loading. Safari only lets a page write to the
 * clipboard during the click, so the text goes in as a promise right away.
 */
async function copyText(text: Promise<string>) {
  if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
    try {
      await navigator.clipboard.write([
        new ClipboardItem({ 'text/plain': text.then((t) => new Blob([t], { type: 'text/plain' })) }),
      ])
      return
    } catch {
      // Fall back to writeText below.
    }
  }
  await navigator.clipboard.writeText(await text)
}

/**
 * "Compartir" menu of a document (row, card or sub-page):
 * - Descargar PDF, with its formatting (titles, colours, lists, images).
 * - A public read-only link anyone can open without an account; it can be
 *   turned off at any time.
 * `extra` adds more items at the end (e.g. the card's Markdown export).
 */
export function DocShareMenu({
  docRef,
  getDoc,
  extra,
  compact = false,
}: {
  docRef: DocRef
  /** The document as it is on screen now (title, icon, blocks). */
  getDoc: () => PaperDoc
  extra?: ReactNode
  /** Icon only, without the "Compartir" label. */
  compact?: boolean
}) {
  // undefined = not checked yet
  const [link, setLink] = useState<api.PublicLinkInfo | null | undefined>(undefined)
  const [busy, setBusy] = useState(false)
  // Public links are for the app admins only (the server checks it too).
  const esAdmin = useEsAdmin()

  function onOpenChange(open: boolean) {
    if (!open || !esAdmin) return
    api
      .fetchPublicLink(docRef)
      .then(setLink)
      .catch(() => setLink(null))
  }

  function ensureLink(): Promise<api.PublicLinkInfo> {
    if (link) return Promise.resolve(link)
    setBusy(true)
    return api
      .createPublicLink(docRef)
      .then((l) => {
        setLink(l)
        return l
      })
      .finally(() => setBusy(false))
  }

  async function copyLink() {
    const pending = ensureLink()
    try {
      await copyText(pending.then((l) => l.url))
      toast.success(link ? 'Enlace copiado' : 'Enlace creado y copiado', {
        description: 'Cualquiera con el enlace puede ver la página (sin editarla).',
      })
    } catch {
      try {
        const l = await pending
        toast.info('Enlace creado', { description: l.url })
      } catch {
        toast.error('No se pudo crear el enlace')
      }
    }
  }

  async function nativeShare() {
    try {
      const l = await ensureLink()
      const doc = getDoc()
      await navigator.share({ title: doc.title || 'Sin título', url: l.url })
    } catch (e) {
      if ((e as Error)?.name !== 'AbortError') toast.error('No se pudo compartir')
    }
  }

  async function whatsApp() {
    // Open the window during the click (popup blockers), then point it at WhatsApp.
    const win = window.open('', '_blank')
    try {
      const l = await ensureLink()
      const doc = getDoc()
      const text = encodeURIComponent(`${doc.icon ? `${doc.icon} ` : ''}${doc.title || 'Sin título'}\n${l.url}`)
      const url = `https://wa.me/?text=${text}`
      if (win) win.location.href = url
      else window.location.href = url
    } catch {
      win?.close()
      toast.error('No se pudo crear el enlace')
    }
  }

  async function stopSharing() {
    if (!window.confirm('¿Dejar de compartir? El enlace público dejará de funcionar.')) return
    try {
      await api.deletePublicLink(docRef)
      setLink(null)
      toast.success('Ya no se comparte públicamente')
    } catch {
      toast.error('No se pudo dejar de compartir')
    }
  }

  const canNativeShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function'

  return (
    <DropdownMenu onOpenChange={onOpenChange}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={compact ? 'h-8 w-8 p-0' : 'h-8 gap-1.5 px-2 text-xs'}
          title="Compartir o descargar PDF"
          aria-label="Compartir"
        >
          <Share2 className="h-3.5 w-3.5" />
          {!compact && <span className="hidden sm:inline">Compartir</span>}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuItem className="cursor-pointer text-sm" onClick={() => void printDoc(getDoc())}>
          <Download className="mr-2 h-3.5 w-3.5" />
          Descargar PDF
        </DropdownMenuItem>
        {esAdmin && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="flex items-center gap-1.5 text-xs font-normal text-muted-foreground">
              <Globe className="h-3 w-3" />
              {link === undefined ? (
                <>
                  Enlace público <Loader2 className="h-3 w-3 animate-spin" />
                </>
              ) : link ? (
                'Compartida: cualquiera con el enlace puede verla'
              ) : (
                'Enlace público de solo lectura'
              )}
            </DropdownMenuLabel>
            <DropdownMenuItem className="cursor-pointer text-sm" disabled={busy} onClick={() => void copyLink()}>
              <Link2 className="mr-2 h-3.5 w-3.5" />
              {link ? 'Copiar enlace público' : 'Crear enlace para compartir'}
            </DropdownMenuItem>
            {canNativeShare && (
              <DropdownMenuItem className="cursor-pointer text-sm" disabled={busy} onClick={() => void nativeShare()}>
                <Share className="mr-2 h-3.5 w-3.5" />
                Compartir enlace…
              </DropdownMenuItem>
            )}
            <DropdownMenuItem className="cursor-pointer text-sm" disabled={busy} onClick={() => void whatsApp()}>
              <MessageCircle className="mr-2 h-3.5 w-3.5" />
              Enviar enlace por WhatsApp
            </DropdownMenuItem>
            {link && (
              <DropdownMenuItem className="cursor-pointer text-sm text-destructive focus:text-destructive" onClick={() => void stopSharing()}>
                <XCircle className="mr-2 h-3.5 w-3.5" />
                Dejar de compartir
              </DropdownMenuItem>
            )}
          </>
        )}
        {extra ? (
          <>
            <DropdownMenuSeparator />
            {extra}
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
