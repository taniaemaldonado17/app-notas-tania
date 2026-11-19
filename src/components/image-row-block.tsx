'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { createReactBlockSpec } from '@blocknote/react'
import { ArrowDownToLine, ImagePlus, Link2, Loader2, Trash2, X } from 'lucide-react'
import { toast } from 'sonner'
import { uploadFile } from '@/lib/api'

/** Drag payload when an image is dragged out of a row (to reorder or move it to another row). */
const DRAG_TYPE = 'application/x-image-row'
const PER_ROW_OPTIONS = [0, 2, 3, 4] as const

type RowImage = { url: string; name?: string }
type RowProps = { images: string; perRow: number }
type RowBlockData = { id: string; type: string; props: RowProps }
type AnyBlock = { id: string; type: string; props?: Record<string, unknown>; children?: AnyBlock[] }
type RowEditor = {
  isEditable: boolean
  getBlock: (id: string) => AnyBlock | undefined
  updateBlock: (id: string, update: { props: Partial<RowProps> }) => void
  removeBlocks: (ids: string[]) => void
  insertBlocks: (blocks: { type: string; props: Record<string, unknown> }[], ref: string, placement: 'before' | 'after') => void
  getSelection: () => { blocks: AnyBlock[] } | undefined
  transact: <T>(fn: () => T) => T
}

/**
 * "Imágenes en fila": several images side by side (like Notion columns, but
 * only for images). Drop image files or existing image blocks onto it, drag the
 * images to reorder them or to move them to another row.
 */
export const ImageRowBlock = createReactBlockSpec(
  {
    type: 'imageRow',
    propSchema: {
      images: { default: '[]' },
      perRow: { default: 0 },
    },
    content: 'none',
  },
  {
    render: (p) => <ImageRowView block={p.block as unknown as RowBlockData} editor={p.editor as unknown as RowEditor} />,
    toExternalHTML: (p) => (
      <p>
        {parseImages((p.block.props as RowProps).images).map((img, i) => (
          <img key={i} src={img.url} alt={img.name ?? ''} />
        ))}
      </p>
    ),
  }
)

export function parseImages(raw: unknown): RowImage[] {
  if (typeof raw !== 'string') return []
  try {
    const list = JSON.parse(raw)
    return Array.isArray(list)
      ? list.filter((x): x is RowImage => !!x && typeof x.url === 'string' && !!x.url)
      : []
  } catch {
    return []
  }
}

