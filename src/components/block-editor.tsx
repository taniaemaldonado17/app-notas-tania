'use client'

import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { toast } from 'sonner'
import {
  Code,
  FileText,
  Heading1,
  Heading2,
  Heading3,
  Heading4,
  Image as ImageIcon,
  List,
  Pilcrow,
  Plus,
  Quote,
  Search,
  Trash2,
  GripVertical,
  CheckSquare,
  Square,
  Check,
  Loader2,
  X,
} from 'lucide-react'
import type { Block, BlockType } from '@/lib/blocks'
import { BLOCK_MENU_ITEMS, makeBlock } from '@/lib/blocks'
import { uploadImage } from '@/lib/api'
import { TextSelectionMenu } from '@/components/text-selection-menu'

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  Heading1,
  Heading2,
  Heading3,
  Heading4,
  FileText,
  List,
  Code,
  Quote,
  Pilcrow,
  CheckSquare,
  Image: ImageIcon,
}

type Props = {
  blocks: Block[]
  onChange: (next: Block[]) => void
  placeholder?: string
}

/**
 * Notion-style block editor.
 *
 * - Each block renders as a contentEditable-ish input based on its type.
 * - Hover a block to reveal a "+" button (insert block above) and a drag handle.
 * - Typing "/" at the very start of an empty block opens the slash command menu.
 * - The menu offers: H1, H2, H3, H4, Page, List, Code, Quote, Text.
 * - Enter creates a new paragraph block; Backspace at start of empty block deletes it.
 */
