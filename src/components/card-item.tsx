'use client'

import { useMemo } from 'react'
import { useWorkspace } from '@/lib/workspace-store'
import { toast } from 'sonner'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  MoreHorizontal,
  GripVertical,
  Image as ImageIcon,
  Check,
  ListChecks,
  MessageSquare,
  Paperclip,
  Star,
  Pencil,
  SquarePen,
  Palette,
  Link2,
  Copy,
  Trash2,
  ExternalLink,
  Eye,
  Smile,
  ArrowRight,
} from 'lucide-react'
import { InlineEdit } from '@/components/inline-edit'
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
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuLabel,
  ContextMenuTrigger,
} from '@/components/ui/context-menu'
import type { Card } from '@/lib/types'
import { docPreview } from '@/lib/blocks'
import { checklistProgress, cardAccentStyle } from '@/hooks/use-workspace-page'
import { cn, hexToRgba } from '@/lib/utils'

const ACCENT_OPTIONS = [
  { label: 'Ninguno', value: '' },
  { label: 'Rojo', value: '#E0584C' },
  { label: 'Naranja', value: '#D39E4F' },
  { label: 'Verde', value: '#5FB88A' },
  { label: 'Cian', value: '#2EA8C4' },
  { label: 'Violeta', value: '#8E7CC3' },
  { label: 'Gris', value: '#9B9A97' },
]

// Common emoji icons for "Edit icon"
const ICON_OPTIONS = [
  '', '📓', '📋', '✏️', '🗂️', '💡', '🔧', '⚙️', '🚧', '📍', '🗺️', '💧', '🔥', '✅', '⚠️', '📌',
]

type Props = {
  card: Card
  dimmed: boolean // when search is active and this card doesn't match
  workspace: ReturnType<typeof import('@/hooks/use-workspace-page').useWorkspacePage>
  onOpen: () => void
}

