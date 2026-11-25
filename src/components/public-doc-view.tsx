'use client'

import { useMemo } from 'react'
import dynamic from 'next/dynamic'
import { ArrowLeft, Download, Link2, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { parseDoc } from '@/lib/blocks'
import { printDoc } from '@/lib/print-doc'

const DocPaper = dynamic(() => import('@/components/doc-read-only'), {
  ssr: false,
  loading: () => <Loader2 className="h-4 w-4 animate-spin text-[#86868b]" />,
})

type Props = {
  token: string
  isSubPage: boolean
  doc: { title: string; icon: string | null; coverUrl: string | null; content: string | null; updatedAt: string }
}

/** What someone with a shared link sees: the page, read-only, on white. */
export function PublicDocView({ token, isSubPage, doc }: Props) {
  const paper = useMemo(
    () => ({ title: doc.title, icon: doc.icon, coverUrl: doc.coverUrl, blocks: parseDoc(doc.content) }),
    [doc]
  )

  const updated = new Date(doc.updatedAt).toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' })

  return (
    <div className="doc-paper-page min-h-dvh bg-white text-[#1d1d1f]">
      <div className="sticky top-0 z-10 border-b border-[#e3e3e8] bg-white/90 backdrop-blur print:hidden">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-2 px-4 py-2">
          <div className="flex min-w-0 items-center gap-2 text-xs text-[#86868b]">
            {isSubPage ? (
              <a href={`/compartido/${token}`} className="flex items-center gap-1 rounded px-1.5 py-1 hover:bg-[#f2f2f7] hover:text-[#1d1d1f]">
                <ArrowLeft className="h-3.5 w-3.5" /> Volver
              </a>
            ) : null}
            <span className="truncate">Solo lectura · actualizado el {updated}</span>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              className="flex h-8 items-center gap-1.5 rounded-md px-2 text-xs hover:bg-[#f2f2f7]"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(window.location.href)
                  toast.success('Enlace copiado')
                } catch {
                  toast.error('No se pudo copiar')
                }
              }}
            >
              <Link2 className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Copiar enlace</span>
            </button>
            <button
              type="button"
              className="flex h-8 items-center gap-1.5 rounded-md bg-[#1d1d1f] px-3 text-xs font-medium text-white hover:bg-black"
              onClick={() => void printDoc(paper)}
            >
              <Download className="h-3.5 w-3.5" /> Descargar PDF
            </button>
          </div>
        </div>
      </div>
      <main className="mx-auto max-w-3xl px-5 pb-20 pt-10 sm:px-8">
        <DocPaper doc={paper} subPageHref={(id) => `/compartido/${token}?p=${encodeURIComponent(id)}`} />
      </main>
    </div>
  )
}
