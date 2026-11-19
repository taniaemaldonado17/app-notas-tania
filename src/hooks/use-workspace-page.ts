'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import type { Attachment, Card, ChecklistItem, Column, Page } from '@/lib/types'
import { hexToRgba } from '@/lib/utils'
import * as api from '@/lib/api'

type State = {
  page: Page | null
  loading: boolean
  error: string | null
}

export function useWorkspacePage(pageId: string | null) {
  const [state, setState] = useState<State>({
    page: null,
    loading: true,
    error: null,
  })

  // Keep a ref to the latest page so callbacks always see fresh state.
  const pageRef = useRef<Page | null>(null)
  pageRef.current = state.page

  const reload = useCallback(async () => {
    if (!pageId) return
    setState((s) => ({ ...s, loading: true, error: null }))
    try {
      const page = await api.fetchPage(pageId)
      setState({ page, loading: false, error: null })
    } catch (err) {
      setState({
        page: null,
        loading: false,
        error: err instanceof Error ? err.message : 'Error al cargar',
      })
    }
  }, [pageId])

  useEffect(() => {
    if (!pageId) return
    reload()
  }, [pageId, reload])

  /* ---------------------------- Page ---------------------------- */

  const updatePageMeta = useCallback(
    async (payload: Partial<Pick<Page, 'title' | 'subtitle' | 'icon' | 'coverUrl'>>) => {
      const current = pageRef.current
      if (!current) return
      const previous = current
      const optimistic: Page = { ...current, ...payload }
      pageRef.current = optimistic
      setState((s) => ({ ...s, page: optimistic }))
      try {
        await api.updatePage(current.id, payload)
      } catch (err) {
        pageRef.current = previous
        setState((s) => ({ ...s, page: previous }))
        toast.error('No se pudo guardar la página')
      }
    },
    []
  )

  /* --------------------------- Columns -------------------------- */

  const createColumn = useCallback(async (title: string) => {
    const current = pageRef.current
    if (!current) return
    const previous = current
    const tempId = `tmp-col-${Date.now()}`
    const optimistic: Page = {
      ...current,
      columns: [
        ...current.columns,
        {
          id: tempId,
          title,
          position: current.columns.length,
          accentColor: null,
          pageId: current.id,
          cards: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
    }
    pageRef.current = optimistic
    setState((s) => ({ ...s, page: optimistic }))
    try {
      const column = await api.createColumn({
        pageId: current.id,
        title,
      })
      const latest = pageRef.current ?? optimistic
      const next: Page = {
        ...latest,
        columns: latest.columns.map((c) => (c.id === tempId ? column : c)),
      }
      pageRef.current = next
      setState((s) => ({ ...s, page: next }))
      toast.success('Columna creada')
    } catch (err) {
      pageRef.current = previous
      setState((s) => ({ ...s, page: previous }))
      toast.error('No se pudo crear la columna')
    }
  }, [])

  const updateColumn = useCallback(
    async (columnId: string, payload: Partial<Pick<Column, 'title' | 'accentColor'>>) => {
      const current = pageRef.current
      if (!current) return
      const previous = current
      const optimistic: Page = {
        ...current,
        columns: current.columns.map((c) =>
          c.id === columnId ? { ...c, ...payload } : c
        ),
      }
      pageRef.current = optimistic
      setState((s) => ({ ...s, page: optimistic }))
      try {
        await api.updateColumn(columnId, payload)
      } catch (err) {
        pageRef.current = previous
        setState((s) => ({ ...s, page: previous }))
        toast.error('No se pudo actualizar la columna')
      }
    },
    []
  )

  const deleteColumn = useCallback(async (columnId: string) => {
    const current = pageRef.current
    if (!current) return
    const previous = current
    const optimistic: Page = {
      ...current,
      columns: current.columns.filter((c) => c.id !== columnId),
    }
    pageRef.current = optimistic
    setState((s) => ({ ...s, page: optimistic }))
    try {
      await api.deleteColumn(columnId)
      toast.success('Columna eliminada')
    } catch (err) {
      pageRef.current = previous
      setState((s) => ({ ...s, page: previous }))
      toast.error('No se pudo eliminar la columna')
    }
  }, [])

  const reorderColumns = useCallback(
    async (nextColumns: Column[]) => {
      const current = pageRef.current
      if (!current) return
      const previous = current
      const renumbered = nextColumns.map((c, idx) => ({ ...c, position: idx }))
      const optimistic: Page = { ...current, columns: renumbered }
      pageRef.current = optimistic
      setState((s) => ({ ...s, page: optimistic }))
      try {
        await api.reorderColumns(
          current.id,
          renumbered.map((c) => ({ id: c.id, position: c.position }))
        )
      } catch (err) {
        pageRef.current = previous
        setState((s) => ({ ...s, page: previous }))
        toast.error('No se pudo reordenar las columnas')
      }
    },
    []
  )

  /* ---------------------------- Cards --------------------------- */

  const createCard = useCallback(
    async (columnId: string, title: string, description?: string | null) => {
      const current = pageRef.current
      if (!current) return
      const previous = current
      const tempId = `tmp-card-${Date.now()}`
      const targetCol = current.columns.find((c) => c.id === columnId)
      if (!targetCol) return
      const newPosition = targetCol.cards.length
      const optimistic: Page = {
        ...current,
        columns: current.columns.map((c) =>
          c.id === columnId
            ? {
                ...c,
                cards: [
                  ...c.cards,
                  {
                    id: tempId,
                    title,
                    description: description ?? null,
                    coverUrl: null,
                    accentColor: c.accentColor ?? null,
                    icon: null,
                    position: newPosition,
                    columnId,
                    checklist: [],
                    attachments: [],
                    comments: [],
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                  },
                ],
              }
            : c
        ),
      }
      pageRef.current = optimistic
      setState((s) => ({ ...s, page: optimistic }))
      try {
        const card = await api.createCard({ columnId, title, description })
        // Use the latest state (preserves any concurrent edits) and just swap
        // the temp id for the real id returned by the server.
        const latest = pageRef.current ?? optimistic
        const next: Page = {
          ...latest,
          columns: latest.columns.map((c) =>
            c.id === columnId
              ? {
                  ...c,
                  cards: c.cards.map((k) => (k.id === tempId ? card : k)),
                }
              : c
          ),
        }
        pageRef.current = next
        setState((s) => ({ ...s, page: next }))
        toast.success('Tarjeta creada')
      } catch (err) {
        pageRef.current = previous
        setState((s) => ({ ...s, page: previous }))
        toast.error('No se pudo crear la tarjeta')
      }
    },
    []
  )

  const updateCard = useCallback(
    async (
      cardId: string,
      payload: Partial<Pick<Card, 'title' | 'description' | 'coverUrl' | 'accentColor' | 'icon'>>
    ) => {
      const current = pageRef.current
      if (!current) return
      const previous = current
      const optimistic: Page = {
        ...current,
        columns: current.columns.map((c) => ({
          ...c,
          cards: c.cards.map((k) =>
            k.id === cardId ? { ...k, ...payload } : k
          ),
        })),
      }
      pageRef.current = optimistic
      setState((s) => ({ ...s, page: optimistic }))
      try {
        await api.updateCard(cardId, payload)
      } catch (err) {
        pageRef.current = previous
        setState((s) => ({ ...s, page: previous }))
        toast.error('No se pudo guardar la tarjeta')
      }
    },
    []
  )

  const deleteCard = useCallback(async (cardId: string) => {
    const current = pageRef.current
    if (!current) return
    const previous = current
    const optimistic: Page = {
      ...current,
      columns: current.columns.map((c) => ({
        ...c,
        cards: c.cards.filter((k) => k.id !== cardId),
      })),
    }
    pageRef.current = optimistic
    setState((s) => ({ ...s, page: optimistic }))
    try {
      await api.deleteCard(cardId)
      toast.success('Tarjeta eliminada')
    } catch (err) {
      pageRef.current = previous
      setState((s) => ({ ...s, page: previous }))
      toast.error('No se pudo eliminar la tarjeta')
    }
  }, [])

  /**
   * Apply a new ordering of cards across the whole board.
   * `nextColumns` is the full new column array (with cards reordered/moved).
   */
  const applyCardReorder = useCallback(
    async (nextColumns: Column[]) => {
      const current = pageRef.current
      if (!current) return
      const previous = current
      const optimistic: Page = { ...current, columns: nextColumns }
      pageRef.current = optimistic
      setState((s) => ({ ...s, page: optimistic }))

      const moves: { id: string; columnId: string; position: number }[] = []
      for (const col of nextColumns) {
        col.cards.forEach((card, idx) => {
          moves.push({
            id: card.id,
            columnId: col.id,
            position: idx,
          })
        })
      }
      try {
        await api.reorderCards(moves)
      } catch (err) {
        pageRef.current = previous
        setState((s) => ({ ...s, page: previous }))
        toast.error('No se pudo guardar el nuevo orden')
      }
    },
    []
  )

  /* --------------------------- Checklist ----------------------- */

  const addChecklistItem = useCallback(
    async (cardId: string, text: string) => {
      const current = pageRef.current
      if (!current) return
      const previous = current
      const tempId = `tmp-cli-${Date.now()}`
      const optimistic: Page = {
        ...current,
        columns: current.columns.map((c) => ({
          ...c,
          cards: c.cards.map((k) =>
            k.id === cardId
              ? {
                  ...k,
                  checklist: [
                    ...k.checklist,
                    {
                      id: tempId,
                      text,
                      checked: false,
                      position: k.checklist.length,
                    },
                  ],
                }
              : k
          ),
        })),
      }
      pageRef.current = optimistic
      setState((s) => ({ ...s, page: optimistic }))
      try {
          const item = await api.addChecklistItem(cardId, text)
        const latest = pageRef.current ?? optimistic
        const next: Page = {
          ...latest,
          columns: latest.columns.map((c) => ({
            ...c,
            cards: c.cards.map((k) =>
              k.id === cardId
                ? {
                    ...k,
                    checklist: k.checklist.map((it) =>
                      it.id === tempId ? item : it
                    ),
                  }
                : k
            ),
          })),
        }
        pageRef.current = next
        setState((s) => ({ ...s, page: next }))
      } catch (err) {
        pageRef.current = previous
        setState((s) => ({ ...s, page: previous }))
        toast.error('No se pudo agregar la tarea')
      }
    },
    []
  )

  const updateChecklistItem = useCallback(
    async (
      cardId: string,
      itemId: string,
      payload: Partial<Pick<ChecklistItem, 'text' | 'checked'>>
    ) => {
      const current = pageRef.current
      if (!current) return
      const previous = current
      const optimistic: Page = {
        ...current,
        columns: current.columns.map((c) => ({
          ...c,
          cards: c.cards.map((k) =>
            k.id === cardId
              ? {
                  ...k,
                  checklist: k.checklist.map((it) =>
                    it.id === itemId ? { ...it, ...payload } : it
                  ),
                }
              : k
          ),
        })),
      }
      pageRef.current = optimistic
      setState((s) => ({ ...s, page: optimistic }))
      try {
        await api.updateChecklistItem(itemId, payload)
      } catch (err) {
        pageRef.current = previous
        setState((s) => ({ ...s, page: previous }))
        toast.error('No se pudo actualizar la tarea')
      }
    },
    []
  )

  const deleteChecklistItem = useCallback(
    async (cardId: string, itemId: string) => {
      const current = pageRef.current
      if (!current) return
      const previous = current
      const optimistic: Page = {
        ...current,
        columns: current.columns.map((c) => ({
          ...c,
          cards: c.cards.map((k) =>
            k.id === cardId
              ? {
                  ...k,
                  checklist: k.checklist.filter((it) => it.id !== itemId),
                }
              : k
          ),
        })),
      }
      pageRef.current = optimistic
      setState((s) => ({ ...s, page: optimistic }))
      try {
        await api.deleteChecklistItem(itemId)
      } catch (err) {
        pageRef.current = previous
        setState((s) => ({ ...s, page: previous }))
        toast.error('No se pudo eliminar la tarea')
      }
    },
    []
  )

  /* -------------------------- Attachments ----------------------- */

  const addAttachment = useCallback(
    async (
      cardId: string,
      payload: {
        type: Attachment['type']
        title: string
        url: string
        previewUrl?: string | null
      }
    ) => {
      const current = pageRef.current
      if (!current) return
      const previous = current
      const tempId = `tmp-att-${Date.now()}`
      const optimistic: Page = {
        ...current,
        columns: current.columns.map((c) => ({
          ...c,
          cards: c.cards.map((k) =>
            k.id === cardId
              ? {
                  ...k,
                  attachments: [
                    ...k.attachments,
                    {
                      id: tempId,
                      type: payload.type,
                      title: payload.title,
                      url: payload.url,
                      previewUrl: payload.previewUrl ?? null,
                      position: k.attachments.length,
                      createdAt: new Date().toISOString(),
                    },
                  ],
                }
              : k
          ),
        })),
      }
      pageRef.current = optimistic
      setState((s) => ({ ...s, page: optimistic }))
      try {
        const att = await api.addAttachment(cardId, payload)
        const latest = pageRef.current ?? optimistic
        const next: Page = {
          ...latest,
          columns: latest.columns.map((c) => ({
            ...c,
            cards: c.cards.map((k) =>
              k.id === cardId
                ? {
                    ...k,
                    attachments: k.attachments.map((a) =>
                      a.id === tempId ? att : a
                    ),
                  }
                : k
            ),
          })),
        }
        pageRef.current = next
        setState((s) => ({ ...s, page: next }))
      } catch (err) {
        pageRef.current = previous
        setState((s) => ({ ...s, page: previous }))
        toast.error('No se pudo agregar el archivo')
      }
    },
    []
  )

  const updateAttachment = useCallback(
    async (
      cardId: string,
      attachmentId: string,
      payload: Partial<Pick<Attachment, 'title' | 'url' | 'previewUrl'>>
    ) => {
      const current = pageRef.current
      if (!current) return
      const previous = current
      const optimistic: Page = {
        ...current,
        columns: current.columns.map((c) => ({
          ...c,
          cards: c.cards.map((k) =>
            k.id === cardId
              ? {
                  ...k,
                  attachments: k.attachments.map((a) =>
                    a.id === attachmentId ? { ...a, ...payload } : a
                  ),
                }
              : k
          ),
        })),
      }
      pageRef.current = optimistic
      setState((s) => ({ ...s, page: optimistic }))
      try {
        await api.updateAttachment(attachmentId, payload)
      } catch (err) {
        pageRef.current = previous
        setState((s) => ({ ...s, page: previous }))
        toast.error('No se pudo actualizar el archivo')
      }
    },
    []
  )

  const deleteAttachment = useCallback(
    async (cardId: string, attachmentId: string) => {
      const current = pageRef.current
      if (!current) return
      const previous = current
      const optimistic: Page = {
        ...current,
        columns: current.columns.map((c) => ({
          ...c,
          cards: c.cards.map((k) =>
            k.id === cardId
              ? {
                  ...k,
                  attachments: k.attachments.filter((a) => a.id !== attachmentId),
                }
              : k
          ),
        })),
      }
      pageRef.current = optimistic
      setState((s) => ({ ...s, page: optimistic }))
      try {
        await api.deleteAttachment(attachmentId)
        toast.success('Archivo eliminado')
      } catch (err) {
        pageRef.current = previous
        setState((s) => ({ ...s, page: previous }))
        toast.error('No se pudo eliminar el archivo')
      }
    },
    []
  )

  /* --------------------------- Comments ------------------------- */

  /** Replace one card in the latest page state. */
  const patchCard = useCallback((cardId: string, fn: (card: Card) => Card) => {
    const current = pageRef.current
    if (!current) return
    const next: Page = {
      ...current,
      columns: current.columns.map((c) => ({
        ...c,
        cards: c.cards.map((k) => (k.id === cardId ? fn(k) : k)),
      })),
    }
    pageRef.current = next
    setState((s) => ({ ...s, page: next }))
  }, [])

  const addComment = useCallback(
    async (cardId: string, text: string) => {
      try {
        const comment = await api.addComment(cardId, text)
        patchCard(cardId, (k) => ({
          ...k,
          comments: [...(k.comments ?? []), comment],
        }))
      } catch (err) {
        toast.error('No se pudo guardar el comentario')
      }
    },
    [patchCard]
  )

  const deleteComment = useCallback(
    async (cardId: string, commentId: string) => {
      const previous = pageRef.current
      patchCard(cardId, (k) => ({
        ...k,
        comments: (k.comments ?? []).filter((c) => c.id !== commentId),
      }))
      try {
        await api.deleteComment(commentId)
      } catch (err) {
        pageRef.current = previous
        setState((s) => ({ ...s, page: previous }))
        toast.error('No se pudo eliminar el comentario')
      }
    },
    [patchCard]
  )

  /** Personal star on a card (stored per user, not on the card). */
  const setCardFavorite = useCallback(
    async (cardId: string, favorite: boolean) => {
      patchCard(cardId, (k) => ({ ...k, favorite }))
      try {
        await api.setFavorite({ cardId }, favorite)
      } catch (err) {
        patchCard(cardId, (k) => ({ ...k, favorite: !favorite }))
        throw err
      }
    },
    [patchCard]
  )

  /**
   * Reload the page in the background (no spinner) to pick up changes made
   * by collaborators.
   */
  const refresh = useCallback(async () => {
    if (!pageId) return
    try {
      const page = await api.fetchPage(pageId)
      // Ignore the result if the user switched page meanwhile.
      if (pageRef.current && pageRef.current.id !== page.id) return
      pageRef.current = page
      setState({ page, loading: false, error: null })
    } catch {
      // Network hiccup or access removed: keep what is on screen.
    }
  }, [pageId])

  /** Updates a card on screen only (its content was already saved). */
  const setCardDescriptionLocal = useCallback(
    (cardId: string, description: string | null) => patchCard(cardId, (k) => ({ ...k, description })),
    [patchCard]
  )

  return {
    setCardDescriptionLocal,
    addComment,
    deleteComment,
    setCardFavorite,
    refresh,
    page: state.page,
    loading: state.loading,
    error: state.error,
    reload,
    updatePageMeta,
    createColumn,
    updateColumn,
    deleteColumn,
    reorderColumns,
    createCard,
    updateCard,
    deleteCard,
    applyCardReorder,
    addChecklistItem,
    updateChecklistItem,
    deleteChecklistItem,
    addAttachment,
    updateAttachment,
    deleteAttachment,
  }
}

/** Convenience selector: get the card with the given id from the page tree. */
export function findCard(page: Page | null, cardId: string | null): Card | null {
  if (!page || !cardId) return null
  for (const col of page.columns) {
    const card = col.cards.find((c) => c.id === cardId)
    if (card) return card
  }
  return null
}

/** Convenience selector: get the column containing the given card. */
export function findColumnOfCard(
  page: Page | null,
  cardId: string | null
): Column | null {
  if (!page || !cardId) return null
  for (const col of page.columns) {
    if (col.cards.some((c) => c.id === cardId)) return col
  }
  return null
}

/** Get checklist progress string like "3/5". */
export function checklistProgress(card: Card): { done: number; total: number; ratio: number } {
  const total = card.checklist.length
  const done = card.checklist.filter((i) => i.checked).length
  return { done, total, ratio: total === 0 ? 0 : done / total }
}

/** Returns the inline style for a card's accent color stripe (or null). */
export function cardAccentStyle(card: Card): React.CSSProperties | null {
  const color = card.accentColor
  if (!color) return null
  return {
    borderLeft: `3px solid ${color}`,
    background: `linear-gradient(90deg, ${hexToRgba(color, 0.08)} 0%, transparent 30%)`,
  }
}
