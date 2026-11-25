'use client'

import { useEffect, useRef } from 'react'
import { useCreateBlockNote } from '@blocknote/react'
import { BlockNoteView } from '@blocknote/mantine'
import '@blocknote/mantine/style.css'
import { FileText } from 'lucide-react'
import { docSchema } from '@/components/editor-schema'
import { SubPageHrefContext } from '@/components/subpage-block'
import type { DocBlock } from '@/lib/blocks'

export type PaperDoc = {
  title: string
  icon?: string | null
  coverUrl?: string | null
  blocks: DocBlock[]
}

/**
 * A document as a clean, light "sheet of paper": icon, title and the content
 * with all its formatting (titles, colours, lists, images, tables), not
 * editable. Used to print / save as PDF and for public share links.
 */
export default function DocPaper({
  doc,
  subPageHref,
  onRendered,
}: {
  doc: PaperDoc
  /** Address of a sub-page (shared links); without it sub-pages are plain text. */
  subPageHref?: (subpageId: string) => string
  /** Called once the content and its images are on screen. */
  onRendered?: () => void
}) {
  const editor = useCreateBlockNote({
    schema: docSchema,
    initialContent: doc.blocks.length > 0 ? (doc.blocks as never) : undefined,
  })
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!onRendered) return
    let done = false
    const finish = () => {
      if (done) return
      done = true
      onRendered()
    }
    // Give the blocks a frame to mount, then wait for every image (max 10 s).
    const frame = requestAnimationFrame(() => {
      const imgs = Array.from(ref.current?.querySelectorAll('img') ?? [])
      const pending = imgs
        .filter((img) => !img.complete)
        .map((img) => new Promise<void>((res) => {
          img.addEventListener('load', () => res(), { once: true })
          img.addEventListener('error', () => res(), { once: true })
        }))
      Promise.all(pending).then(finish)
    })
    const timer = setTimeout(finish, 10000)
    return () => {
      cancelAnimationFrame(frame)
      clearTimeout(timer)
    }
  }, [])

  return (
    <div ref={ref} className="doc-paper">
      {doc.coverUrl && <img src={doc.coverUrl} alt="" className="doc-paper-cover" />}
      <header className="doc-paper-header">
        {doc.icon ? <div className="doc-paper-icon">{doc.icon}</div> : null}
        <h1 className="doc-paper-title">{doc.title || 'Sin título'}</h1>
      </header>
      {doc.blocks.length ? (
        <SubPageHrefContext.Provider value={subPageHref ?? noHref}>
          <BlockNoteView
            editor={editor}
            editable={false}
            theme="light"
            className="rich-editor doc-paper-body"
            slashMenu={false}
            sideMenu={false}
            formattingToolbar={false}
            linkToolbar={false}
            filePanel={false}
            tableHandles={false}
          />
        </SubPageHrefContext.Provider>
      ) : (
        <p className="doc-paper-empty">
          <FileText className="inline h-4 w-4" /> Esta página no tiene contenido.
        </p>
      )}
    </div>
  )
}

/** Printed sub-pages: just their name (no link to follow on paper). */
const noHref = () => '#'
