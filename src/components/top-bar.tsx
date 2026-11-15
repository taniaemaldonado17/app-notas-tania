'use client'

import { useRef, useState } from 'react'
import { useTheme } from 'next-themes'
import { NotebookPen, Loader2, Image as ImageIcon, Edit3 } from 'lucide-react'
import { SearchBox } from '@/components/search-box'
import { UserMenu } from '@/components/user-menu'
import type { Page } from '@/lib/types'

type Props = {
  page: Page | null
}

export function TopBar({ page }: Props) {
  return (
    <header className="sticky top-0 z-30 flex h-12 items-center gap-3 border-b border-border bg-background/85 px-4 backdrop-blur">
      <div className="flex min-w-0 items-center gap-2">
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
          <NotebookPen className="h-4 w-4" />
        </div>
        <div className="hidden min-w-0 items-center gap-1 text-sm text-muted-foreground sm:flex">
          <span className="truncate font-medium text-foreground">
            {page?.title ?? 'Registro de tareas diarias'}
          </span>
        </div>
      </div>

      <div className="mx-auto flex-1 flex justify-center px-2">
        <SearchBox />
      </div>

      <UserMenu />
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
  const [editingIcon, setEditingIcon] = useState(false)
  const [iconDraft, setIconDraft] = useState(page?.icon ?? '')

  // keep drafts in sync when page changes externally
  if (!editingTitle && titleDraft !== (page?.title ?? '')) {
    setTitleDraft(page?.title ?? '')
  }
  if (!editingSubtitle && subtitleDraft !== (page?.subtitle ?? '')) {
    setSubtitleDraft(page?.subtitle ?? '')
  }
  if (!editingIcon && iconDraft !== (page?.icon ?? '')) {
    setIconDraft(page?.icon ?? '')
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
      {page?.coverUrl ? (
        <div className="relative h-48 w-full overflow-hidden sm:h-56">
          { }
          <img
            src={page.coverUrl}
            alt=""
            className="h-full w-full object-cover"
          />
          <button
            onClick={() => onCoverChange(null)}
            className="absolute right-3 top-3 rounded-md bg-black/40 px-2 py-1 text-xs text-white hover:bg-black/60"
          >
            Quitar portada
          </button>
        </div>
      ) : (
        <div className="cover-water relative h-48 w-full sm:h-56">
          <button
            onClick={() => fileInputRef.current?.click()}
            className="absolute right-3 top-3 flex items-center gap-1 rounded-md bg-black/40 px-2 py-1 text-xs text-white hover:bg-black/60"
            title="Cambiar portada"
          >
            <ImageIcon className="h-3 w-3" />
            Cambiar portada
          </button>
        </div>
      )}

      {/* Title section */}
      <div className="mx-auto max-w-5xl px-6 pb-6 pt-4">
        {/* Icon */}
        <div className="mb-2 flex items-center gap-2">
          {editingIcon ? (
            <div className="flex items-center gap-1">
              <input
                autoFocus
                value={iconDraft}
                onChange={(e) => setIconDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    setEditingIcon(false)
                    onIconChange(iconDraft.slice(0, 4))
                  } else if (e.key === 'Escape') {
                    setEditingIcon(false)
                    setIconDraft(page?.icon ?? '')
                  }
                }}
                placeholder="Emoji"
                className="w-20 rounded border border-border bg-background px-2 py-1 text-2xl focus:outline-none"
              />
              <button
                onClick={() => {
                  setEditingIcon(false)
                  onIconChange(iconDraft.slice(0, 4))
                }}
                className="rounded p-1 text-xs hover:bg-accent"
              >
                OK
              </button>
            </div>
          ) : (
            <button
              onClick={() => setEditingIcon(true)}
              className="rounded p-1 text-4xl leading-none hover:bg-accent"
              title="Cambiar ícono"
            >
              {page?.icon || '📓'}
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
