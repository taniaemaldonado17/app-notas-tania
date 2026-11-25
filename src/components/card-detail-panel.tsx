'use client'

import { useEffect, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import { toast } from 'sonner'
import { useWorkspace } from '@/lib/workspace-store'
import { useWorkspacePage, findCard } from '@/hooks/use-workspace-page'
import { ResizableSidePanel } from '@/components/resizable-side-panel'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { InlineEdit } from '@/components/inline-edit'
import { CommentsSection } from '@/components/comments-section'
import { AttachmentsSection } from '@/components/attachments-section'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu'
import {
  Check,
  Image as ImageIcon,
  Loader2,
  Plus,
  Trash2,
  X,
  ArrowLeft,
  Share2,
  Star,
  Copy,
  MoreHorizontal,
  Printer,
  FileDown,
  MessageCircle,
  Link2,
  Send,
  ImagePlus,
  Palette,
  Smile,
  FileUp,
} from 'lucide-react'
import type { Card } from '@/lib/types'
import type { BlockNoteEditor } from '@blocknote/core'
import type { DocBlock } from '@/lib/blocks'
import { parseDoc, serializeDoc } from '@/lib/blocks'
import * as api from '@/lib/api'
import { uploadImage } from '@/lib/api'
import { useDocSync } from '@/hooks/use-doc-sync'
import { importDocumentWithToast } from '@/lib/import-doc'
import { useOpenSubPages, useSubPages } from '@/lib/subpage-store'
import { SubPageRootContext } from '@/components/subpage-block'
import { SubPageView } from '@/components/subpage-view'
import { formatDateAR, hexToRgba } from '@/lib/utils'

// The editor touches the DOM on load, so it can only render in the browser.
const RichEditor = dynamic(() => import('@/components/rich-editor'), {
  ssr: false,
  loading: () => (
    <div className="px-11 py-2 text-sm text-muted-foreground">Cargando editor…</div>
  ),
})

// Same options as in card-item.tsx for the personalization menu
const ACCENT_OPTIONS = [
  { label: 'Ninguno', value: '' },
  { label: 'Rojo', value: '#E0584C' },
  { label: 'Naranja', value: '#D39E4F' },
  { label: 'Verde', value: '#5FB88A' },
  { label: 'Cian', value: '#2EA8C4' },
  { label: 'Violeta', value: '#8E7CC3' },
  { label: 'Gris', value: '#9B9A97' },
]

const ICON_OPTIONS = [
  '', '📓', '📋', '✏️', '🗂️', '💡', '🔧', '⚙️', '🚧', '📍', '🗺️', '💧', '🔥', '✅', '⚠️', '📌',
]

type Props = {
  workspace: ReturnType<typeof useWorkspacePage>
}

export function CardDetailPanel({ workspace }: Props) {
  const { selectedCardId, closeCard } = useWorkspace()
  const card = findCard(workspace.page, selectedCardId)
  // Pages inside the card's document open here, in place of the card.
  const root = selectedCardId ? `card:${selectedCardId}` : ''
  const subpages = useOpenSubPages(root)
  const close = () => {
    useSubPages.getState().reset()
    closeCard()
  }

  return (
    <ResizableSidePanel
      open={selectedCardId !== null}
      onClose={close}
      title={card?.title}
      className="notion-scroll w-full overflow-y-auto p-0 sm:max-w-none"
    >
      {card ? (
        <SubPageRootContext.Provider value={root}>
          {subpages.length ? (
            <SubPageView key={subpages[subpages.length - 1].id} crumbs={subpages} rootTitle={card.title} rootIcon={card.icon} />
          ) : (
            <PanelBody key={card.id} card={card} workspace={workspace} />
          )}
        </SubPageRootContext.Provider>
      ) : (
        <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
          Cargando…
        </div>
      )}
    </ResizableSidePanel>
  )
}

function PanelBody({
  card,
  workspace,
}: {
  card: Card
  workspace: ReturnType<typeof useWorkspacePage>
}) {
  const { closeCard } = useWorkspace()
  // PanelBody is keyed by card id, so this runs once per opened card.
  const [initialBlocks] = useState<DocBlock[]>(() => parseDoc(card.description))
  const [newItemText, setNewItemText] = useState('')
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  // Content: saved while typing and kept in sync with other people's edits.
  const sync = useDocSync({
    initial: card.description,
    fetchLatest: () => api.fetchCardDescription(card.id),
    save: (content, baseHash) => api.saveDocContent('card', card.id, content, baseHash),
    onSaved: (content) => workspace.setCardDescriptionLocal(card.id, content),
  })
  const editorRef = sync.editorRef

  const accentStyle = card.accentColor
    ? {
        borderLeft: `4px solid ${card.accentColor}`,
        background: `linear-gradient(90deg, ${hexToRgba(card.accentColor, 0.06)} 0%, transparent 40%)`,
      }
    : undefined

  async function handleAddChecklistItem() {
    const text = newItemText.trim()
    if (!text) return
    setNewItemText('')
    await workspace.addChecklistItem(card.id, text)
  }

  async function handleToggleChecklist(itemId: string, checked: boolean) {
    await workspace.updateChecklistItem(card.id, itemId, { checked: !checked })
  }

  async function handleDeleteChecklist(itemId: string) {
    await workspace.deleteChecklistItem(card.id, itemId)
  }

  async function handleCoverSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const url = await uploadImage(file)
      await workspace.updateCard(card.id, { coverUrl: url })
      toast.success('Imagen adjuntada')
    } catch (err) {
      toast.error('No se pudo subir la imagen')
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  async function handleRemoveCover() {
    await workspace.updateCard(card.id, { coverUrl: null })
    toast.success('Portada eliminada')
  }

  async function handleDeleteCard() {
    await workspace.deleteCard(card.id)
    closeCard()
  }

  // --- Toolbar actions ---

  async function handleCopyLink() {
    try {
      const url = `${window.location.origin}/?card=${card.id}`
      await navigator.clipboard.writeText(url)
      toast.success('Enlace copiado al portapapeles')
    } catch {
      toast.error('No se pudo copiar el enlace')
    }
  }

  async function handleDuplicate() {
    try {
      // Create a copy of the card in the same column with "(copia)" suffix
      const current = editorRef.current ? serializeDoc(editorRef.current.document as DocBlock[]) : card.description
      await workspace.createCard(card.columnId, `${card.title} (copia)`, current)
      toast.success('Tarjeta duplicada')
    } catch {
      toast.error('No se pudo duplicar la tarjeta')
    }
  }

  function buildMarkdownExport(): string {
    const lines: string[] = []
    lines.push(`# ${card.title}`)
    lines.push('')
    if (card.coverUrl) {
      lines.push(`![Portada](${card.coverUrl})`)
      lines.push('')
    }
    lines.push(`> Creada: ${formatDateAR(card.createdAt)}`)
    lines.push(`> Actualizada: ${formatDateAR(card.updatedAt)}`)
    lines.push('')
    // Content (converted from the editor's blocks)
    const content = editorRef.current?.blocksToMarkdownLossy().trim()
    if (content) {
      lines.push('## Contenido', '', content, '')
    }
    // Comments
    if (card.comments?.length > 0) {
      lines.push('## Comentarios', '')
      for (const c of card.comments) {
        lines.push(`- **${c.user.name || c.user.email}** (${formatDateAR(c.createdAt)}): ${c.text}`)
      }
      lines.push('')
    }
    // Subtareas
    if (card.checklist.length > 0) {
      lines.push('## Subtareas', '')
      for (const it of card.checklist) {
        lines.push(`- [${it.checked ? 'x' : ' '}] ${it.text}`)
      }
      lines.push('')
    }
    // Attachments
    if (card.attachments?.length > 0) {
      lines.push('## Archivos auxiliares', '')
      for (const att of card.attachments) {
        lines.push(`- [${att.title}](${att.url})`)
      }
      lines.push('')
    }
    return lines.join('\n')
  }

  async function handleExportMarkdown() {
    try {
      const md = buildMarkdownExport()
      const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      const safeName = card.title
        .replace(/[^a-z0-9áéíóúñü\s-]/gi, '')
        .replace(/\s+/g, '-')
        .toLowerCase()
        .slice(0, 40) || 'tarjeta'
      a.download = `${safeName}.md`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      toast.success('Exportado como Markdown')
    } catch {
      toast.error('No se pudo exportar')
    }
  }

  async function handleShareWhatsApp() {
    const md = buildMarkdownExport()
    const text = md.slice(0, 1800) // WhatsApp URL limit ~2000 chars
    const url = `https://wa.me/?text=${encodeURIComponent(text)}`
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  async function handleShareEmail() {
    const subject = encodeURIComponent(card.title)
    const body = encodeURIComponent(buildMarkdownExport())
    const url = `mailto:?subject=${subject}&body=${body}`
    window.location.href = url
  }

  function handlePrint() {
    window.print()
  }

  const total = card.checklist.length
  const done = card.checklist.filter((i) => i.checked).length
  const ratio = total === 0 ? 0 : (done / total) * 100

  return (
    <div className="flex h-full flex-col">
      {/* Top toolbar — Notion-style */}
      <div className="sticky top-0 z-20 flex items-center justify-between gap-1 border-b border-border bg-background/95 px-2 py-1.5 backdrop-blur print:hidden">
        {/* Left: back arrow */}
        <div className="flex items-center gap-0.5">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0"
            onClick={closeCard}
            aria-label="Volver"
            title="Volver"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          {/* Breadcrumb: column hint */}
          <span className="ml-1 hidden truncate text-xs text-muted-foreground sm:inline">
            {card.title.slice(0, 30)}
            {card.title.length > 30 ? '…' : ''}
          </span>
        </div>

        {/* Right: actions (room on the right for the panel's own buttons) */}
        <div className="flex items-center gap-0.5 pr-16">
          {/* Compartir */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 gap-1.5 px-2 text-xs"
                title="Compartir"
              >
                <Share2 className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Compartir</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem
                onClick={handleCopyLink}
                className="cursor-pointer text-sm"
              >
                <Link2 className="mr-2 h-3.5 w-3.5" />
                Copiar enlace
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={handleExportMarkdown}
                className="cursor-pointer text-sm"
              >
                <FileDown className="mr-2 h-3.5 w-3.5" />
                Exportar como Markdown
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={handleShareWhatsApp}
                className="cursor-pointer text-sm"
              >
                <MessageCircle className="mr-2 h-3.5 w-3.5" />
                Enviar por WhatsApp
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={handleShareEmail}
                className="cursor-pointer text-sm"
              >
                <Send className="mr-2 h-3.5 w-3.5" />
                Enviar por email
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Duplicar */}
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0"
            onClick={handleDuplicate}
            aria-label="Duplicar"
            title="Duplicar tarjeta"
          >
            <Copy className="h-3.5 w-3.5" />
          </Button>

          {/* Más opciones */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0"
                aria-label="Más opciones"
                title="Más opciones"
              >
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem
                onClick={handlePrint}
                className="cursor-pointer text-sm"
              >
                <Printer className="mr-2 h-3.5 w-3.5" />
                Imprimir / PDF
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={handleExportMarkdown}
                className="cursor-pointer text-sm"
              >
                <FileDown className="mr-2 h-3.5 w-3.5" />
                Exportar Markdown
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => void importDocumentWithToast(editorRef.current, 'end')}
                className="cursor-pointer text-sm"
              >
                <FileUp className="mr-2 h-3.5 w-3.5" />
                Importar documento (.md, Word)
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={handleDeleteCard}
                className="cursor-pointer text-sm text-destructive focus:text-destructive"
              >
                <Trash2 className="mr-2 h-3.5 w-3.5" />
                Eliminar tarjeta
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Hidden file input — always rendered so the "Añadir portada"
          button works even when there's no cover yet. */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleCoverSelected}
        className="hidden"
      />

      {/* Cover image area — only shown when there's a cover */}
      {card.coverUrl && (
        <div className="relative h-32 w-full bg-muted/40 sm:h-44">
          <img
            src={card.coverUrl}
            alt=""
            className="h-full w-full object-cover"
          />
          <div className="absolute bottom-2 right-2 flex gap-1">
            <Button
              size="sm"
              variant="secondary"
              className="h-7 gap-1 bg-background/80 text-xs"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
            >
              {uploading ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <ImageIcon className="h-3 w-3" />
              )}
              Cambiar
            </Button>
            <Button
              size="sm"
              variant="secondary"
              className="h-7 gap-1 bg-background/80 text-xs"
              onClick={handleRemoveCover}
            >
              <X className="h-3 w-3" />
            </Button>
          </div>
        </div>
      )}

      <div
        className="peek-body flex flex-1 flex-col gap-4 overflow-y-auto p-5 notion-scroll"
        style={accentStyle}
      >
        {/* Title row: emoji icon + inline editable title */}
        <div className="flex items-start gap-2">
          {card.icon && (
            <button
              type="button"
              onClick={() => {
                // Click on the icon opens the icon picker
                const trigger = document.querySelector<HTMLButtonElement>(
                  'button[title="Editar icono"]'
                )
                trigger?.click()
              }}
              className="mt-0.5 shrink-0 text-3xl leading-none hover:opacity-80"
              title="Click para cambiar el icono"
              aria-label="Cambiar icono"
            >
              {card.icon}
            </button>
          )}
          <div className="min-w-0 flex-1">
            <InlineEdit
              value={card.title}
              onCommit={(next) => workspace.updateCard(card.id, { title: next })}
              className="block w-full rounded-md border border-transparent px-1 py-1 text-xl font-semibold leading-tight hover:border-border hover:bg-accent/40 focus:border-border focus:bg-accent/40 focus:outline-none"
              placeholder="Título de la tarjeta"
              ariaLabel="Título"
            />
          </div>
        </div>

        {/* Personalization bar — Notion-style (Añadir portada, Personalizar, etc.) */}
        <div className="flex flex-wrap items-center gap-1 -mt-2 px-1 text-xs text-muted-foreground">
          {!card.coverUrl && (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="flex items-center gap-1 rounded-sm px-1.5 py-1 hover:bg-accent hover:text-foreground"
              title="Añadir portada"
            >
              {uploading ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <ImagePlus className="h-3 w-3" />
              )}
              Añadir portada
            </button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="flex items-center gap-1 rounded-sm px-1.5 py-1 hover:bg-accent hover:text-foreground"
                title="Personalizar"
              >
                <Palette className="h-3 w-3" />
                Personalizar
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
              <DropdownMenuLabel className="text-xs uppercase tracking-wide text-muted-foreground">
                Color de acento
              </DropdownMenuLabel>
              {ACCENT_OPTIONS.map((opt) => (
                <DropdownMenuItem
                  key={opt.value || 'none'}
                  onClick={(e) => {
                    e.stopPropagation()
                    workspace.updateCard(card.id, { accentColor: opt.value || null })
                  }}
                  className="flex cursor-pointer items-center gap-2 text-sm"
                >
                  <span
                    className="inline-block h-3 w-3 rounded-full border border-border"
                    style={{ background: opt.value || 'transparent' }}
                  />
                  {opt.label}
                  {card.accentColor === opt.value && opt.value && (
                    <Check className="ml-auto h-3 w-3" />
                  )}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click() }}
                className="cursor-pointer text-sm"
              >
                <ImagePlus className="mr-2 h-3.5 w-3.5" />
                {card.coverUrl ? 'Cambiar portada' : 'Añadir portada'}
              </DropdownMenuItem>
              {card.coverUrl && (
                <DropdownMenuItem
                  onClick={(e) => { e.stopPropagation(); handleRemoveCover() }}
                  className="cursor-pointer text-sm text-destructive focus:text-destructive"
                >
                  <X className="mr-2 h-3.5 w-3.5" />
                  Quitar portada
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="flex items-center gap-1 rounded-sm px-1.5 py-1 hover:bg-accent hover:text-foreground"
                title="Editar icono"
              >
                <Smile className="h-3 w-3" />
                Icono
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-48">
              <div className="grid grid-cols-6 gap-1 p-2">
                {ICON_OPTIONS.map((icon, idx) => (
                  <button
                    key={idx}
                    onClick={(e) => {
                      e.stopPropagation()
                      workspace.updateCard(card.id, { icon: icon || null })
                      toast.success(icon ? `Icono cambiado a ${icon}` : 'Icono quitado')
                    }}
                    className={`flex h-7 w-7 items-center justify-center rounded-sm text-base hover:bg-accent ${
                      card.icon === icon ? 'bg-accent' : ''
                    }`}
                    title={icon || 'Sin icono'}
                  >
                    {icon || '·'}
                  </button>
                ))}
              </div>
              {card.icon && (
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation()
                    workspace.updateCard(card.id, { icon: null })
                    toast.success('Icono quitado')
                  }}
                  className="cursor-pointer text-sm text-destructive focus:text-destructive"
                >
                  <X className="mr-2 h-3.5 w-3.5" />
                  Quitar icono
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Comments (above the content, like Notion) */}
        <CommentsSection
          comments={card.comments ?? []}
          onAdd={(text) => workspace.addComment(card.id, text)}
          onDelete={(commentId) => workspace.deleteComment(card.id, commentId)}
        />

        {/* Rich block editor: "/" for blocks, select text to format */}
        <section className="-mx-5 border-t border-border pt-3">
          <RichEditor
            initialBlocks={initialBlocks}
            onChange={sync.onChange}
            pageId={workspace.page?.id}
            docRef={{ kind: 'card', id: card.id }}
            onReady={(editor) => {
              sync.onReady(editor)
            }}
          />
        </section>

        {/* Subtareas (formerly "Lista de tareas") */}
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Subtareas
            </h3>
            {total > 0 && (
              <span className="text-xs text-muted-foreground">
                {done}/{total} · {Math.round(ratio)}%
              </span>
            )}
          </div>

          {total > 0 && (
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full bg-primary transition-all"
                style={{ width: `${ratio}%` }}
              />
            </div>
          )}

          <ul className="space-y-1">
            {card.checklist.map((item) => (
              <li
                key={item.id}
                className="group flex items-center gap-2 rounded-md px-1 py-1 hover:bg-accent/40"
              >
                <Checkbox
                  checked={item.checked}
                  onCheckedChange={() => handleToggleChecklist(item.id, item.checked)}
                  className="data-[state=checked]:bg-foreground data-[state=checked]:text-background"
                />
                <span
                  className={`flex-1 text-sm ${
                    item.checked
                      ? 'text-muted-foreground line-through'
                      : 'text-foreground'
                  }`}
                >
                  {item.text}
                </span>
                <button
                  onClick={() => handleDeleteChecklist(item.id)}
                  className="opacity-0 transition group-hover:opacity-100"
                  aria-label="Eliminar tarea"
                >
                  <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
                </button>
              </li>
            ))}
          </ul>

          <div className="flex items-center gap-2">
            <Input
              value={newItemText}
              onChange={(e) => setNewItemText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  handleAddChecklistItem()
                }
              }}
              placeholder="Añadir subtarea…"
              className="h-8 text-sm"
            />
            <Button
              size="sm"
              variant="secondary"
              onClick={handleAddChecklistItem}
              disabled={!newItemText.trim()}
              className="h-8 gap-1"
            >
              <Plus className="h-3 w-3" />
              Añadir
            </Button>
          </div>
        </section>

        {/* Auxiliary files (PDF, Drive, Figma, links) */}
        <AttachmentsSection
          card={card}
          onAdd={(payload) =>
            workspace.addAttachment(card.id, payload)
          }
          onDelete={(attachmentId) =>
            workspace.deleteAttachment(card.id, attachmentId)
          }
          onUpdate={(attachmentId, payload) =>
            workspace.updateAttachment(card.id, attachmentId, payload)
          }
        />

        {/* Metadata */}
        <section className="mt-2 space-y-1 border-t border-border pt-3 text-xs text-muted-foreground">
          <p>Creada: {formatDateAR(card.createdAt)}</p>
          <p>Actualizada: {formatDateAR(card.updatedAt)}</p>
        </section>
      </div>

      {/* Footer actions */}
      <div className="flex items-center justify-between border-t border-border bg-card/60 p-3 print:hidden">
        <span className="text-xs text-muted-foreground">
          Actualizada {formatDateAR(card.updatedAt)}
        </span>
        <Button variant="ghost" size="sm" onClick={closeCard}>
          <Check className="mr-2 h-4 w-4" />
          Hecho
        </Button>
      </div>
    </div>
  )
}
