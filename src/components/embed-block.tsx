'use client'

import { useRef, useState } from 'react'
import { createReactBlockSpec } from '@blocknote/react'
import { Code2, ExternalLink, FileUp, Globe, Maximize2, Pencil, Trash2 } from 'lucide-react'

const MIN_HEIGHT = 120
const MAX_HTML_BYTES = 1024 * 1024

/** Turns common share links into their embeddable form. */
export function embedUrl(raw: string): string {
  let v = raw.trim()
  if (!/^https?:\/\//i.test(v)) v = `https://${v}`
  const yt = v.match(/(?:youtube\.com\/watch\?(?:.*&)?v=|youtu\.be\/|youtube\.com\/shorts\/)([\w-]{6,})/i)
  if (yt) return `https://www.youtube.com/embed/${yt[1]}`
  const drive = v.match(/drive\.google\.com\/file\/(?:u\/\d+\/)?d\/([\w-]{10,})/i)
  if (drive) return `https://drive.google.com/file/d/${drive[1]}/preview`
  const gdoc = v.match(/docs\.google\.com\/(document|spreadsheets|presentation)\/d\/([\w-]{10,})/i)
  if (gdoc) return `https://docs.google.com/${gdoc[1]}/d/${gdoc[2]}/preview`
  const folder = v.match(/drive\.google\.com\/drive\/(?:u\/\d+\/)?folders\/([\w-]{10,})/i)
  if (folder) return `https://drive.google.com/embeddedfolderview?id=${folder[1]}#grid`
  return v
}

/**
 * "Insertar HTML o web" block: shows a web page (by link) or a piece of HTML
 * (pasted or loaded from a .html file) inside the page, in an isolated frame.
 * Pasted HTML runs sandboxed without access to the app (no same-origin).
 */
export const EmbedBlock = createReactBlockSpec(
  {
    type: 'embed',
    propSchema: {
      url: { default: '' },
      html: { default: '' },
      height: { default: 420 },
    },
    content: 'none',
  },
  {
    render: (p) => <EmbedView block={p.block as unknown as EmbedBlockData} editor={p.editor as unknown as EmbedEditor} />,
  }
)

type EmbedProps = { url: string; html: string; height: number }
type EmbedBlockData = { id: string; props: EmbedProps }
type EmbedEditor = {
  isEditable: boolean
  updateBlock: (block: EmbedBlockData, update: { props: Partial<EmbedProps> }) => void
  removeBlocks: (blocks: EmbedBlockData[]) => void
}

function EmbedView({ block, editor }: { block: EmbedBlockData; editor: EmbedEditor }) {
      const { url, html, height } = block.props
      const editable = editor.isEditable
      const [editing, setEditing] = useState(!url && !html)
      const [resizing, setResizing] = useState(false)
      const frameRef = useRef<HTMLIFrameElement>(null)

      const update = (props: Partial<EmbedProps>) => editor.updateBlock(block, { props })

      function startResize(e: React.PointerEvent) {
        e.preventDefault()
        const startY = e.clientY
        const startH = height
        setResizing(true)
        const move = (ev: PointerEvent) => {
          const h = Math.max(MIN_HEIGHT, Math.round(startH + ev.clientY - startY))
          if (frameRef.current) frameRef.current.style.height = `${h}px`
        }
        const up = (ev: PointerEvent) => {
          window.removeEventListener('pointermove', move)
          window.removeEventListener('pointerup', up)
          setResizing(false)
          update({ height: Math.max(MIN_HEIGHT, Math.round(startH + ev.clientY - startY)) })
        }
        window.addEventListener('pointermove', move)
        window.addEventListener('pointerup', up)
      }

      if (editing && editable) {
        return (
          <EmbedForm
            initialUrl={url}
            initialHtml={html}
            onCancel={url || html ? () => setEditing(false) : undefined}
            onSave={(p) => {
              update(p)
              setEditing(false)
            }}
          />
        )
      }

      if (!url && !html) {
        return <div className="embed-empty">Bloque HTML vacío</div>
      }

      return (
        <div className="embed-wrap" contentEditable={false}>
          <iframe
            ref={frameRef}
            title={url ? 'Contenido insertado' : 'HTML insertado'}
            {...(url
              ? { src: embedUrl(url), sandbox: 'allow-scripts allow-same-origin allow-popups allow-forms allow-presentation' }
              : { srcDoc: html, sandbox: 'allow-scripts allow-popups allow-forms allow-modals' })}
            allow="fullscreen; clipboard-write"
            allowFullScreen
            referrerPolicy="no-referrer"
            loading="lazy"
            style={{ height, pointerEvents: resizing ? 'none' : undefined }}
            className="embed-frame"
          />
          <div className="embed-toolbar">
            <span className="embed-label">
              {url ? <Globe size={12} /> : <Code2 size={12} />}
              {url ? url.replace(/^https?:\/\//i, '').slice(0, 60) : 'HTML'}
            </span>
            <button type="button" title="Pantalla completa" onClick={() => frameRef.current?.requestFullscreen?.()}>
              <Maximize2 size={14} />
            </button>
            {url && (
              <a href={embedUrl(url)} target="_blank" rel="noopener noreferrer" title="Abrir en otra pestaña">
                <ExternalLink size={14} />
              </a>
            )}
            {editable && (
              <>
                <button type="button" title="Editar" onClick={() => setEditing(true)}>
                  <Pencil size={14} />
                </button>
                <button type="button" title="Eliminar bloque" onClick={() => editor.removeBlocks([block])}>
                  <Trash2 size={14} />
                </button>
              </>
            )}
          </div>
          {editable && (
            <div className="embed-resize" onPointerDown={startResize} title="Arrastrá para cambiar el alto" />
          )}
        </div>
      )
}

function EmbedForm({
  initialUrl,
  initialHtml,
  onSave,
  onCancel,
}: {
  initialUrl: string
  initialHtml: string
  onSave: (p: { url: string; html: string }) => void
  onCancel?: () => void
}) {
  const [tab, setTab] = useState<'url' | 'html'>(initialHtml ? 'html' : 'url')
  const [url, setUrl] = useState(initialUrl)
  const [html, setHtml] = useState(initialHtml)
  const [error, setError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  function save() {
    if (tab === 'url') {
      if (!url.trim()) return setError('Pegá un enlace')
      onSave({ url: url.trim(), html: '' })
    } else {
      if (!html.trim()) return setError('Pegá código HTML o subí un archivo .html')
      onSave({ url: '', html })
    }
  }

  async function loadFile(f: File) {
    if (f.size > MAX_HTML_BYTES) return setError('El archivo supera 1 MB')
    setHtml(await f.text())
    setTab('html')
    setError('')
  }

  return (
    <div className="embed-form" contentEditable={false} onKeyDown={(e) => e.stopPropagation()}>
      <div className="embed-tabs">
        <button type="button" data-active={tab === 'url'} onClick={() => setTab('url')}>
          <Globe size={14} /> Enlace web
        </button>
        <button type="button" data-active={tab === 'html'} onClick={() => setTab('html')}>
          <Code2 size={14} /> Código HTML
        </button>
      </div>
      {tab === 'url' ? (
        <>
          <input
            autoFocus
            value={url}
            onChange={(e) => {
              setUrl(e.target.value)
              setError('')
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                save()
              }
            }}
            placeholder="https://… (web, Google Maps, YouTube, Drive, Figma…)"
          />
          <p className="embed-hint">Algunos sitios no permiten mostrarse dentro de otra página; en ese caso usá «Abrir en otra pestaña».</p>
        </>
      ) : (
        <>
          <textarea
            autoFocus
            value={html}
            onChange={(e) => {
              setHtml(e.target.value)
              setError('')
            }}
            rows={8}
            spellCheck={false}
            placeholder="<html>…</html>"
          />
          <input
            ref={fileRef}
            type="file"
            accept=".html,.htm,text/html"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0]
              e.target.value = ''
              if (f) void loadFile(f)
            }}
          />
          <button type="button" className="embed-link" onClick={() => fileRef.current?.click()}>
            <FileUp size={14} /> Cargar desde un archivo .html
          </button>
        </>
      )}
      {error && <p className="embed-error">{error}</p>}
      <div className="embed-actions">
        {onCancel && (
          <button type="button" onClick={onCancel}>
            Cancelar
          </button>
        )}
        <button type="button" className="primary" onClick={save}>
          Insertar
        </button>
      </div>
    </div>
  )
}