export function BlockEditor({ blocks, onChange, placeholder }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null)

  // Ensure there is always at least one block to type into.
  const safeBlocks = useMemo(() => {
    if (blocks.length === 0) return [makeBlock('paragraph', '')]
    return blocks
  }, [blocks])

  // Text-selection state for the AI floating menu
  const [selection, setSelection] = useState<{
    text: string
    rect: DOMRect | null
    blockId: string | null
    // Track which textarea the selection came from so we can replace its text
    textarea: HTMLTextAreaElement | null
    // Track selection start/end so we can replace just that range
    selStart: number
    selEnd: number
  } | null>(null)

  // Detect text selection inside the editor's textareas.
  // For <textarea> the browser emits a `select` event (not `selectionchange`).
  // We listen to both: `select` on each textarea, and `selectionchange`/mouseup
  // on the document (for the rare case where the textarea's selection changes
  // via keyboard or other means).
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    function readSelectionFromTextarea(ta: HTMLTextAreaElement) {
      // For textareas, the actual selection lives in selectionStart/End,
      // NOT in window.getSelection() (which is for DOM ranges).
      const start = ta.selectionStart ?? 0
      const end = ta.selectionEnd ?? 0
      if (start === end) {
        setSelection(null)
        return
      }
      const text = ta.value.slice(start, end)
      if (!text) {
        setSelection(null)
        return
      }
      // Build a rect from the textarea's bounding rect (approximate —
      // the actual selection rect is hard to get for textareas)
      const rect = ta.getBoundingClientRect()
      setSelection({
        text,
        rect,
        blockId: ta.getAttribute('data-block-id'),
        textarea: ta,
        selStart: start,
        selEnd: end,
      })
    }

    function checkSelection() {
      const sel = window.getSelection()
      if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
        return // don't clear — textareas don't fire selectionchange
      }
      const text = sel.toString()
      if (!text || text.length < 1) return
      const anchorNode = sel.anchorNode
      if (!anchorNode) return
      const ta = anchorNode.nodeType === Node.TEXT_NODE
        ? (anchorNode.parentElement?.closest('textarea') as HTMLTextAreaElement | null)
        : (anchorNode as HTMLElement)?.closest?.('textarea') as HTMLTextAreaElement | null
      if (!ta || !container.contains(ta)) return
      if (!ta.hasAttribute('data-block-id')) return

      const rect = sel.getRangeAt(0).getBoundingClientRect()
      setSelection({
        text,
        rect,
        blockId: ta.getAttribute('data-block-id'),
        textarea: ta,
        selStart: ta.selectionStart ?? 0,
        selEnd: ta.selectionEnd ?? text.length,
      })
    }

    function onSelect(e: Event) {
      const ta = e.target as HTMLTextAreaElement
      if (!(ta instanceof HTMLTextAreaElement)) return
      if (!ta.hasAttribute('data-block-id')) return
      if (!container.contains(ta)) return
      readSelectionFromTextarea(ta)
    }

    function onMouseUp(e: MouseEvent) {
      const ta = e.target as HTMLTextAreaElement
      if (!(ta instanceof HTMLTextAreaElement)) return
      if (!ta.hasAttribute('data-block-id')) return
      // Defer so the selection has updated
      requestAnimationFrame(() => readSelectionFromTextarea(ta))
    }

    function onKeyUp(e: KeyboardEvent) {
      const ta = e.target as HTMLTextAreaElement
      if (!(ta instanceof HTMLTextAreaElement)) return
      if (!ta.hasAttribute('data-block-id')) return
      if (e.shiftKey || e.key === 'Shift' || e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'Home' || e.key === 'End') {
        requestAnimationFrame(() => readSelectionFromTextarea(ta))
      }
    }

    // Use capture so we get the event before any other handler stops propagation
    container.addEventListener('select', onSelect, true)
    container.addEventListener('mouseup', onMouseUp, true)
    container.addEventListener('keyup', onKeyUp, true)
    document.addEventListener('selectionchange', checkSelection)

    return () => {
      container.removeEventListener('select', onSelect, true)
      container.removeEventListener('mouseup', onMouseUp, true)
      container.removeEventListener('keyup', onKeyUp, true)
      document.removeEventListener('selectionchange', checkSelection)
    }
  }, [])

  // Close the menu when clicking outside it (but inside the editor keeps it open)
  useEffect(() => {
    if (!selection) return
    function onDown(e: MouseEvent) {
      const target = e.target as HTMLElement
      // Click inside the menu itself — ignore
      if (target.closest('[data-text-selection-menu]')) return
      // Click inside a textarea in the editor — re-evaluate selection via selectionchange
      if (target.tagName === 'TEXTAREA' && target.hasAttribute('data-block-id')) return
      // Otherwise close
      setSelection(null)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [selection])

  const update = useCallback(
    (next: Block[]) => {
      onChange(next)
    },
    [onChange]
  )

  function patchBlock(id: string, patch: Partial<Block>) {
    update(safeBlocks.map((b) => (b.id === id ? { ...b, ...patch } : b)))
  }

  // Replace the selected range in a block with the AI result
  const handleReplace = useCallback(
    (original: string, next: string) => {
      if (!selection || !selection.blockId) return
      const block = safeBlocks.find((b) => b.id === selection.blockId)
      if (!block) return
      const before = block.text.slice(0, selection.selStart)
      const after = block.text.slice(selection.selEnd)
      const newText = before + next + after
      update(safeBlocks.map((b) => (b.id === selection.blockId ? { ...b, text: newText } : b)))
      toast.success('Texto reemplazado por IA')
    },
    [selection, safeBlocks, update]
  )

  function insertBlockAfter(id: string, newBlock: Block) {
    const idx = safeBlocks.findIndex((b) => b.id === id)
    const next = [...safeBlocks]
    next.splice(idx + 1, 0, newBlock)
    update(next)
    // Focus the new block on next tick
    requestAnimationFrame(() => {
      const el = containerRef.current?.querySelector<HTMLTextAreaElement>(
        `[data-block-id="${newBlock.id}"]`
      )
      el?.focus()
    })
  }

  function insertBlockAt(index: number, newBlock: Block) {
    const next = [...safeBlocks]
    next.splice(index, 0, newBlock)
    update(next)
    requestAnimationFrame(() => {
      const el = containerRef.current?.querySelector<HTMLTextAreaElement>(
        `[data-block-id="${newBlock.id}"]`
      )
      el?.focus()
    })
  }

  function deleteBlock(id: string) {
    if (safeBlocks.length <= 1) {
      // Replace with empty paragraph instead of removing entirely
      update([makeBlock('paragraph', '')])
      return
    }
    update(safeBlocks.filter((b) => b.id !== id))
  }

  function changeBlockType(id: string, type: BlockType) {
    const patch: Partial<Block> = { type }
    if (type === 'code') patch.lang = 'plain'
    if (type === 'page') patch.url = patch.url ?? ''
    if (type === 'image') patch.url = patch.url ?? ''
    if (type === 'todo') patch.checked = false
    patchBlock(id, patch)
  }

  function handleEnter(id: string, atEnd: boolean) {
    // Enter at end of a heading/list/quote/page → new paragraph
    // Enter at end of code block → newline (handled by the textarea itself)
    const current = safeBlocks.find((b) => b.id === id)
    if (!current) return
    if (current.type === 'code') return // let the textarea insert a newline

    // Notion behaviour: if the current block is already empty (no text),
    // don't create another empty block — that would just leave a trail
    // of empty placeholders. Instead, do nothing.
    if (!current.text.trim()) return

    const nb = makeBlock('paragraph', '')
    if (atEnd) insertBlockAfter(id, nb)
    // focus handled by insertBlockAfter
  }

  return (
    <div ref={containerRef} className="block-editor relative space-y-1">
      {safeBlocks.map((block, idx) => (
        <BlockRow
          key={block.id}
          block={block}
          isFirst={idx === 0}
          onChangeType={(t) => changeBlockType(block.id, t)}
          onTextChange={(text) => patchBlock(block.id, { text })}
          onCheckedChange={(checked) => patchBlock(block.id, { checked })}
          onImageUrlChange={(url) => patchBlock(block.id, { url })}
          onEnter={() => handleEnter(block.id, true)}
          onDelete={() => deleteBlock(block.id)}
          onInsertAbove={() => insertBlockAt(idx, makeBlock('paragraph', ''))}
          onLangChange={(lang) => patchBlock(block.id, { lang })}
          onUrlChange={(url) => patchBlock(block.id, { url })}
        />
      ))}

      {/* Always-available "add block" button at the end */}
      <AddBlockButton
        onPick={(type) => {
          const nb = makeBlock(type, '')
          update([...safeBlocks, nb])
          requestAnimationFrame(() => {
            const el = containerRef.current?.querySelector<HTMLTextAreaElement>(
              `[data-block-id="${nb.id}"]`
            )
            el?.focus()
          })
        }}
      />

      {/* Floating AI text-selection menu (Notion-style) */}
      {selection && selection.text.trim().length > 0 && (
        <div data-text-selection-menu>
          <TextSelectionMenu
            selectedText={selection.text}
            rect={selection.rect}
            containerRef={containerRef}
            onReplace={handleReplace}
            onConvertBlockType={(type) => {
              if (!selection.blockId) return
              changeBlockType(selection.blockId, type)
              toast.success(`Bloque convertido a ${type}`)
            }}
            onClose={() => setSelection(null)}
          />
        </div>
      )}

      <style jsx global>{`
        .block-editor textarea {
          background: transparent;
          border: 0;
          outline: 0;
          resize: none;
          width: 100%;
          color: inherit;
          font: inherit;
          padding: 0;
        }
        .block-editor textarea::placeholder {
          color: hsl(var(--muted-foreground));
          opacity: 0.6;
        }
      `}</style>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Block row — handles a single block + its hover controls             */
/* ------------------------------------------------------------------ */

function BlockRow({
  block,
  isFirst,
  onChangeType,
  onTextChange,
  onCheckedChange,
  onImageUrlChange,
  onEnter,
  onDelete,
  onInsertAbove,
  onLangChange,
  onUrlChange,
}: {
  block: Block
  isFirst: boolean
  onChangeType: (t: BlockType) => void
  onTextChange: (text: string) => void
  onCheckedChange: (checked: boolean) => void
  onImageUrlChange: (url: string) => void
  onEnter: () => void
  onDelete: () => void
  onInsertAbove: () => void
  onLangChange: (lang: string) => void
  onUrlChange: (url: string) => void
}) {
  const [slashOpen, setSlashOpen] = useState(false)
  const slashQueryRef = useRef('')

  // Detect "/" typed at the very start of an empty block
  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    const ta = e.currentTarget
    if (slashOpen) {
      if (e.key === 'Escape') {
        setSlashOpen(false)
        slashQueryRef.current = ''
        return
      }
      if (e.key === 'Enter') {
        // Let the SlashMenu handle its own Enter
        return
      }
      if (['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        // Allow navigation but let menu capture arrows
        return
      }
      return
    }

    if (e.key === '/' && ta.value === '') {
      setSlashOpen(true)
      slashQueryRef.current = ''
      // prevent the slash char from being typed
      e.preventDefault()
      return
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      onEnter()
      return
    }

    if (e.key === 'Backspace' && ta.value === '' && !isFirst) {
      e.preventDefault()
      onDelete()
    }
  }

  function handleInput(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const val = e.target.value
    // Slash command at the start of an empty block.
    // The keydown handler catches this in real keyboards, but
    // input-method edits (paste, IME, virtual keyboards, etc.) bypass
    // preventDefault. Detect the lone "/" here as a fallback.
    if (val === '/' && !slashOpen) {
      setSlashOpen(true)
      slashQueryRef.current = ''
      // Clean the textarea
      const ta = e.target
      ta.value = ''
      onTextChange('')
      // (don't call the height-grow code below — we already cleared)
      return
    }
    onTextChange(val)
    // Grow the textarea to fit content
    const ta = e.target
    ta.style.height = 'auto'
    ta.style.height = `${ta.scrollHeight}px`
  }

  // Auto-grow on mount and when block.text changes externally
  const taRef = useRef<HTMLTextAreaElement | null>(null)
  useEffect(() => {
    const ta = taRef.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = `${ta.scrollHeight}px`
  }, [block.text, block.type])

  return (
    <div className="group relative -mx-6 flex items-start px-6">
      {/* Hover controls (left gutter) */}
      <div className="absolute left-0 top-0 flex h-full items-start pt-0.5 opacity-0 transition group-hover:opacity-100">
        <button
          type="button"
          onClick={onInsertAbove}
          className="flex h-5 w-4 items-center justify-center text-muted-foreground/60 hover:text-foreground"
          aria-label="Añadir bloque"
          tabIndex={-1}
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          className="flex h-5 w-4 cursor-grab items-center justify-center text-muted-foreground/40 hover:text-foreground active:cursor-grabbing"
          aria-label="Mover bloque"
          tabIndex={-1}
        >
          <GripVertical className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Block body — depends on type */}
      <div className="min-w-0 flex-1">
        <BlockBody
          block={block}
          taRef={taRef}
          onInput={handleInput}
          onKeyDown={handleKeyDown}
          onLangChange={onLangChange}
          onUrlChange={onUrlChange}
          onCheckedChange={onCheckedChange}
          onImageUrlChange={onImageUrlChange}
        />

        {/* Slash command menu */}
        {slashOpen && (
          <SlashMenu
            query={slashQueryRef.current}
            onQueryChange={(q) => (slashQueryRef.current = q)}
            onPick={(t) => {
              onChangeType(t)
              setSlashOpen(false)
              slashQueryRef.current = ''
            }}
            onClose={() => {
              setSlashOpen(false)
              slashQueryRef.current = ''
              // Refocus the textarea
              requestAnimationFrame(() => taRef.current?.focus())
            }}
          />
        )}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Block body — renders the editable surface for each block type      */
/* ------------------------------------------------------------------ */

function BlockBody({
  block,
  taRef,
  onInput,
  onKeyDown,
  onLangChange,
  onUrlChange,
  onCheckedChange,
  onImageUrlChange,
}: {
  block: Block
  taRef: React.MutableRefObject<HTMLTextAreaElement | null>
  onInput: (e: React.ChangeEvent<HTMLTextAreaElement>) => void
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void
  onLangChange: (lang: string) => void
  onUrlChange: (url: string) => void
  onCheckedChange: (checked: boolean) => void
  onImageUrlChange: (url: string) => void
}) {
  const commonProps = {
    'data-block-id': block.id,
    ref: taRef as React.RefObject<HTMLTextAreaElement>,
    value: block.text,
    onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      // handleInput takes care of calling onTextChange + auto-grow
      onInput(e)
    },
    onKeyDown,
    spellCheck: false,
  }

  switch (block.type) {
    case 'h1':
      return (
        <textarea
          {...commonProps}
          rows={1}
          placeholder="Encabezado 1"
          className="text-2xl font-bold leading-tight"
        />
      )
    case 'h2':
      return (
        <textarea
          {...commonProps}
          rows={1}
          placeholder="Encabezado 2"
          className="text-xl font-bold leading-tight"
        />
      )
    case 'h3':
      return (
        <textarea
          {...commonProps}
          rows={1}
          placeholder="Encabezado 3"
          className="text-lg font-semibold leading-snug"
        />
      )
    case 'h4':
      return (
        <textarea
          {...commonProps}
          rows={1}
          placeholder="Encabezado 4"
          className="text-base font-semibold leading-snug"
        />
      )
    case 'list':
      return (
        <div className="flex items-start gap-2">
          <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground" />
          <textarea
            {...commonProps}
            rows={1}
            placeholder="Elemento de lista"
            className="text-sm leading-relaxed"
          />
        </div>
      )
    case 'code':
      return (
        <div className="rounded-md border border-border bg-muted/60 p-2">
          <div className="mb-1 flex items-center justify-between">
            <input
              type="text"
              value={block.lang ?? 'plain'}
              onChange={(e) => onLangChange(e.target.value)}
              placeholder="lenguaje"
              className="bg-transparent text-[10px] uppercase tracking-wide text-muted-foreground outline-none"
            />
          </div>
          <textarea
            {...commonProps}
            rows={2}
            placeholder="// código aquí"
            className="min-h-8 resize-y rounded-sm bg-transparent font-mono text-xs leading-relaxed"
            style={{ whiteSpace: 'pre-wrap' }}
          />
        </div>
      )
    case 'quote':
      return (
        <div className="border-l-2 border-border pl-3 italic text-foreground/80">
          <textarea
            {...commonProps}
            rows={1}
            placeholder="Cita"
            className="text-sm leading-relaxed"
          />
        </div>
      )
    case 'page':
      return (
        <div className="flex items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-2">
          <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
          <textarea
            {...commonProps}
            rows={1}
            placeholder="Título de la página"
            className="flex-1 text-sm font-medium"
          />
          <input
            type="url"
            value={block.url ?? ''}
            onChange={(e) => onUrlChange(e.target.value)}
            placeholder="https://…"
            className="w-32 shrink-0 bg-transparent text-[11px] text-muted-foreground outline-none focus:text-foreground"
          />
        </div>
      )
    case 'todo':
      return (
        <div className="flex items-start gap-2">
          <button
            type="button"
            onClick={() => onCheckedChange(!block.checked)}
            className="mt-0.5 shrink-0 rounded-sm text-muted-foreground hover:text-foreground"
            aria-label={block.checked ? 'Marcar como pendiente' : 'Marcar como hecho'}
            aria-pressed={block.checked}
            tabIndex={-1}
          >
            {block.checked ? (
              <CheckSquare className="h-4 w-4 text-foreground" />
            ) : (
              <Square className="h-4 w-4" />
            )}
          </button>
          <textarea
            {...commonProps}
            rows={1}
            placeholder="Tarea pendiente"
            className={`text-sm leading-relaxed ${
              block.checked ? 'text-muted-foreground line-through' : ''
            }`}
          />
        </div>
      )
    case 'image':
      return (
        <ImageBlockBody
          block={block}
          onImageUrlChange={onImageUrlChange}
        />
      )
    case 'paragraph':
    default:
      return (
        <textarea
          {...commonProps}
          rows={1}
          placeholder="Escribí algo…"
          className="text-sm leading-relaxed"
        />
      )
  }
}

/* ------------------------------------------------------------------ */
/* Image block — upload or paste an image, render it inline           */
/* ------------------------------------------------------------------ */

function ImageBlockBody({
  block,
  onImageUrlChange,
}: {
  block: Block
  onImageUrlChange: (url: string) => void
}) {
  const [uploading, setUploading] = useState(false)
  const [showUrlInput, setShowUrlInput] = useState(false)
  const [urlDraft, setUrlDraft] = useState('')
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  async function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const url = await uploadImage(file)
      onImageUrlChange(url)
      toast.success('Imagen adjuntada')
    } catch (err) {
      toast.error('No se pudo subir la imagen')
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  async function handlePaste(e: React.ClipboardEvent) {
    const items = Array.from(e.clipboardData?.items ?? [])
    const imageItem = items.find((it) => it.type.startsWith('image/'))
    if (!imageItem) return
    e.preventDefault()
    const file = imageItem.getAsFile()
    if (!file) return
    setUploading(true)
    try {
      const url = await uploadImage(file)
      onImageUrlChange(url)
      toast.success('Imagen pegada')
    } catch {
      toast.error('No se pudo subir la imagen pegada')
    } finally {
      setUploading(false)
    }
  }

  function handleDrop(e: React.DragEvent) {
    const file = e.dataTransfer?.files?.[0]
    if (!file || !file.type.startsWith('image/')) return
    e.preventDefault()
    setUploading(true)
    uploadImage(file)
      .then((url) => {
        onImageUrlChange(url)
        toast.success('Imagen soltada')
      })
      .catch(() => toast.error('No se pudo subir la imagen'))
      .finally(() => setUploading(false))
  }

  function confirmUrl() {
    const u = urlDraft.trim()
    if (!u) return
    onImageUrlChange(u)
    setShowUrlInput(false)
    setUrlDraft('')
  }

  if (block.url) {
    return (
      <div className="group/img relative overflow-hidden rounded-md border border-border bg-muted/40">
        <img
          src={block.url}
          alt={block.text || 'Imagen'}
          className="block max-h-80 w-full object-cover"
          draggable={false}
        />
        <div className="absolute right-1.5 top-1.5 flex gap-1 opacity-0 transition group-hover/img:opacity-100">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex h-6 items-center gap-1 rounded-sm bg-background/80 px-2 text-[11px] hover:bg-background"
            tabIndex={-1}
          >
            <ImageIcon className="h-3 w-3" />
            Cambiar
          </button>
          <button
            type="button"
            onClick={() => onImageUrlChange('')}
            className="flex h-6 w-6 items-center justify-center rounded-sm bg-background/80 hover:bg-background hover:text-destructive"
            aria-label="Quitar imagen"
            tabIndex={-1}
          >
            <X className="h-3 w-3" />
          </button>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleFileSelected}
          className="hidden"
        />
      </div>
    )
  }

  return (
    <div
      onPaste={handlePaste}
      onDrop={handleDrop}
      onDragOver={(e) => e.preventDefault()}
      className="rounded-md border border-dashed border-border bg-muted/30 p-3"
    >
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileSelected}
        className="hidden"
      />
      {uploading ? (
        <div className="flex items-center justify-center gap-2 py-3 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Subiendo imagen…
        </div>
      ) : showUrlInput ? (
        <div className="flex flex-col gap-2">
          <input
            type="url"
            value={urlDraft}
            onChange={(e) => setUrlDraft(e.target.value)}
            placeholder="https://…/imagen.png"
            autoFocus
            className="bg-transparent text-xs outline-none"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                confirmUrl()
              } else if (e.key === 'Escape') {
                setShowUrlInput(false)
                setUrlDraft('')
              }
            }}
          />
          <div className="flex justify-end gap-1">
            <button
              type="button"
              onClick={() => {
                setShowUrlInput(false)
                setUrlDraft('')
              }}
              className="rounded-sm px-2 py-0.5 text-[11px] text-muted-foreground hover:text-foreground"
              tabIndex={-1}
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={confirmUrl}
              disabled={!urlDraft.trim()}
              className="rounded-sm bg-foreground px-2 py-0.5 text-[11px] text-background disabled:opacity-40"
              tabIndex={-1}
            >
              Insertar
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1 rounded-sm bg-foreground/10 px-2 py-1 hover:bg-foreground/20 hover:text-foreground"
            tabIndex={-1}
          >
            <ImageIcon className="h-3 w-3" />
            Subir imagen
          </button>
          <button
            type="button"
            onClick={() => setShowUrlInput(true)}
            className="rounded-sm px-2 py-1 hover:text-foreground"
            tabIndex={-1}
          >
            Pegar URL
          </button>
          <span className="text-[11px] opacity-70">
            · o pegá con Ctrl+V · o arrastrá un archivo aquí
          </span>
        </div>
      )}
    </div>
  )
}