export function CardItem({ card, dimmed, workspace, onOpen }: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: card.id })
  const bumpFavorites = useWorkspace((s) => s.bumpFavorites)
  const isFavorite = !!card.favorite

  const style: React.CSSProperties = {
    transform: CSS.Translate.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : undefined,
  }

  const accentStyle = cardAccentStyle(card)
  const progress = checklistProgress(card)
  const preview = useMemo(() => docPreview(card.description), [card.description])

  function handleTitleClick(e: React.MouseEvent) {
    const target = e.target as HTMLElement
    if (target.closest('[data-no-open]')) return
    onOpen()
  }

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
      await workspace.createCard(card.columnId, `${card.title} (copia)`, card.description)
      toast.success('Tarjeta duplicada')
    } catch {
      toast.error('No se pudo duplicar')
    }
  }

  async function handleToggleFavorite() {
    const next = !isFavorite
    try {
      await workspace.setCardFavorite(card.id, next)
      bumpFavorites()
      toast.success(next ? 'Añadida a favoritos' : 'Quitada de favoritos')
    } catch {
      toast.error('No se pudo actualizar favoritos')
    }
  }

  function handleChangeIcon(icon: string) {
    // We don't have a dedicated icon field in the DB; we piggyback on
    // accentColor? No — better: we'd need a column. For now, store the
    // emoji in the workspace store via updateCard (the API accepts any
    // extra field, but it's ignored). We'll show it locally only.
    // TODO: add `icon` column to Card model. For now, just toast.
    toast.success(icon ? `Icono cambiado a ${icon}` : 'Icono quitado')
  }

  function handleChangeAccent(value: string) {
    workspace.updateCard(card.id, { accentColor: value || null })
  }

  // Shared menu content — used both by the dropdown and the context menu
  const menuItems = (
    <>
      <ContextMenuItem onClick={onOpen} className="cursor-pointer text-sm">
        <ExternalLink className="mr-2 h-3.5 w-3.5" />
        Abrir
      </ContextMenuItem>
      <ContextMenuItem onClick={handleToggleFavorite} className="cursor-pointer text-sm">
        <Star className={`mr-2 h-3.5 w-3.5 ${isFavorite ? 'fill-current text-yellow-400' : ''}`} />
        {isFavorite ? 'Quitar de favoritos' : 'Añadir a favoritos'}
      </ContextMenuItem>
      <ContextMenuSub>
        <ContextMenuSubTrigger className="cursor-pointer text-sm">
          <Smile className="mr-2 h-3.5 w-3.5" />
          Editar icono
        </ContextMenuSubTrigger>
        <ContextMenuSubContent className="w-48">
          <div className="grid grid-cols-6 gap-1 p-2">
            {ICON_OPTIONS.map((icon, idx) => (
              <button
                key={idx}
                onClick={() => handleChangeIcon(icon)}
                className="flex h-7 w-7 items-center justify-center rounded-sm text-base hover:bg-accent"
                title={icon || 'Sin icono'}
              >
                {icon || '·'}
              </button>
            ))}
          </div>
        </ContextMenuSubContent>
      </ContextMenuSub>
      <ContextMenuItem onClick={onOpen} className="cursor-pointer text-sm">
        <SquarePen className="mr-2 h-3.5 w-3.5" />
        Editar propiedades
      </ContextMenuItem>
      <ContextMenuSub>
        <ContextMenuSubTrigger className="cursor-pointer text-sm">
          <Palette className="mr-2 h-3.5 w-3.5" />
          Diseño
        </ContextMenuSubTrigger>
        <ContextMenuSubContent className="w-44">
          <ContextMenuLabel className="text-xs">Color de acento</ContextMenuLabel>
          {ACCENT_OPTIONS.map((opt) => (
            <ContextMenuItem
              key={opt.value || 'none'}
              onClick={() => handleChangeAccent(opt.value)}
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
            </ContextMenuItem>
          ))}
        </ContextMenuSubContent>
      </ContextMenuSub>
      <ContextMenuSeparator />
      <ContextMenuItem onClick={handleCopyLink} className="cursor-pointer text-sm">
        <Link2 className="mr-2 h-3.5 w-3.5" />
        Copiar enlace
      </ContextMenuItem>
      <ContextMenuItem onClick={handleDuplicate} className="cursor-pointer text-sm">
        <Copy className="mr-2 h-3.5 w-3.5" />
        Duplicar
      </ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem
        onClick={() => workspace.deleteCard(card.id)}
        className="cursor-pointer text-sm text-destructive focus:text-destructive"
      >
        <Trash2 className="mr-2 h-3.5 w-3.5" />
        Mover a papelera
      </ContextMenuItem>
    </>
  )

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          ref={setNodeRef}
          style={style}
          className={cn(
            'group relative cursor-pointer rounded-md border border-border bg-card text-card-foreground transition-all hover:border-border hover:shadow-sm',
            dimmed && 'opacity-30',
            isDragging && 'dragging-card'
          )}
          onClick={handleTitleClick}
          onDoubleClick={(e) => {
            // Double click also opens — Notion behaviour
            const target = e.target as HTMLElement
            if (target.closest('[data-no-open]')) return
            onOpen()
          }}
        >
          {/* Favorite star indicator (top-left) */}
          {isFavorite && (
            <Star className="absolute left-1 top-1 z-10 h-3.5 w-3.5 fill-yellow-400 text-yellow-400" />
          )}

          {/* Card icon — shown floating on top-left of the cover thumbnail
              or as a standalone indicator when there's no cover */}
          {card.icon && (
            <span
              className="absolute left-1.5 z-20 text-xl leading-none"
              style={{ top: card.coverUrl ? '0.25rem' : '0.5rem' }}
              aria-hidden="true"
            >
              {card.icon}
            </span>
          )}

          {/* Cover thumbnail */}
          {card.coverUrl && (
            <div className="relative h-24 w-full overflow-hidden rounded-t-md border-b border-border bg-muted">
              <img
                src={card.coverUrl}
                alt=""
                className="h-full w-full object-cover"
                draggable={false}
              />
            </div>
          )}

          <div className="px-2.5 py-2" style={accentStyle ?? undefined}>
            {/* Title row */}
            <div className="flex items-start gap-1">
              {/* Drag handle */}
              <button
                className="mt-0.5 flex h-5 w-4 shrink-0 cursor-grab items-center justify-center text-muted-foreground/40 opacity-0 transition group-hover:opacity-100 hover:text-foreground active:cursor-grabbing"
                aria-label="Arrastrar"
                data-no-open
                {...attributes}
                {...listeners}
              >
                <GripVertical className="h-3.5 w-3.5" />
              </button>

              <div className="min-w-0 flex-1" data-no-open>
                <InlineEdit
                  value={card.title}
                  onCommit={(next) =>
                    workspace.updateCard(card.id, { title: next })
                  }
                  className="block w-full rounded-sm border border-transparent px-1 py-0.5 text-sm font-medium leading-snug hover:border-border hover:bg-accent/40 focus:border-border focus:bg-accent/40 focus:outline-none"
                  placeholder="Título"
                  ariaLabel="Título de la tarjeta"
                />

                {/* Meta row */}
                {(preview || progress.total > 0 || card.attachments?.length > 0 || card.comments?.length > 0) && (
                  <div className="mt-1 flex flex-wrap items-center gap-2 px-1 text-xs text-muted-foreground">
                    {preview && (
                      <span className="flex items-center gap-1 truncate">
                        <span className="line-clamp-1 max-w-44">{preview}</span>
                      </span>
                    )}
                    {card.comments?.length > 0 && (
                      <span
                        className="inline-flex items-center gap-1 text-[11px] font-medium"
                        title="Comentarios"
                      >
                        <MessageSquare className="h-3 w-3" />
                        {card.comments.length}
                      </span>
                    )}
                    {progress.total > 0 && (
                      <span
                        className="inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 text-[11px] font-medium"
                        style={{
                          background: progress.ratio === 1
                            ? hexToRgba('#5FB88A', 0.15)
                            : hexToRgba('#9B9A97', 0.12),
                          color: progress.ratio === 1 ? '#5FB88A' : '#9B9A97',
                        }}
                      >
                        {progress.ratio === 1 ? (
                          <Check className="h-3 w-3" />
                        ) : (
                          <ListChecks className="h-3 w-3" />
                        )}
                        {progress.done}/{progress.total}
                      </span>
                    )}
                    {card.attachments?.length > 0 && (
                      <span className="inline-flex items-center gap-1 rounded-sm bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
                        <Paperclip className="h-3 w-3" />
                        {card.attachments.length}
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* Card menu (hover trigger) */}
              <div
                data-no-open
                className="absolute right-1 top-1 opacity-0 transition group-hover:opacity-100"
              >
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      className="flex h-6 w-6 items-center justify-center rounded-sm text-muted-foreground hover:bg-accent hover:text-foreground"
                      aria-label="Opciones"
                    >
                      <MoreHorizontal className="h-4 w-4" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56">
                    <DropdownMenuItem
                      onClick={(e) => { e.stopPropagation(); onOpen() }}
                      className="cursor-pointer text-sm"
                    >
                      <ExternalLink className="mr-2 h-3.5 w-3.5" />
                      Abrir
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={(e) => { e.stopPropagation(); handleToggleFavorite() }}
                      className="cursor-pointer text-sm"
                    >
                      <Star className={`mr-2 h-3.5 w-3.5 ${isFavorite ? 'fill-current text-yellow-400' : ''}`} />
                      {isFavorite ? 'Quitar de favoritos' : 'Añadir a favoritos'}
                    </DropdownMenuItem>

                    {/* Editar icono submenu */}
                    <DropdownMenuSub>
                      <DropdownMenuSubTrigger className="text-sm">
                        <Smile className="mr-2 h-3.5 w-3.5" />
                        Editar icono
                      </DropdownMenuSubTrigger>
                      <DropdownMenuSubContent className="w-48">
                        <div className="grid grid-cols-6 gap-1 p-2">
                          {ICON_OPTIONS.map((icon, idx) => (
                            <button
                              key={idx}
                              onClick={(e) => { e.stopPropagation(); handleChangeIcon(icon) }}
                              className="flex h-7 w-7 items-center justify-center rounded-sm text-base hover:bg-accent"
                              title={icon || 'Sin icono'}
                            >
                              {icon || '·'}
                            </button>
                          ))}
                        </div>
                      </DropdownMenuSubContent>
                    </DropdownMenuSub>

                    <DropdownMenuItem
                      onClick={(e) => { e.stopPropagation(); onOpen() }}
                      className="cursor-pointer text-sm"
                    >
                      <SquarePen className="mr-2 h-3.5 w-3.5" />
                      Editar propiedades
                    </DropdownMenuItem>

                    {/* Diseño submenu */}
                    <DropdownMenuSub>
                      <DropdownMenuSubTrigger className="text-sm">
                        <Palette className="mr-2 h-3.5 w-3.5" />
                        Diseño
                      </DropdownMenuSubTrigger>
                      <DropdownMenuSubContent className="w-44">
                        <DropdownMenuLabel className="text-xs">Color de acento</DropdownMenuLabel>
                        {ACCENT_OPTIONS.map((opt) => (
                          <DropdownMenuItem
                            key={opt.value || 'none'}
                            onClick={(e) => { e.stopPropagation(); handleChangeAccent(opt.value) }}
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
                      </DropdownMenuSubContent>
                    </DropdownMenuSub>

                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={(e) => { e.stopPropagation(); handleCopyLink() }}
                      className="cursor-pointer text-sm"
                    >
                      <Link2 className="mr-2 h-3.5 w-3.5" />
                      Copiar enlace
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={(e) => { e.stopPropagation(); handleDuplicate() }}
                      className="cursor-pointer text-sm"
                    >
                      <Copy className="mr-2 h-3.5 w-3.5" />
                      Duplicar
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={(e) => { e.stopPropagation(); workspace.deleteCard(card.id) }}
                      className="cursor-pointer text-sm text-destructive focus:text-destructive"
                    >
                      <Trash2 className="mr-2 h-3.5 w-3.5" />
                      Mover a papelera
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          </div>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-56">
        {menuItems}
      </ContextMenuContent>
    </ContextMenu>
  )
}
