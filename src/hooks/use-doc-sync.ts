'use client'

import { useCallback, useEffect, useRef } from 'react'
import type { BlockNoteEditor } from '@blocknote/core'
import { toast } from 'sonner'
import { parseDoc, serializeDoc, type DocBlock } from '@/lib/blocks'
import { hashDoc, mergeDocs } from '@/lib/doc-merge'

const SAVE_DELAY = 700
const POLL_EVERY = 4000

export type SaveResult = { ok: true } | { conflict: string | null }

/**
 * Keeps an open document (card or row content) in sync with the server while
 * several people edit it:
 * - saves while typing, telling the server which version was edited; if
 *   someone else saved in between, both versions are merged and saved again;
 * - every few seconds, picks up other people's changes and shows them.
 */
export function useDocSync({
  initial,
  fetchLatest,
  save,
  onSaved,
}: {
  /** Stored content when the document was opened. */
  initial: string | null
  fetchLatest: () => Promise<string | null>
  save: (content: string | null, baseHash: string) => Promise<SaveResult>
  onSaved?: (content: string | null) => void
}) {
  const editorRef = useRef<BlockNoteEditor | null>(null)
  /** Last version known to be on the server (as stored). */
  const baseRef = useRef<string | null>(initial)
  /** Same version as the editor shows it (for comparing blocks). */
  const baseBlocksRef = useRef<DocBlock[]>(parseDoc(initial))
  const pendingRef = useRef<DocBlock[] | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const busyRef = useRef(false)
  const applyingRef = useRef(false)
  const fns = useRef({ fetchLatest, save, onSaved })
  fns.current = { fetchLatest, save, onSaved }

  const snapshot = () => (editorRef.current ? (structuredClone(editorRef.current.document) as DocBlock[]) : null)

  /** Shows a version in the editor without treating it as a local edit. */
  const show = useCallback((blocks: DocBlock[]) => {
    const editor = editorRef.current
    if (!editor) return
    let cursorId: string | null = null
    try {
      cursorId = editor.getTextCursorPosition().block.id
    } catch {
      // no cursor
    }
    applyingRef.current = true
    try {
      editor.replaceBlocks(editor.document, (blocks.length ? blocks : [{ type: 'paragraph' }]) as never)
      if (cursorId && editor.getBlock(cursorId) && editor.isFocused()) editor.setTextCursorPosition(cursorId, 'end')
    } finally {
      applyingRef.current = false
    }
  }, [])

  const again = useRef<() => void>(() => {})
  const flush = useCallback(async (): Promise<void> => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = null
    if (busyRef.current || !pendingRef.current) return
    const blocks = pendingRef.current
    pendingRef.current = null
    const serialized = serializeDoc(blocks)
    if (serialized === baseRef.current) return
    busyRef.current = true
    try {
      const res = await fns.current.save(serialized, hashDoc(baseRef.current))
      if ('ok' in res) {
        baseRef.current = serialized
        baseBlocksRef.current = blocks
        fns.current.onSaved?.(serialized)
      } else {
        // Someone saved in between: merge their version with ours (including
        // anything typed while saving) and save the result.
        const mine = snapshot() ?? pendingRef.current ?? blocks
        const merged = mergeDocs(baseBlocksRef.current, mine, parseDoc(res.conflict))
        baseRef.current = res.conflict
        show(merged)
        baseBlocksRef.current = snapshot() ?? parseDoc(res.conflict)
        pendingRef.current = snapshot() ?? merged
        fns.current.onSaved?.(res.conflict)
      }
    } catch {
      pendingRef.current ??= blocks
      toast.error('No se pudo guardar; se reintenta en unos segundos')
      timerRef.current = setTimeout(() => again.current(), POLL_EVERY)
    } finally {
      busyRef.current = false
    }
    if (pendingRef.current && !timerRef.current) again.current()
  }, [show])
  useEffect(() => {
    again.current = () => void flush()
  }, [flush])

  const onChange = useCallback(
    (blocks: DocBlock[]) => {
      if (applyingRef.current) return
      pendingRef.current = blocks
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => void flush(), SAVE_DELAY)
    },
    [flush]
  )

  const onReady = useCallback((editor: BlockNoteEditor | null) => {
    editorRef.current = editor
    if (editor) baseBlocksRef.current = structuredClone(editor.document) as DocBlock[]
  }, [])

  // Pick up other people's changes while the document is open.
  useEffect(() => {
    let stopped = false
    async function poll() {
      if (document.visibilityState !== 'visible' || busyRef.current || pendingRef.current || !editorRef.current) return
      try {
        const latest = await fns.current.fetchLatest()
        if (stopped || busyRef.current || pendingRef.current || latest === baseRef.current) return
        const merged = mergeDocs(baseBlocksRef.current, snapshot() ?? [], parseDoc(latest))
        baseRef.current = latest
        show(merged)
        baseBlocksRef.current = snapshot() ?? parseDoc(latest)
        fns.current.onSaved?.(latest)
      } catch {
        // offline or no access: try again later
      }
    }
    const id = window.setInterval(poll, POLL_EVERY)
    document.addEventListener('visibilitychange', poll)
    return () => {
      stopped = true
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', poll)
    }
  }, [show])

  // Save what is pending when the document closes.
  useEffect(() => () => void flush(), [flush])

  return { onChange, onReady, editorRef, flush }
}