function SlashMenu({
  query,
  onQueryChange,
  onPick,
  onClose,
}: {
  query: string
  onQueryChange: (q: string) => void
  onPick: (t: BlockType) => void
  onClose: () => void
}) {
  const [activeIdx, setActiveIdx] = useState(0)
  const inputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim()
    if (!q) return BLOCK_MENU_ITEMS
    return BLOCK_MENU_ITEMS.filter((it) => {
      if (it.label.toLowerCase().includes(q)) return true
      return it.keywords.some((k) => k.includes(q))
    })
  }, [query])

  useEffect(() => {
    if (activeIdx >= filtered.length) setActiveIdx(0)
  }, [filtered.length, activeIdx])

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIdx((i) => Math.min(i + 1, filtered.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIdx((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (filtered[activeIdx]) onPick(filtered[activeIdx].type)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
    }
  }

  return (
    <div
      className="absolute left-0 top-0 z-50 w-72 overflow-hidden rounded-md border border-border bg-popover shadow-lg"
      role="listbox"
    >
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <Search className="h-3.5 w-3.5 text-muted-foreground" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => {
            onQueryChange(e.target.value)
            setActiveIdx(0)
          }}
          onKeyDown={onKeyDown}
          placeholder="Filtrar bloques…"
          className="flex-1 bg-transparent text-sm outline-none"
        />
      </div>
      <ul className="max-h-72 overflow-y-auto p-1">
        {filtered.length === 0 ? (
          <li className="px-3 py-2 text-xs text-muted-foreground">
            Sin coincidencias
          </li>
        ) : (
          filtered.map((item, idx) => {
            const Icon = ICON_MAP[item.icon] ?? Pilcrow
            return (
              <li key={item.type}>
                <button
                  type="button"
                  onMouseEnter={() => setActiveIdx(idx)}
                  onClick={() => onPick(item.type)}
                  className={`flex w-full items-center gap-3 rounded-sm px-3 py-2 text-left transition ${
                    idx === activeIdx ? 'bg-accent' : 'hover:bg-accent/60'
                  }`}
                  role="option"
                  aria-selected={idx === activeIdx}
                >
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border bg-muted/40">
                    <Icon className="h-3.5 w-3.5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-foreground">
                      {item.label}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {item.hint}
                    </span>
                  </span>
                </button>
              </li>
            )
          })
        )}
      </ul>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Always-available "add block" button (bottom of the editor)         */
/* ------------------------------------------------------------------ */

function AddBlockButton({ onPick }: { onPick: (t: BlockType) => void }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="relative -mx-6 px-6 pt-2">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <Plus className="h-3.5 w-3.5" />
        Añadir bloque
      </button>
      {open && (
        <SlashMenu
          query=""
          onQueryChange={() => {}}
          onPick={(t) => {
            onPick(t)
            setOpen(false)
          }}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  )
}
