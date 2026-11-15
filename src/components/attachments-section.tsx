'use client'

import { useRef, useState } from 'react'
import { toast } from 'sonner'
import {
  FileText,
  FolderOpen,
  Figma,
  Link2,
  Loader2,
  Trash2,
  Plus,
  ExternalLink,
  X,
  Pencil,
} from 'lucide-react'
import type { Attachment, Card } from '@/lib/types'
import { uploadFile } from '@/lib/api'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { formatDateAR } from '@/lib/utils'

type Props = {
  card: Card
  onAdd: (payload: {
    type: Attachment['type']
    title: string
    url: string
    previewUrl?: string | null
  }) => Promise<void>
  onDelete: (attachmentId: string) => Promise<void>
  onUpdate: (
    attachmentId: string,
    payload: Partial<Pick<Attachment, 'title' | 'url'>>
  ) => Promise<void>
}

export function AttachmentsSection({ card, onAdd, onDelete, onUpdate }: Props) {
  const [uploading, setUploading] = useState(false)
  const [showLinkForm, setShowLinkForm] = useState<Attachment['type'] | null>(null)
  const [linkDraft, setLinkDraft] = useState({ title: '', url: '' })
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState({ title: '', url: '' })
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  async function handlePdfSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.type !== 'application/pdf') {
      toast.error('Solo se permiten archivos PDF')
      if (fileInputRef.current) fileInputRef.current.value = ''
      return
    }
    setUploading(true)
    try {
      const result = await uploadFile(file)
      await onAdd({
        type: 'pdf',
        title: result.originalName,
        url: result.url,
      })
      toast.success('PDF adjuntado')
    } catch (err) {
      toast.error('No se pudo subir el PDF')
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  async function handleConfirmLink() {
    if (!showLinkForm) return
    const url = linkDraft.url.trim()
    const title = linkDraft.title.trim() || url
    if (!url) return

    let type: Attachment['type'] = showLinkForm
    let previewUrl: string | null = null

    // Auto-detect Drive / Figma based on URL
    if (type === 'drive') {
      // For Drive files we can build a preview embed URL
      const fileId = extractDriveFileId(url)
      if (fileId) {
        previewUrl = `https://drive.google.com/file/d/${fileId}/preview`
      }
    } else if (type === 'figma') {
      // For Figma, build the embed URL
      const embed = figmaEmbedUrl(url)
      if (embed) previewUrl = embed
    }

    try {
      await onAdd({ type, title, url, previewUrl })
      toast.success('Enlace agregado')
      setShowLinkForm(null)
      setLinkDraft({ title: '', url: '' })
    } catch (err) {
      toast.error('No se pudo agregar el enlace')
    }
  }

  function startEdit(att: Attachment) {
    setEditingId(att.id)
    setEditDraft({ title: att.title, url: att.url })
  }

  async function confirmEdit() {
    if (!editingId) return
    const title = editDraft.title.trim()
    const url = editDraft.url.trim()
    if (!title || !url) return
    await onUpdate(editingId, { title, url })
    setEditingId(null)
  }

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Archivos auxiliares
        </h3>
        {card.attachments.length > 0 && (
          <span className="text-xs text-muted-foreground">
            {card.attachments.length} archivo{card.attachments.length === 1 ? '' : 's'}
          </span>
        )}
      </div>

      {/* Existing attachments */}
      {card.attachments.length > 0 && (
        <ul className="space-y-1.5">
          {card.attachments.map((att) => (
            <li
              key={att.id}
              className="group rounded-md border border-border bg-card/60 p-2"
            >
              {editingId === att.id ? (
                <div className="space-y-2">
                  <input
                    type="text"
                    value={editDraft.title}
                    onChange={(e) =>
                      setEditDraft((d) => ({ ...d, title: e.target.value }))
                    }
                    placeholder="Título"
                    className="w-full bg-transparent text-sm font-medium outline-none"
                    autoFocus
                  />
                  <input
                    type="url"
                    value={editDraft.url}
                    onChange={(e) =>
                      setEditDraft((d) => ({ ...d, url: e.target.value }))
                    }
                    placeholder="https://…"
                    className="w-full bg-transparent text-xs text-muted-foreground outline-none"
                  />
                  <div className="flex justify-end gap-1">
                    <button
                      type="button"
                      onClick={() => setEditingId(null)}
                      className="rounded-sm px-2 py-0.5 text-[11px] text-muted-foreground hover:text-foreground"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      onClick={confirmEdit}
                      disabled={!editDraft.title.trim() || !editDraft.url.trim()}
                      className="rounded-sm bg-foreground px-2 py-0.5 text-[11px] text-background disabled:opacity-40"
                    >
                      Guardar
                    </button>
                  </div>
                </div>
              ) : (
                <AttachmentRow
                  att={att}
                  onEdit={() => startEdit(att)}
                  onDelete={() => onDelete(att.id)}
                />
              )}
            </li>
          ))}
        </ul>
      )}

      {/* Inline link form */}
      {showLinkForm && (
        <div className="space-y-2 rounded-md border border-border bg-card/60 p-2">
          <div className="flex items-center gap-2 text-xs font-medium text-foreground">
            {showLinkForm === 'drive' && <FolderOpen className="h-3.5 w-3.5" />}
            {showLinkForm === 'figma' && <Figma className="h-3.5 w-3.5" />}
            {showLinkForm === 'link' && <Link2 className="h-3.5 w-3.5" />}
            {showLinkForm === 'drive' && 'Google Drive'}
            {showLinkForm === 'figma' && 'Figma'}
            {showLinkForm === 'link' && 'Enlace externo'}
          </div>
          <input
            type="text"
            value={linkDraft.title}
            onChange={(e) =>
              setLinkDraft((d) => ({ ...d, title: e.target.value }))
            }
            placeholder="Título (opcional)"
            className="w-full bg-transparent text-sm outline-none"
            autoFocus
          />
          <input
            type="url"
            value={linkDraft.url}
            onChange={(e) =>
              setLinkDraft((d) => ({ ...d, url: e.target.value }))
            }
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                handleConfirmLink()
              } else if (e.key === 'Escape') {
                setShowLinkForm(null)
                setLinkDraft({ title: '', url: '' })
              }
            }}
            placeholder={
              showLinkForm === 'drive'
                ? 'https://drive.google.com/file/d/…'
                : showLinkForm === 'figma'
                ? 'https://www.figma.com/file/…'
                : 'https://…'
            }
            className="w-full bg-transparent text-xs text-muted-foreground outline-none"
          />
          <div className="flex justify-end gap-1">
            <button
              type="button"
              onClick={() => {
                setShowLinkForm(null)
                setLinkDraft({ title: '', url: '' })
              }}
              className="rounded-sm px-2 py-0.5 text-[11px] text-muted-foreground hover:text-foreground"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleConfirmLink}
              disabled={!linkDraft.url.trim()}
              className="rounded-sm bg-foreground px-2 py-0.5 text-[11px] text-background disabled:opacity-40"
            >
              Insertar
            </button>
          </div>
        </div>
      )}

      {/* Add buttons */}
      {!showLinkForm && (
        <div className="flex flex-wrap gap-1">
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf,.pdf"
            onChange={handlePdfSelected}
            className="hidden"
          />
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 gap-1 px-2 text-xs"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <FileText className="h-3 w-3" />
            )}
            PDF
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 gap-1 px-2 text-xs"
            onClick={() => {
              setShowLinkForm('drive')
              setLinkDraft({ title: '', url: '' })
            }}
          >
            <FolderOpen className="h-3 w-3" />
            Google Drive
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 gap-1 px-2 text-xs"
            onClick={() => {
              setShowLinkForm('figma')
              setLinkDraft({ title: '', url: '' })
            }}
          >
            <Figma className="h-3 w-3" />
            Figma
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 gap-1 px-2 text-xs"
            onClick={() => {
              setShowLinkForm('link')
              setLinkDraft({ title: '', url: '' })
            }}
          >
            <Link2 className="h-3 w-3" />
            Enlace
          </Button>
        </div>
      )}
    </section>
  )
}

