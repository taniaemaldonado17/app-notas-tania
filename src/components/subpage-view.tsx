'use client'

import { Fragment, useEffect, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import { toast } from 'sonner'
import type { BlockNoteEditor } from '@blocknote/core'
import { ArrowLeft, ChevronRight, FileText, FileUp, Link2, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { EmojiPicker } from '@/components/emoji-picker'
import { useDocSync } from '@/hooks/use-doc-sync'
import * as api from '@/lib/api'
import { parseDoc, type DocBlock } from '@/lib/blocks'
import { importDocumentWithToast } from '@/lib/import-doc'
import { useSubPages, type SubPageCrumb } from '@/lib/subpage-store'
import type { SubPageInfo } from '@/lib/subpages'
import { DocShareMenu } from '@/components/doc-share-menu'
import { DocLogo } from '@/components/doc-logo'

const RichEditor = dynamic(() => import('@/components/rich-editor'), {
  ssr: false,
  loading: () => <div className="px-11 py-2 text-sm text-muted-foreground">Cargando editor…</div>,
})

/**
 * A page inside a document, shown in place of its row or card in the side
 * panel (like opening a sub-page in Notion), with a breadcrumb to go back.
 */
export function SubPageView({
  crumbs,
  rootTitle,
  rootIcon,
}: {
  /** Open sub-pages, outermost first; the last one is shown. */
  crumbs: SubPageCrumb[]
  /** The row or card that contains them. */
  rootTitle: string
  rootIcon?: string | null
}) {
  const current = crumbs[crumbs.length - 1]
  const [sub, setSub] = useState<SubPageInfo | null>(null)
  const [missing, setMissing] = useState(false)
  const [title, setTitle] = useState(current.title)
  const editorRef = useRef<BlockNoteEditor | null>(null)

  useEffect(() => {
    let cancelled = false
    api
      .fetchSubPage(current.id)
      .then((s) => {
        if (cancelled) return
        setSub(s)
        setTitle(s.title)
        useSubPages.getState().rename(s.id, { title: s.title, icon: s.icon })
      })
      .catch(() => {
        if (!cancelled) setMissing(true)
      })
    return () => {
      cancelled = true
    }
  }, [current.id])

  async function saveMeta(patch: { title?: string; icon?: string | null; logoUrl?: string | null }) {
    try {
      await api.updateSubPageMeta(current.id, patch)
      const { title: t, icon: i } = patch
      if (t !== undefined || i !== undefined) useSubPages.getState().rename(current.id, { ...(t !== undefined ? { title: t } : {}), ...(i !== undefined ? { icon: i } : {}) })
      setSub((s) => (s ? { ...s, ...patch } : s))
    } catch {
      toast.error('No se pudo guardar')
    }
  }

  const { back, backTo } = useSubPages.getState()

  return (
    <div className="flex h-full flex-col">
      <div className="sticky top-0 z-20 flex items-center justify-between gap-1 border-b border-border bg-background/95 px-2 py-1.5 backdrop-blur">
        <div className="flex min-w-0 items-center gap-1">
          <Button variant="ghost" size="sm" className="h-8 w-8 shrink-0 p-0" onClick={back} aria-label="Volver" title="Volver">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <nav className="flex min-w-0 items-center gap-0.5 text-xs text-muted-foreground" aria-label="Ubicación">
            <button type="button" className="max-w-[10rem] truncate rounded px-1 py-0.5 hover:bg-accent hover:text-foreground" onClick={() => backTo(-1)}>
              {rootIcon ? `${rootIcon} ` : ''}
              {rootTitle || 'Sin título'}
            </button>
            {crumbs.map((c, i) => (
              <Fragment key={c.id}>
                <ChevronRight className="h-3 w-3 shrink-0 opacity-60" />
                <button
                  type="button"
                  className={`max-w-[10rem] truncate rounded px-1 py-0.5 hover:bg-accent hover:text-foreground ${i === crumbs.length - 1 ? 'text-foreground' : ''}`}
                  onClick={() => backTo(i)}
                >
                  {c.icon ? `${c.icon} ` : ''}
                  {c.title || 'Sin título'}
                </button>
              </Fragment>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-0.5 pr-16">
          {sub && (
            <DocShareMenu
              docRef={{ kind: 'subpage', id: sub.id }}
              getDoc={() => ({
                title,
                icon: sub.icon,
                logoUrl: sub.logoUrl,
                blocks: (editorRef.current?.document as DocBlock[] | undefined) ?? parseDoc(sub.content),
              })}
            />
          )}
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0"
            title="Importar documento (.md, Word)"
            aria-label="Importar documento"
            onClick={() => void importDocumentWithToast(editorRef.current, 'end')}
          >
            <FileUp className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0"
            title="Copiar enlace"
            aria-label="Copiar enlace"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(`${window.location.origin}/?subpage=${current.id}`)
                toast.success('Enlace copiado')
              } catch {
                toast.error('No se pudo copiar')
              }
            }}
          >
            <Link2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <div className="peek-body flex-1 space-y-5 overflow-y-auto px-5 pb-10 pt-6">
        {missing ? (
          <div className="py-10 text-center text-sm text-muted-foreground">Esta página ya no existe o no tenés acceso.</div>
        ) : !sub ? (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        ) : (
          <>
            <div className="space-y-1">
              <DocLogo url={sub.logoUrl} onChange={(logoUrl) => saveMeta({ logoUrl })} />
              <EmojiPicker onSelect={(e) => void saveMeta({ icon: e })} onRemove={sub.icon ? () => void saveMeta({ icon: null }) : undefined}>
                <button
                  type="button"
                  className="flex h-12 w-14 items-center justify-center rounded-lg text-4xl leading-none hover:bg-accent/60"
                  aria-label="Ícono"
                  title="Elegir ícono"
                >
                  {sub.icon || <FileText className="h-9 w-9 text-muted-foreground/40" />}
                </button>
              </EmojiPicker>
              <textarea
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onBlur={() => {
                  if (title !== sub.title) void saveMeta({ title })
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    ;(e.target as HTMLTextAreaElement).blur()
                  }
                }}
                rows={1}
                autoFocus={!sub.title}
                placeholder="Sin título"
                className="block w-full resize-none bg-transparent text-3xl font-bold leading-tight outline-none [field-sizing:content] placeholder:text-muted-foreground/50"
                aria-label="Título"
              />
            </div>
            <div className="-mx-5">
              <SubPageEditor
                key={sub.id}
                sub={sub}
                onUseAsLogo={(logoUrl) => void saveMeta({ logoUrl })}
                onEditor={(e) => {
                  editorRef.current = e
                }}
              />
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function SubPageEditor({ sub, onEditor, onUseAsLogo }: { sub: SubPageInfo; onEditor: (e: BlockNoteEditor | null) => void; onUseAsLogo: (url: string) => void }) {
  const [blocks] = useState<DocBlock[]>(() => parseDoc(sub.content))
  const sync = useDocSync({
    initial: sub.content,
    fetchLatest: async () => (await api.fetchSubPage(sub.id)).content,
    save: (content, baseHash) => api.saveDocContent('subpage', sub.id, content, baseHash),
  })
  return (
    <RichEditor
      initialBlocks={blocks}
      pageId={sub.pageId}
      docRef={{ kind: 'subpage', id: sub.id }}
      onUseAsLogo={onUseAsLogo}
      onChange={sync.onChange}
      onReady={(editor) => {
        sync.onReady(editor)
        onEditor(editor)
      }}
    />
  )
}
