'use client'

import { useRef, useState } from 'react'
import { useTheme } from 'next-themes'
import { NotebookPen, Loader2, Image as ImageIcon, Edit3, Menu, Share2, Users, X } from 'lucide-react'
import { useWorkspace } from '@/lib/workspace-store'
import { SearchBox } from '@/components/search-box'
import { UserMenu } from '@/components/user-menu'
import { EmojiPicker } from '@/components/emoji-picker'
import { cn } from '@/lib/utils'
import type { Page } from '@/lib/types'

/** Stored in Page.coverUrl when the user removed the cover entirely. */
export const NO_COVER = 'none'

type Props = {
  page: Page | null
  /** Number of people the page is shared with (0 = private). */
  memberCount?: number
  onShare?: () => void
  /** Show the "filter cards of this page" box (Kanban pages only). */
  showFilter?: boolean
}

export function TopBar({ page, memberCount = 0, onShare, showFilter = true }: Props) {
  const sidebarOpen = useWorkspace((s) => s.sidebarOpen)
  const setSidebarOpen = useWorkspace((s) => s.setSidebarOpen)

  return (
    // Floats over the content (negative bottom margin) so the cover and the
    // page scroll *under* the glass pills, like iPadOS toolbars.
    <header className="glass-toolbar pointer-events-none sticky top-0 z-30 -mb-14 flex h-14 items-center gap-3 px-3">
      <div className="glass pointer-events-auto flex h-10 min-w-0 items-center gap-1.5 rounded-full px-2 sm:pr-4">
        {/* Always visible on phones; on desktop only when the sidebar is hidden */}
        <button
          type="button"
          onClick={() => setSidebarOpen(true)}
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground ${
            sidebarOpen ? 'md:hidden' : ''
          }`}
          aria-label="Abrir barra lateral"
          title="Abrir barra lateral (Ctrl+\)"
        >
          <Menu className="h-4 w-4" />
        </button>
        <div className="hidden min-w-0 items-center gap-1.5 pl-1 text-sm sm:flex">
          <span className="shrink-0 text-base leading-none">
            {page?.icon || <NotebookPen className="h-4 w-4 text-muted-foreground" />}
          </span>
          <span className="truncate font-medium text-foreground">
            {page?.title ?? ''}
          </span>
        </div>
      </div>

      <div className="mx-auto flex flex-1 justify-center px-2">
        {showFilter && (
          <div className="glass pointer-events-auto rounded-full">
            <SearchBox />
          </div>
        )}
      </div>

      <div className="glass pointer-events-auto flex h-10 shrink-0 items-center gap-0.5 rounded-full px-1.5">
        {page && onShare && (
          <button
            type="button"
            onClick={onShare}
            className="flex h-8 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
            title="Compartir esta página"
          >
            {memberCount > 0 ? <Users className="h-4 w-4" /> : <Share2 className="h-4 w-4" />}
            <span className="hidden sm:inline">Compartir</span>
            {memberCount > 0 && (
              <span className="rounded-full bg-muted px-1.5 text-[11px] tabular-nums">{memberCount + 1}</span>
            )}
          </button>
        )}
        <UserMenu />
      </div>
    </header>
  )
}

export function CoverBanner({
  page,
  onCoverChange,
  onTitleChange,
  onSubtitleChange,
  onIconChange,
  loading,
}: {
  page: Page | null
  onCoverChange: (url: string | null) => Promise<void>
  onTitleChange: (next: string) => Promise<void>
  onSubtitleChange: (next: string) => Promise<void>
  onIconChange: (next: string) => Promise<void>
  loading?: boolean
}) {
  const { theme } = useTheme()
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState(page?.title ?? '')
  const [editingSubtitle, setEditingSubtitle] = useState(false)
  const [subtitleDraft, setSubtitleDraft] = useState(page?.subtitle ?? '')
  const coverHidden = page?.coverUrl === NO_COVER

  // keep drafts in sync when page changes externally
  if (!editingTitle && titleDraft !== (page?.title ?? '')) {
    setTitleDraft(page?.title ?? '')
  }
  if (!editingSubtitle && subtitleDraft !== (page?.subtitle ?? '')) {
    setSubtitleDraft(page?.subtitle ?? '')
  }

  async function handleCoverFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const formData = new FormData()
    formData.append('file', file)
    try {
      const res = await fetch('/api/upload', { method: 'POST', body: formData })
      if (!res.ok) throw new Error('upload failed')
      const data = await res.json()
      await onCoverChange(data.url)
    } catch {
      // ignore
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  return (
    <div className="relative">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleCoverFile}
        className="hidden"
      />
      {coverHidden ? null : (
        <div className={cn('group/cover relative h-48 w-full overflow-hidden sm:h-56', !page?.coverUrl && 'cover-water')}>
          {page?.coverUrl && <img src={page.coverUrl} alt="" className="h-full w-full object-cover" />}
          <div className="absolute bottom-3 right-3 flex gap-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover/cover:opacity-100 [@media(hover:none)]:opacity-100">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-1 rounded-md bg-black/45 px-2 py-1 text-xs text-white backdrop-blur hover:bg-black/65"
            >
              <ImageIcon className="h-3 w-3" />
              Cambiar portada
            </button>
            <button
              onClick={() => onCoverChange(NO_COVER)}
              className="flex items-center gap-1 rounded-md bg-black/45 px-2 py-1 text-xs text-white backdrop-blur hover:bg-black/65"
            >
              <X className="h-3 w-3" />
              Quitar portada
            </button>
          </div>
        </div>
      )}

      {/* Title section */}
      <div className={cn('group/title mx-auto max-w-5xl px-6 pb-6', coverHidden ? 'pt-20' : 'pt-4')}>
        {/* Icon + "add cover" when there is none */}
        <div className="mb-2 flex items-center gap-2">
          <EmojiPicker onSelect={(e) => onIconChange(e)} onRemove={() => onIconChange('')}>
            <button className="rounded-lg p-1 text-4xl leading-none hover:bg-accent" title="Cambiar ícono">
              {page?.icon || '📓'}
            </button>
          </EmojiPicker>
          {coverHidden && (
            <button
              onClick={() => onCoverChange(null)}
              className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground opacity-0 transition-opacity hover:bg-accent hover:text-foreground focus-visible:opacity-100 group-hover/title:opacity-100 [@media(hover:none)]:opacity-100"
            >
              <ImageIcon className="h-3.5 w-3.5" />
              Añadir portada
            </button>
          )}
        </div>

        {/* Title */}
        {editingTitle ? (
          <textarea
            autoFocus
            value={titleDraft}
            onChange={(e) => setTitleDraft(e.target.value)}
            onBlur={() => {
              setEditingTitle(false)
              if (titleDraft.trim() && titleDraft !== page?.title) {
                onTitleChange(titleDraft.trim())
              } else {
                setTitleDraft(page?.title ?? '')
              }
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                ;(e.currentTarget as HTMLTextAreaElement).blur()
              } else if (e.key === 'Escape') {
                e.preventDefault()
                setTitleDraft(page?.title ?? '')
                setEditingTitle(false)
              }
            }}
            rows={1}
            className="w-full resize-none rounded-md border border-border bg-background px-2 py-1 text-3xl font-bold leading-tight focus:outline-none"
          />
        ) : (
          <div className="flex items-center gap-2">
            <h1
              onClick={() => setEditingTitle(true)}
              className="cursor-text rounded-md px-2 py-1 text-3xl font-bold leading-tight hover:bg-accent/40"
              title="Click para editar"
            >
              {page?.title ?? 'Registro de tareas diarias'}
            </h1>
            <button
              onClick={() => setEditingTitle(true)}
              className="rounded p-1 text-muted-foreground opacity-0 transition hover:bg-accent hover:text-foreground [h1:hover+&]:opacity-100"
              aria-label="Editar título"
            >
              <Edit3 className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* Subtitle */}
        {editingSubtitle ? (
          <textarea
            autoFocus
            value={subtitleDraft}
            onChange={(e) => setSubtitleDraft(e.target.value)}
            onBlur={() => {
              setEditingSubtitle(false)
              if (subtitleDraft !== (page?.subtitle ?? '')) {
                onSubtitleChange(subtitleDraft)
              }
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                ;(e.currentTarget as HTMLTextAreaElement).blur()
              } else if (e.key === 'Escape') {
                e.preventDefault()
                setSubtitleDraft(page?.subtitle ?? '')
                setEditingSubtitle(false)
              }
            }}
            rows={2}
            className="mt-1 w-full resize-none rounded-md border border-border bg-background px-2 py-1 text-xs text-muted-foreground focus:outline-none"
          />
        ) : (
          <p
            onClick={() => setEditingSubtitle(true)}
            className="mt-1 cursor-text rounded px-2 py-0.5 text-xs leading-relaxed text-muted-foreground hover:bg-accent/40"
          >
            {page?.subtitle || 'Haga clic para añadir un subtítulo…'}
          </p>
        )}

        {loading && (
          <span className="mt-2 inline-flex items-center gap-1 text-[11px] text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" />
            Guardando…
          </span>
        )}
      </div>
    </div>
  )
}
