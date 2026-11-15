'use client'

import { useRef, useState } from 'react'
import { useDroppable } from '@dnd-kit/core'
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Plus, MoreHorizontal, GripVertical, Trash2, Pencil, Check, X } from 'lucide-react'
import { toast } from 'sonner'
import { CardItem } from '@/components/card-item'
import { InlineEdit } from '@/components/inline-edit'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useWorkspace } from '@/lib/workspace-store'
import type { Card, Column } from '@/lib/types'
import { useWorkspacePage } from '@/hooks/use-workspace-page'

type Props = {
  column: Column
  dimmedCardIds: Set<string>
  workspace: ReturnType<typeof useWorkspacePage>
}

export function ColumnItem({ column, dimmedCardIds, workspace }: Props) {
  const { openCard, searchQuery } = useWorkspace()
  const [adding, setAdding] = useState(false)
  const [newCardTitle, setNewCardTitle] = useState('')
  const [renaming, setRenaming] = useState(false)
  const [renameDraft, setRenameDraft] = useState(column.title)
  const inputRef = useRef<HTMLTextAreaElement | HTMLInputElement | null>(null)

  const sortable = useSortable({ id: `col:${column.id}` })
  const style: React.CSSProperties = {
    transform: CSS.Translate.toString(sortable.transform),
    transition: sortable.transition,
    opacity: sortable.isDragging ? 0.5 : undefined,
  }

  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: `drop:${column.id}`,
  })

  async function handleAddCard() {
    const title = newCardTitle.trim()
    if (!title) {
      setAdding(false)
      return
    }
    await workspace.createCard(column.id, title)
    setNewCardTitle('')
    setAdding(true) // keep adding if user wants more
    // refocus
    setTimeout(() => inputRef.current?.focus(), 0)
  }

  async function handleRename() {
    const next = renameDraft.trim()
    setRenaming(false)
    if (next && next !== column.title) {
      await workspace.updateColumn(column.id, { title: next })
    } else {
      setRenameDraft(column.title)
    }
  }

  async function handleClearCards() {
    for (const card of column.cards) {
      await workspace.deleteCard(card.id)
    }
    toast.success('Tarjetas eliminadas')
  }

  const cards = column.cards
  const cardIds = cards.map((c) => c.id)

  // When searching, hide non-matching cards entirely (rather than just dimming them)
  // — but the dimmedCardIds set already tells us which to dim. We'll keep them visible.
  const visibleCards = cards

  return (
    <div
      ref={sortable.setNodeRef}
      style={style}
      className="flex w-72 shrink-0 flex-col rounded-lg border border-border bg-card/40"
    >
      {/* Header */}
      <div
        className="flex items-center gap-1 px-2 py-2"
        style={
          column.accentColor
            ? {
                borderBottom: `2px solid ${column.accentColor}`,
              }
            : undefined
        }
      >
        <button
          className="flex h-5 w-4 shrink-0 cursor-grab items-center justify-center text-muted-foreground/40 opacity-0 transition hover:text-foreground group-hover:opacity-100 hover:opacity-100"
          aria-label="Arrastrar columna"
          {...sortable.attributes}
          {...sortable.listeners}
        >
          <GripVertical className="h-3.5 w-3.5" />
        </button>

        {renaming ? (
          <div className="flex flex-1 items-center gap-1">
            <input
              ref={(el) => {
                inputRef.current = el
              }}
              autoFocus
              type="text"
              value={renameDraft}
              onChange={(e) => setRenameDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  handleRename()
                } else if (e.key === 'Escape') {
                  e.preventDefault()
                  setRenameDraft(column.title)
                  setRenaming(false)
                }
              }}
              className="w-full rounded-sm border border-border bg-background px-1 py-0.5 text-sm font-semibold focus:outline-none"
            />
            <button
              onClick={handleRename}
              className="text-foreground hover:text-foreground"
              aria-label="Guardar"
            >
              <Check className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => {
                setRenameDraft(column.title)
                setRenaming(false)
              }}
              aria-label="Cancelar"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : (
          <span className="flex-1 truncate text-sm font-semibold text-foreground">
            {column.title}
          </span>
        )}

        {!renaming && (
          <span className="rounded-sm bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
            {cards.length}
          </span>
        )}

        {!renaming && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="flex h-6 w-6 items-center justify-center rounded-sm text-muted-foreground hover:bg-accent hover:text-foreground"
                aria-label="Opciones de columna"
              >
                <MoreHorizontal className="h-4 w-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem
                onClick={() => {
                  setRenameDraft(column.title)
                  setRenaming(true)
                  setTimeout(() => inputRef.current?.focus(), 0)
                }}
                className="cursor-pointer text-sm"
              >
                <Pencil className="mr-2 h-3.5 w-3.5" />
                Renombrar
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => setAdding(true)}
                className="cursor-pointer text-sm"
              >
                <Plus className="mr-2 h-3.5 w-3.5" />
                Añadir tarjeta
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={handleClearCards}
                className="cursor-pointer text-sm"
                disabled={cards.length === 0}
              >
                <Trash2 className="mr-2 h-3.5 w-3.5" />
                Vaciar columna
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => workspace.deleteColumn(column.id)}
                className="cursor-pointer text-sm text-destructive focus:text-destructive"
              >
                <Trash2 className="mr-2 h-3.5 w-3.5" />
                Eliminar columna
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {/* Cards list (drop target) */}
      <div
        ref={setDropRef}
        className={`notion-scroll flex max-h-[calc(100vh-280px)] min-h-12 flex-1 flex-col gap-2 overflow-y-auto p-2 transition ${
          isOver ? 'bg-accent/40' : ''
        }`}
      >
        <SortableContext items={cardIds} strategy={verticalListSortingStrategy}>
          {visibleCards.map((card: Card) => (
            <CardItem
              key={card.id}
              card={card}
              dimmed={dimmedCardIds.has(card.id) && searchQuery.length > 0}
              workspace={workspace}
              onOpen={() => openCard(card.id)}
            />
          ))}
        </SortableContext>

        {cards.length === 0 && !adding && (
          <p className="px-2 py-4 text-center text-xs text-muted-foreground">
            Sin tarjetas
          </p>
        )}

        {adding && (
          <div className="rounded-md border border-dashed border-border p-2">
            <textarea
              ref={(el) => {
                inputRef.current = el
              }}
              autoFocus
              value={newCardTitle}
              onChange={(e) => setNewCardTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  handleAddCard()
                } else if (e.key === 'Escape') {
                  e.preventDefault()
                  setAdding(false)
                  setNewCardTitle('')
                }
              }}
              placeholder="Título de la tarjeta…"
              rows={2}
              className="w-full resize-none rounded-sm border border-border bg-background p-1.5 text-sm focus:outline-none"
            />
            <div className="mt-1 flex items-center justify-end gap-1">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setAdding(false)
                  setNewCardTitle('')
                }}
                className="h-7 text-xs"
              >
                Cancelar
              </Button>
              <Button
                size="sm"
                onClick={handleAddCard}
                disabled={!newCardTitle.trim()}
                className="h-7 text-xs"
              >
                Añadir
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Footer add button */}
      {!adding && (
        <button
          onClick={() => {
            setAdding(true)
            setTimeout(() => inputRef.current?.focus(), 0)
          }}
          className="flex items-center gap-1 px-2 py-1.5 text-left text-xs text-muted-foreground transition hover:bg-accent hover:text-foreground"
        >
          <Plus className="h-3.5 w-3.5" />
          Añadir tarjeta
        </button>
      )}
    </div>
  )
}
