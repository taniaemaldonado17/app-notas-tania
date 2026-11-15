'use client'

import { useMemo, useState } from 'react'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCorners,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  horizontalListSortingStrategy,
  sortableKeyboardCoordinates,
} from '@dnd-kit/sortable'
import { Plus } from 'lucide-react'
import type { Card, Column, Page } from '@/lib/types'
import { useWorkspace } from '@/lib/workspace-store'
import { useWorkspacePage } from '@/hooks/use-workspace-page'
import { ColumnItem } from '@/components/column-item'
import { CardItem } from '@/components/card-item'

type Props = {
  page: Page
  workspace: ReturnType<typeof useWorkspacePage>
}

function matchesQuery(card: Card, q: string): boolean {
  if (!q) return true
  const haystack = [card.title, card.description ?? '', ...card.checklist.map((i) => i.text)]
    .join(' ')
    .toLowerCase()
  return haystack.includes(q.toLowerCase())
}

export function Board({ page, workspace }: Props) {
  const { searchQuery } = useWorkspace()
  const [activeCardId, setActiveCardId] = useState<string | null>(null)
  const [activeColumnId, setActiveColumnId] = useState<string | null>(null)
  const [addingColumn, setAddingColumn] = useState(false)
  const [newColumnTitle, setNewColumnTitle] = useState('')

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  const columns = useMemo(
    () => [...page.columns].sort((a, b) => a.position - b.position),
    [page.columns]
  )

  // Cards that don't match the active search query (to be dimmed).
  const dimmedCardIds = useMemo(() => {
    const set = new Set<string>()
    if (!searchQuery.trim()) return set
    for (const col of columns) {
      for (const card of col.cards) {
        if (!matchesQuery(card, searchQuery)) set.add(card.id)
      }
    }
    return set
  }, [columns, searchQuery])

  function handleDragStart(event: DragStartEvent) {
    const id = String(event.active.id)
    if (id.startsWith('col:')) {
      setActiveColumnId(id.slice(4))
      setActiveCardId(null)
    } else {
      setActiveCardId(id)
      setActiveColumnId(null)
    }
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveCardId(null)
    setActiveColumnId(null)
    const { active, over } = event
    if (!over) return

    const activeId = String(active.id)
    const overId = String(over.id)

    // Column reorder
    if (activeId.startsWith('col:')) {
      if (!overId.startsWith('col:')) return
      const activeColId = activeId.slice(4)
      const overColId = overId.slice(4)
      if (activeColId === overColId) return
      const next = [...columns]
      const fromIdx = next.findIndex((c) => c.id === activeColId)
      const toIdx = next.findIndex((c) => c.id === overColId)
      if (fromIdx === -1 || toIdx === -1) return
      const [moved] = next.splice(fromIdx, 1)
      next.splice(toIdx, 0, moved)
      workspace.reorderColumns(next)
      return
    }

    // Card move / reorder
    const activeCardId = activeId
    // over could be a card (`{cardId}`) or a column drop target (`drop:{columnId}`)
    let targetColumnId: string | null = null
    let targetCardId: string | null = null

    if (overId.startsWith('drop:')) {
      targetColumnId = overId.slice(5)
    } else {
      // over a card → use that card's column
      targetCardId = overId
      const col = columns.find((c) => c.cards.some((k) => k.id === overId))
      targetColumnId = col?.id ?? null
    }
    if (!targetColumnId) return

    const sourceCol = columns.find((c) => c.cards.some((k) => k.id === activeCardId))
    if (!sourceCol) return
    const sourceCard = sourceCol.cards.find((k) => k.id === activeCardId)!
    const destCol = columns.find((c) => c.id === targetColumnId)
    if (!destCol) return

    // Build the new columns array
    const newColumns: Column[] = columns.map((c) => ({
      ...c,
      cards: c.cards.filter((k) => k.id !== activeCardId),
    }))
    const destIdx = newColumns.findIndex((c) => c.id === targetColumnId)
    let insertIdx: number
    if (targetCardId) {
      insertIdx = newColumns[destIdx].cards.findIndex((k) => k.id === targetCardId)
      if (insertIdx === -1) insertIdx = newColumns[destIdx].cards.length
    } else {
      insertIdx = newColumns[destIdx].cards.length
    }
    newColumns[destIdx].cards.splice(insertIdx, 0, sourceCard)

    // Re-number positions inside the destination column
    newColumns[destIdx].cards = newColumns[destIdx].cards.map((k, idx) => ({
      ...k,
      position: idx,
      columnId: newColumns[destIdx].id,
    }))

    // Also renumber source column for cleanliness
    const sourceIdxInNew = newColumns.findIndex((c) => c.id === sourceCol.id)
    if (sourceIdxInNew !== -1) {
      newColumns[sourceIdxInNew].cards = newColumns[sourceIdxInNew].cards.map(
        (k, idx) => ({ ...k, position: idx, columnId: newColumns[sourceIdxInNew].id })
      )
    }

    workspace.applyCardReorder(newColumns)
  }

  async function handleAddColumn() {
    const title = newColumnTitle.trim()
    if (!title) {
      setAddingColumn(false)
      setNewColumnTitle('')
      return
    }
    await workspace.createColumn(title)
    setNewColumnTitle('')
    setAddingColumn(false)
  }

  const activeCard = useMemo(() => {
    if (!activeCardId) return null
    for (const col of columns) {
      const card = col.cards.find((c) => c.id === activeCardId)
      if (card) return card
    }
    return null
  }, [columns, activeCardId])

  const activeColumn = useMemo(
    () => (activeColumnId ? columns.find((c) => c.id === activeColumnId) ?? null : null),
    [columns, activeColumnId]
  )

  const columnItems = columns.map((c) => `col:${c.id}`)

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => {
        setActiveCardId(null)
        setActiveColumnId(null)
      }}
    >
      <SortableContext items={columnItems} strategy={horizontalListSortingStrategy}>
        <div className="notion-scroll flex h-full gap-3 overflow-x-auto px-6 pb-6">
          {columns.map((col) => (
            <ColumnItem
              key={col.id}
              column={col}
              dimmedCardIds={dimmedCardIds}
              workspace={workspace}
            />
          ))}

          {/* Add column */}
          <div className="w-72 shrink-0">
            {addingColumn ? (
              <div className="rounded-lg border border-border bg-card/40 p-2">
                <input
                  autoFocus
                  type="text"
                  value={newColumnTitle}
                  onChange={(e) => setNewColumnTitle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      handleAddColumn()
                    } else if (e.key === 'Escape') {
                      e.preventDefault()
                      setAddingColumn(false)
                      setNewColumnTitle('')
                    }
                  }}
                  placeholder="Nombre de la columna…"
                  className="w-full rounded-sm border border-border bg-background px-2 py-1 text-sm focus:outline-none"
                />
                <div className="mt-1 flex items-center justify-end gap-1">
                  <button
                    onClick={() => {
                      setAddingColumn(false)
                      setNewColumnTitle('')
                    }}
                    className="rounded-sm px-2 py-0.5 text-xs text-muted-foreground hover:bg-accent"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleAddColumn}
                    disabled={!newColumnTitle.trim()}
                    className="rounded-sm bg-primary px-2 py-0.5 text-xs text-primary-foreground disabled:opacity-50"
                  >
                    Crear
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setAddingColumn(true)}
                className="flex w-full items-center gap-1 rounded-md border border-dashed border-border px-3 py-2 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <Plus className="h-3.5 w-3.5" />
                Añadir columna
              </button>
            )}
          </div>
        </div>
      </SortableContext>

      <DragOverlay>
        {activeCard ? (
          <div className="w-72 rotate-2">
            <CardItem
              card={activeCard}
              dimmed={false}
              workspace={workspace}
              onOpen={() => {}}
            />
          </div>
        ) : activeColumn ? (
          <div className="w-72 rotate-1 rounded-md border border-border bg-card px-3 py-2 text-sm font-semibold shadow-xl">
            {activeColumn.title}
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}