/* ------------------------------------------------------------------ */
/* Single attachment row                                               */
/* ------------------------------------------------------------------ */

function AttachmentRow({
  att,
  onEdit,
  onDelete,
}: {
  att: Attachment
  onEdit: () => void
  onDelete: () => Promise<void>
}) {
  const [previewOpen, setPreviewOpen] = useState(false)

  const Icon =
    att.type === 'pdf'
      ? FileText
      : att.type === 'drive'
      ? FolderOpen
      : att.type === 'figma'
      ? Figma
      : Link2

  const externalUrl = att.url.startsWith('http')
    ? att.url
    : `${window.location.origin}${att.url}`

  return (
    <div>
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{att.title}</p>
          <p className="truncate text-[11px] text-muted-foreground">
            {att.type === 'pdf' && 'PDF · '}
            {att.type === 'drive' && 'Google Drive · '}
            {att.type === 'figma' && 'Figma · '}
            {att.type === 'link' && 'Enlace · '}
            {formatDateAR(att.createdAt)}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition group-hover:opacity-100">
          {att.previewUrl && (
            <button
              type="button"
              onClick={() => setPreviewOpen((o) => !o)}
              className="rounded-sm p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
              aria-label={previewOpen ? 'Cerrar vista previa' : 'Ver vista previa'}
              title={previewOpen ? 'Cerrar vista previa' : 'Ver vista previa'}
            >
              {previewOpen ? <X className="h-3.5 w-3.5" /> : <ExternalLink className="h-3.5 w-3.5" />}
            </button>
          )}
          <a
            href={externalUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-sm p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
            aria-label="Abrir en pestaña nueva"
            title="Abrir en pestaña nueva"
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
          <button
            type="button"
            onClick={onEdit}
            className="rounded-sm p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
            aria-label="Editar"
            title="Editar"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="rounded-sm p-1 text-muted-foreground hover:bg-accent hover:text-destructive"
            aria-label="Eliminar"
            title="Eliminar"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Preview embed */}
      {previewOpen && att.previewUrl && (
        <div className="mt-2 overflow-hidden rounded-md border border-border bg-background">
          {att.type === 'pdf' || att.type === 'file' ? (
            <iframe
              src={att.url}
              className="h-72 w-full"
              title={att.title}
            />
          ) : att.type === 'drive' ? (
            <iframe
              src={att.previewUrl}
              className="h-72 w-full"
              title={att.title}
              allow="autoplay"
            />
          ) : att.type === 'figma' ? (
            <iframe
              src={att.previewUrl}
              className="h-96 w-full"
              title={att.title}
              allowFullScreen
            />
          ) : (
            <iframe
              src={att.previewUrl || att.url}
              className="h-72 w-full"
              title={att.title}
              sandbox="allow-scripts allow-same-origin"
            />
          )}
        </div>
      )}

      {/* PDFs always show a quick preview button even without previewUrl */}
      {att.type === 'pdf' && !att.previewUrl && !previewOpen && (
        <button
          type="button"
          onClick={() => setPreviewOpen(true)}
          className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
        >
          <Plus className="h-3 w-3" />
          Ver PDF
        </button>
      )}
      {att.type === 'pdf' && previewOpen && !att.previewUrl && (
        <div className="mt-2 overflow-hidden rounded-md border border-border bg-background">
          <iframe
            src={att.url}
            className="h-72 w-full"
            title={att.title}
          />
        </div>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Helpers — extract Drive file id / build Figma embed URL            */
/* ------------------------------------------------------------------ */

function extractDriveFileId(url: string): string | null {
  // Match /file/d/<id>/ or /d/<id>/ or id=<id>
  const m1 = url.match(/\/file\/d\/([^/?#]+)/)
  if (m1) return m1[1]
  const m2 = url.match(/\/d\/([^/?#]+)/)
  if (m2) return m2[1]
  const m3 = url.match(/[?&]id=([^&]+)/)
  if (m3) return m3[1]
  return null
}

function figmaEmbedUrl(url: string): string | null {
  // Figma embed URL format: https://www.figma.com/embed?embed_host=share&url=<original>
  if (!url.includes('figma.com')) return null
  return `https://www.figma.com/embed?embed_host=notas&url=${encodeURIComponent(url)}`
}