function ImageRowView({ block, editor }: { block: RowBlockData; editor: RowEditor }) {
  const editable = editor.isEditable
  const images = parseImages(block.props.images)
  const perRow = block.props.perRow || Math.min(Math.max(images.length, 2), 3)
  const rootRef = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(0)
  const [dropAt, setDropAt] = useState<number | null>(null)
  const [dragFrom, setDragFrom] = useState<number | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [askUrl, setAskUrl] = useState(false)

  // Always read the latest props: uploads finish after other edits may have happened.
  const latest = (): RowImage[] => parseImages(editor.getBlock(block.id)?.props?.images)
  const save = (list: RowImage[]) => editor.updateBlock(block.id, { props: { images: JSON.stringify(list) } })

  function insertAt(list: RowImage[], at: number, add: RowImage[]) {
    const i = Math.max(0, Math.min(at, list.length))
    return [...list.slice(0, i), ...add, ...list.slice(i)]
  }

  async function addFiles(files: File[], at?: number) {
    const imgs = files.filter((f) => f.type.startsWith('image/'))
    if (!imgs.length) {
      toast.error('Solo se pueden agregar imágenes')
      return
    }
    setUploading((n) => n + imgs.length)
    const results = await Promise.all(
      imgs.map(async (f) => {
        try {
          const r = await uploadFile(f)
          return { url: r.url, name: f.name } as RowImage
        } catch (err) {
          toast.error(`No se pudo subir ${f.name}${err instanceof Error && err.message ? `: ${err.message}` : ''}`)
          return null
        } finally {
          setUploading((n) => n - 1)
        }
      })
    )
    const ok = results.filter((r): r is RowImage => !!r)
    if (!ok.length) return
    const list = latest()
    save(insertAt(list, at ?? list.length, ok))
  }

  function removeAt(i: number) {
    const list = latest()
    list.splice(i, 1)
    save(list)
  }

  /** Takes an image out of the row and puts it as a normal image block below. */
  function takeOut(i: number) {
    const list = latest()
    const [img] = list.splice(i, 1)
    if (!img) return
    editor.transact(() => {
      editor.insertBlocks([{ type: 'image', props: { url: img.url, name: img.name ?? '' } }], block.id, 'after')
      if (list.length) save(list)
      else editor.removeBlocks([block.id])
    })
  }

  // Native listeners: the editor (ProseMirror) listens to drag events on its
  // root, so ours must run first and stop them from reaching it.
  useEffect(() => {
    const el = rootRef.current
    if (!el || !editable) return

    const indexAt = (e: DragEvent) => {
      const items = Array.from(el.querySelectorAll<HTMLElement>('[data-row-item]'))
      for (let i = 0; i < items.length; i++) {
        const r = items[i].getBoundingClientRect()
        const sameLine = e.clientY >= r.top && e.clientY <= r.bottom
        if (sameLine && e.clientX < r.left + r.width / 2) return i
        if (e.clientY < r.top) return i
      }
      return items.length
    }
    const kind = (e: DragEvent): 'files' | 'item' | 'block' | null => {
      const types = Array.from(e.dataTransfer?.types ?? [])
      if (types.includes(DRAG_TYPE)) return 'item'
      if (types.includes('blocknote/html')) return 'block'
      if (types.includes('Files')) return 'files'
      return null
    }

    const onDragStart = (e: DragEvent) => {
      const item = (e.target as HTMLElement | null)?.closest?.('[data-row-item]') as HTMLElement | null
      if (!item || !el.contains(item)) return
      e.stopPropagation()
      const from = Number(item.dataset.rowItem)
      const img = latest()[from]
      if (!img || !e.dataTransfer) return
      e.dataTransfer.setData(DRAG_TYPE, JSON.stringify({ blockId: block.id, index: from, image: img }))
      e.dataTransfer.effectAllowed = 'move'
      setDragFrom(from)
    }
    const onDragOver = (e: DragEvent) => {
      if (!kind(e)) return
      e.preventDefault()
      e.stopPropagation()
      if (e.dataTransfer) e.dataTransfer.dropEffect = kind(e) === 'files' ? 'copy' : 'move'
      setDropAt(indexAt(e))
    }
    const onDragLeave = (e: DragEvent) => {
      if (!el.contains(e.relatedTarget as Node | null)) setDropAt(null)
    }
    const onDrop = (e: DragEvent) => {
      const k = kind(e)
      if (!k) return
      e.preventDefault()
      e.stopPropagation()
      const at = indexAt(e)
      setDropAt(null)

      if (k === 'files') {
        void addFiles(Array.from(e.dataTransfer?.files ?? []), at)
        return
      }

      if (k === 'item') {
        let data: { blockId: string; index: number; image: RowImage }
        try {
          data = JSON.parse(e.dataTransfer!.getData(DRAG_TYPE))
        } catch {
          return
        }
        if (data.blockId === block.id) {
          const list = latest()
          const [moved] = list.splice(data.index, 1)
          if (!moved) return
          save(insertAt(list, at > data.index ? at - 1 : at, [moved]))
          return
        }
        // From another row: move it here.
        const source = editor.getBlock(data.blockId)
        editor.transact(() => {
          save(insertAt(latest(), at, [data.image]))
          if (source) {
            const rest = parseImages(source.props?.images)
            rest.splice(data.index, 1)
            if (rest.length) editor.updateBlock(source.id, { props: { images: JSON.stringify(rest) } })
            else editor.removeBlocks([source.id])
          }
        })
        return
      }

      // A block dragged with the editor's ⋮⋮ handle: if it is an image, bring it in.
      // The dragged blocks travel as HTML with their ids in data-id.
      const ids = new Set<string>()
      const html = e.dataTransfer?.getData('blocknote/html') ?? ''
      if (html) {
        const doc = new DOMParser().parseFromString(html, 'text/html')
        doc.querySelectorAll('[data-node-type="blockContainer"][data-id]').forEach((n) => ids.add(n.getAttribute('data-id')!))
      }
      let dragged = Array.from(ids)
        .map((id) => editor.getBlock(id))
        .filter((b): b is AnyBlock => !!b)
      if (!dragged.length) dragged = editor.getSelection()?.blocks ?? []
      dragged = dragged.filter((b) => b.id !== block.id)
      const imgs = dragged.filter((b) => b.type === 'image' && typeof b.props?.url === 'string' && b.props.url)
      if (!imgs.length) {
        toast.info('Solo se pueden soltar imágenes dentro de la fila')
        return
      }
      editor.transact(() => {
        save(
          insertAt(
            latest(),
            at,
            imgs.map((b) => ({ url: String(b.props!.url), name: (b.props!.name as string) || undefined }))
          )
        )
        editor.removeBlocks(imgs.map((b) => b.id))
      })
    }
    const onDragEnd = () => {
      setDragFrom(null)
      setDropAt(null)
    }
    // Keep the editor from selecting the block on mousedown, which would stop the image drag.
    const onMouseDown = (e: MouseEvent) => {
      if ((e.target as HTMLElement | null)?.closest?.('[data-row-item], button, input')) e.stopPropagation()
    }

    el.addEventListener('dragstart', onDragStart)
    el.addEventListener('dragover', onDragOver)
    el.addEventListener('dragleave', onDragLeave)
    el.addEventListener('drop', onDrop)
    el.addEventListener('dragend', onDragEnd)
    el.addEventListener('mousedown', onMouseDown)
    return () => {
      el.removeEventListener('dragstart', onDragStart)
      el.removeEventListener('dragover', onDragOver)
      el.removeEventListener('dragleave', onDragLeave)
      el.removeEventListener('drop', onDrop)
      el.removeEventListener('dragend', onDragEnd)
      el.removeEventListener('mousedown', onMouseDown)
    }
     
  }, [editable, block.id])

  const picker = (
    <input
      ref={fileRef}
      type="file"
      accept="image/*"
      multiple
      hidden
      onChange={(e) => {
        const files = Array.from(e.target.files ?? [])
        e.target.value = ''
        if (files.length) void addFiles(files)
      }}
    />
  )

  return (
    <div ref={rootRef} className="image-row" contentEditable={false} data-dropping={dropAt !== null || undefined}>
      {picker}
      {images.length === 0 && uploading === 0 ? (
        <div className="image-row-empty">
          <ImagePlus size={22} />
          <p>
            {editable
              ? 'Arrastrá acá imágenes de tu compu, o imágenes de esta nota con el ⋮⋮'
              : 'Fila de imágenes vacía'}
          </p>
          {editable && (
            <div className="image-row-empty-actions">
              <button type="button" onClick={() => fileRef.current?.click()}>
                <ImagePlus size={14} /> Subir imágenes
              </button>
              <button type="button" onClick={() => setAskUrl(true)}>
                <Link2 size={14} /> Pegar enlace
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="image-row-grid" style={{ gridTemplateColumns: `repeat(${perRow}, minmax(0, 1fr))` }}>
          {images.map((img, i) => (
            <figure
              key={`${img.url}-${i}`}
              data-row-item={i}
              draggable={editable}
              className="image-row-item"
              data-drop-before={dropAt === i || undefined}
              data-dragging={dragFrom === i || undefined}
            >
              { }
              <img src={img.url} alt={img.name ?? ''} draggable={false} onClick={() => setPreview(img.url)} />
              {editable && (
                <div className="image-row-item-tools">
                  <button type="button" title="Sacar de la fila (queda debajo)" onClick={() => takeOut(i)}>
                    <ArrowDownToLine size={13} />
                  </button>
                  <button type="button" title="Quitar imagen" onClick={() => removeAt(i)}>
                    <Trash2 size={13} />
                  </button>
                </div>
              )}
            </figure>
          ))}
          {Array.from({ length: uploading }).map((_, i) => (
            <div key={`up-${i}`} className="image-row-uploading">
              <Loader2 size={18} className="animate-spin" />
              Subiendo…
            </div>
          ))}
          {dropAt !== null && dropAt >= images.length && <div className="image-row-drop-end" />}
        </div>
      )}

      {editable && images.length > 0 && (
        <div className="image-row-toolbar">
          <span>Por fila:</span>
          {PER_ROW_OPTIONS.map((n) => (
            <button
              key={n}
              type="button"
              data-active={block.props.perRow === n || undefined}
              onClick={() => editor.updateBlock(block.id, { props: { perRow: n } })}
            >
              {n === 0 ? 'Auto' : n}
            </button>
          ))}
          <span className="image-row-sep" />
          <button type="button" title="Agregar imágenes" onClick={() => fileRef.current?.click()}>
            <ImagePlus size={14} />
          </button>
          <button type="button" title="Agregar desde un enlace" onClick={() => setAskUrl(true)}>
            <Link2 size={14} />
          </button>
          <button type="button" title="Eliminar la fila" onClick={() => editor.removeBlocks([block.id])}>
            <Trash2 size={14} />
          </button>
        </div>
      )}

      {askUrl && (
        <form
          className="image-row-url"
          onKeyDown={(e) => e.stopPropagation()}
          onSubmit={(e) => {
            e.preventDefault()
            const v = String(new FormData(e.currentTarget).get('url') ?? '').trim()
            if (!/^https?:\/\//i.test(v)) {
              toast.error('Pegá un enlace que empiece con https://')
              return
            }
            save([...latest(), { url: v }])
            setAskUrl(false)
          }}
        >
          <input name="url" autoFocus placeholder="https://… enlace a una imagen" />
          <button type="submit" className="primary">Agregar</button>
          <button type="button" onClick={() => setAskUrl(false)}>Cancelar</button>
        </form>
      )}

      {preview &&
        createPortal(
          <div className="image-row-preview" onClick={() => setPreview(null)} role="dialog" aria-label="Imagen ampliada">
            { }
            <img src={preview} alt="" />
            <button type="button" aria-label="Cerrar" onClick={() => setPreview(null)}>
              <X size={18} />
            </button>
          </div>,
          document.body
        )}
    </div>
  )
}
