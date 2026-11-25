'use client'

import { useEffect, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import { toast } from 'sonner'
import type { BlockNoteEditor } from '@blocknote/core'
import { ArrowLeft, Copy, FileUp, Link2, Loader2, Trash2 } from 'lucide-react'
import { ResizableSidePanel } from '@/components/resizable-side-panel'
import { Button } from '@/components/ui/button'
import { CommentsSection } from '@/components/comments-section'
import { EmojiPicker } from '@/components/emoji-picker'
import { useDb, type Person } from '@/components/db/db-context'
import { useDocSync } from '@/hooks/use-doc-sync'
import { PropertyCell } from '@/components/db/property-value'
import { AddPropertyButton, PropertyIcon, PropertyMenu } from '@/components/db/property-menu'
import { admitePresupuesto, PresupuestoBlock } from '@/components/presupuesto/presupuesto-block'
import * as api from '@/lib/api'
import { parseDoc, serializeDoc, type DocBlock } from '@/lib/blocks'
import { importDocumentWithToast } from '@/lib/import-doc'
import { useOpenSubPages, useSubPages } from '@/lib/subpage-store'
import { SubPageRootContext } from '@/components/subpage-block'
import { SubPageView } from '@/components/subpage-view'
import type { CardComment } from '@/lib/types'
import type { DatabaseDef, DbRow } from '@/lib/db-types'

const RichEditor = dynamic(() => import('@/components/rich-editor'), {
  ssr: false,
  loading: () => <div className="px-11 py-2 text-sm text-muted-foreground">Cargando editor…</div>,
})

export function RowPanel({
  rowId,
  onClose,
}: {
  rowId: string | null
  onClose: () => void
}) {
  const { ctx } = useDb()
  let db: DatabaseDef | undefined
  let row: DbRow | undefined
  if (rowId) {
    for (const d of ctx.databases) {
      const r = d.rows.find((x) => x.id === rowId)
      if (r) {
        db = d
        row = r
        break
      }
    }
  }

  // Pages inside the row's document open here, in place of the row.
  const root = rowId ? `row:${rowId}` : ''
  const subpages = useOpenSubPages(root)
  const close = () => {
    useSubPages.getState().reset()
    onClose()
  }

  return (
    <ResizableSidePanel open={rowId !== null} onClose={close} title={row?.title} className="notion-scroll w-full overflow-y-auto p-0 sm:max-w-none">
      {db && row ? (
        <SubPageRootContext.Provider value={root}>
          {subpages.length ? (
            <SubPageView key={subpages[subpages.length - 1].id} crumbs={subpages} rootTitle={row.title} rootIcon={row.icon} />
          ) : (
            <RowBody key={row.id} db={db} row={row} onClose={close} />
          )}
        </SubPageRootContext.Provider>
      ) : (
        <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
          {rowId ? 'Esta fila ya no existe.' : ''}
        </div>
      )}
    </ResizableSidePanel>
  )
}

function RowBody({ db, row, onClose }: { db: DatabaseDef; row: DbRow; onClose: () => void }) {
  const { ws, people } = useDb()
  const [detail, setDetail] = useState<{ content: string | null; blocks: DocBlock[]; comments: CardComment[] } | null>(null)
  const [title, setTitle] = useState(row.title)
  const editorRef = useRef<BlockNoteEditor | null>(null)
  useEffect(() => {
    let cancelled = false
    api
      .fetchRowDetail(row.id)
      .then((d) => {
        if (cancelled) return
        setDetail({ content: d.content, blocks: parseDoc(d.content), comments: d.comments })
      })
      .catch(() => {
        if (!cancelled) setDetail({ content: null, blocks: [], comments: [] })
      })
    return () => {
      cancelled = true
    }
  }, [row.id])


  // Keep the title box in sync when someone else renames the row.
  useEffect(() => {
    setTitle(row.title)
  }, [row.title])

  const props = db.properties.filter((p) => p.type !== 'title')

  return (
    <div className="flex h-full flex-col">
      <div className="sticky top-0 z-20 flex items-center justify-between gap-1 border-b border-border bg-background/95 px-2 py-1.5 backdrop-blur">
        <div className="flex min-w-0 items-center gap-1">
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={onClose} aria-label="Volver">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <span className="truncate text-xs text-muted-foreground">
            {db.icon} {db.title}
          </span>
        </div>
        <div className="flex items-center gap-0.5 pr-16">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0"
            title="Copiar enlace"
            aria-label="Copiar enlace"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(`${window.location.origin}/?row=${row.id}`)
                toast.success('Enlace copiado')
              } catch {
                toast.error('No se pudo copiar')
              }
            }}
          >
            <Link2 className="h-3.5 w-3.5" />
          </Button>
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
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" title="Duplicar" aria-label="Duplicar" onClick={() => ws.duplicateRow(row.id)}>
            <Copy className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0 hover:text-destructive"
            title="Eliminar"
            aria-label="Eliminar"
            onClick={() => {
              if (!window.confirm(`¿Eliminar "${row.title || 'Sin título'}"?`)) return
              onClose()
              ws.deleteRow(row.id)
            }}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <div className="peek-body flex-1 space-y-5 overflow-y-auto px-5 pb-10 pt-6">
        {/* Icon + title */}
        <div className="space-y-1">
          <EmojiPicker
            onSelect={(e) => ws.updateRowMeta(row.id, { icon: e })}
            onRemove={row.icon ? () => ws.updateRowMeta(row.id, { icon: null }) : undefined}
          >
            <button
              type="button"
              className="flex h-12 w-14 items-center justify-center rounded-lg text-4xl leading-none hover:bg-accent/60"
              aria-label="Ícono"
              title="Elegir ícono"
            >
              {row.icon || <span className="opacity-25">🙂</span>}
            </button>
          </EmojiPicker>
          <textarea
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => {
              if (title !== row.title) ws.updateRowMeta(row.id, { title })
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                ;(e.target as HTMLTextAreaElement).blur()
              }
            }}
            rows={1}
            placeholder="Sin título"
            className="block w-full resize-none bg-transparent text-3xl font-bold leading-tight outline-none [field-sizing:content] placeholder:text-muted-foreground/50"
            aria-label="Título"
          />
        </div>

        {/* Properties */}
        <div className="space-y-0.5">
          {props.map((p) => (
            <div key={p.id} className="flex items-start gap-1">
              <PropertyMenu db={db} prop={p} align="start">
                <button type="button" className="flex h-8 w-40 shrink-0 items-center gap-2 rounded px-2 text-left text-sm text-muted-foreground hover:bg-accent">
                  <PropertyIcon type={p.type} />
                  <span className="truncate">{p.name}</span>
                </button>
              </PropertyMenu>
              <div className="min-w-0 flex-1 text-sm">
                <PropertyCell db={db} row={row} prop={p} variant="panel" />
              </div>
            </div>
          ))}
          <AddPropertyButton db={db} label="Agregar propiedad" className="h-8 rounded px-2 hover:bg-accent" />
        </div>

        {admitePresupuesto(db) && <PresupuestoBlock rowId={row.id} titulo={row.title} />}

        <div className="border-t border-border pt-4">
          {detail ? (
            <CommentsSection
              comments={detail.comments}
              onAdd={async (text) => {
                try {
                  const c = await api.addRowComment(row.id, text)
                  setDetail((d) => (d ? { ...d, comments: [...d.comments, c] } : d))
                  ws.setRowCommentCount(row.id, (detail?.comments.length ?? 0) + 1)
                } catch {
                  toast.error('No se pudo guardar el comentario')
                }
              }}
              onDelete={async (id) => {
                try {
                  await api.deleteComment(id)
                  setDetail((d) => (d ? { ...d, comments: d.comments.filter((c) => c.id !== id) } : d))
                  ws.setRowCommentCount(row.id, Math.max(0, (detail?.comments.length ?? 1) - 1))
                } catch {
                  toast.error('No se pudo eliminar el comentario')
                }
              }}
            />
          ) : (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          )}
        </div>

        <div className="-mx-5 border-t border-border pt-3">
          {detail && (
            <RowContentEditor
              rowId={row.id}
              initial={detail.content}
              blocks={detail.blocks}
              people={people}
              onEditor={(e) => {
                editorRef.current = e
              }}
            />
          )}
        </div>
      </div>
    </div>
  )
}

/** Row page content: saved while typing and kept in sync with other people's edits. */
function RowContentEditor({
  rowId,
  initial,
  blocks,
  people,
  onEditor,
}: {
  rowId: string
  initial: string | null
  blocks: DocBlock[]
  people: Person[]
  onEditor?: (editor: BlockNoteEditor | null) => void
}) {
  const sync = useDocSync({
    initial,
    fetchLatest: async () => (await api.fetchRowDetail(rowId)).content,
    save: (content, baseHash) => api.saveDocContent('row', rowId, content, baseHash),
  })
  return (
    <RichEditor
      initialBlocks={blocks}
      people={people}
      docRef={{ kind: 'row', id: rowId }}
      onChange={sync.onChange}
      onReady={(editor) => {
        sync.onReady(editor)
        onEditor?.(editor)
      }}
    />
  )
}
