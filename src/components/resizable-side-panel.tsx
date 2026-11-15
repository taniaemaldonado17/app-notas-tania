'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { PanelRightClose, PanelRightOpen, X } from 'lucide-react'
import { cn } from '@/lib/utils'

const STORAGE_KEY = 'notas:panel-width'
const MIN_WIDTH = 320
const MAX_WIDTH_RATIO = 0.85 // 85% of viewport width
const DEFAULT_WIDTH = 480

// Margin around the panel (top, bottom, right) — gives the panel a "floating"
// look like Notion's right sidebar instead of being flush against the edges.
const PANEL_MARGIN = 16

type Props = {
  open: boolean
  onClose: () => void
  children: React.ReactNode
  /** Optional className applied to the panel content wrapper */
  className?: string
  /** Optional title shown in the header */
  title?: string
}

/**
 * Resizable side panel — slides in from the right.
 *
 * Features:
 * - Drag the left border to resize (persists to localStorage)
 * - Collapse button (top-right of the panel header) shrinks to a thin
 *   "expand" button on the right edge, so the user can bring it back
 *   without losing their place in the form
 * - Keyboard shortcut: Ctrl+\ toggles between open / collapsed
 * - Click on the backdrop closes the panel
 * - Width is constrained between MIN_WIDTH and (MAX_WIDTH_RATIO * viewport)
 * - Has a margin around it (PANEL_MARGIN) so it floats above the board
 *   instead of touching the window edges — Notion-style floating panel
 */
export function ResizableSidePanel({
  open,
  onClose,
  children,
  className,
  title,
}: Props) {
  const [width, setWidth] = useState(DEFAULT_WIDTH)
  const [collapsed, setCollapsed] = useState(false)
  const [isResizing, setIsResizing] = useState(false)
  const panelRef = useRef<HTMLDivElement | null>(null)
  const startXRef = useRef(0)
  const startWidthRef = useRef(0)

  // Load saved width on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) {
        const w = parseInt(saved, 10)
        if (!Number.isNaN(w) && w >= MIN_WIDTH) {
          setWidth(w)
        }
      }
    } catch {
      // ignore localStorage errors
    }
  }, [])

  // Clamp width on viewport resize — also account for the margin
  useEffect(() => {
    function onResize() {
      const max = Math.floor(window.innerWidth * MAX_WIDTH_RATIO) - PANEL_MARGIN * 2
      setWidth((w) => Math.min(w, max))
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  // Keyboard shortcut: Ctrl + \ toggles between open/collapsed
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.ctrlKey && (e.key === '\\' || e.code === 'Backslash')) {
        e.preventDefault()
        if (!open) return
        setCollapsed((c) => !c)
      }
      if (e.key === 'Escape' && open && !collapsed) {
        // Only close on Escape if not focused in a text input
        const target = e.target as HTMLElement
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return
        onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, collapsed, onClose])

  // Drag-to-resize handlers
  const onMouseDownResize = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      e.stopPropagation()
      setIsResizing(true)
      startXRef.current = e.clientX
      startWidthRef.current = width
      document.body.style.cursor = 'col-resize'
      document.body.style.userSelect = 'none'
    },
    [width]
  )

  useEffect(() => {
    if (!isResizing) return

    function onMouseMove(e: MouseEvent) {
      const delta = startXRef.current - e.clientX
      const max = Math.floor(window.innerWidth * MAX_WIDTH_RATIO) - PANEL_MARGIN * 2
      const next = Math.min(
        Math.max(startWidthRef.current + delta, MIN_WIDTH),
        max
      )
      setWidth(next)
    }
    function onMouseUp() {
      setIsResizing(false)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      try {
        localStorage.setItem(STORAGE_KEY, String(width))
      } catch {
        // ignore
      }
    }

    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
    return () => {
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
    }
  }, [isResizing, width])

  // Touch support for mobile
  const onTouchStartResize = useCallback(
    (e: React.TouchEvent) => {
      e.preventDefault()
      e.stopPropagation()
      setIsResizing(true)
      startXRef.current = e.touches[0].clientX
      startWidthRef.current = width
    },
    [width]
  )

  useEffect(() => {
    if (!isResizing) return

    function onTouchMove(e: TouchEvent) {
      const delta = startXRef.current - e.touches[0].clientX
      const max = Math.floor(window.innerWidth * MAX_WIDTH_RATIO) - PANEL_MARGIN * 2
      const next = Math.min(
        Math.max(startWidthRef.current + delta, MIN_WIDTH),
        max
      )
      setWidth(next)
    }
    function onTouchEnd() {
      setIsResizing(false)
      try {
        localStorage.setItem(STORAGE_KEY, String(width))
      } catch {
        // ignore
      }
    }

    document.addEventListener('touchmove', onTouchMove, { passive: false })
    document.addEventListener('touchend', onTouchEnd)
    return () => {
      document.removeEventListener('touchmove', onTouchMove)
      document.removeEventListener('touchend', onTouchEnd)
    }
  }, [isResizing, width])

  // ---- Render states ----

  // Closed state — render nothing (the trigger is the card click elsewhere)
  if (!open) return null

  // Collapsed state — thin vertical bar with margin, floating rounded
  if (collapsed) {
    return (
      <>
        {/* Backdrop still blocks board interaction */}
        <div
          className="fixed inset-0 z-40 bg-black/30"
          onClick={() => {
            setCollapsed(false)
            onClose()
          }}
        />
        <div
          className="fixed z-50 flex flex-col items-center justify-center gap-3 border border-border bg-card py-4 shadow-lg"
          style={{
            top: `${PANEL_MARGIN}px`,
            bottom: `${PANEL_MARGIN}px`,
            right: `${PANEL_MARGIN}px`,
            width: '40px',
            borderRadius: '12px',
          }}
          role="dialog"
          aria-label="Panel colapsado"
        >
          <button
            onClick={() => setCollapsed(false)}
            className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
            aria-label="Expandir panel"
            title="Expandir panel (Ctrl+\\)"
          >
            <PanelRightOpen className="h-4 w-4" />
          </button>
          <button
            onClick={() => {
              setCollapsed(false)
              onClose()
            }}
            className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
            aria-label="Cerrar panel"
            title="Cerrar panel"
          >
            <X className="h-4 w-4" />
          </button>
          {title && (
            <span
              className="select-none text-[10px] uppercase tracking-wider text-muted-foreground"
              style={{ writingMode: 'vertical-rl' }}
            >
              {title.slice(0, 30)}
              {title.length > 30 ? '…' : ''}
            </span>
          )}
        </div>
      </>
    )
  }

  // Expanded state — full panel with margin, rounded corners, resize handle on the left edge
  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/30 transition-opacity"
        onClick={onClose}
      />

      {/* Panel — floating with margin around it (top, bottom, right) */}
      <div
        ref={panelRef}
        className="fixed z-50 flex flex-col border border-border bg-background shadow-xl"
        style={{
          width: `${width}px`,
          top: `${PANEL_MARGIN}px`,
          bottom: `${PANEL_MARGIN}px`,
          right: `${PANEL_MARGIN}px`,
          borderRadius: '12px',
          overflow: 'hidden',
        }}
        role="dialog"
        aria-modal="true"
        aria-label={title ?? 'Detalle de la tarjeta'}
      >
        {/* Resize handle on the left edge */}
        <div
          onMouseDown={onMouseDownResize}
          onTouchStart={onTouchStartResize}
          className={cn(
            'group absolute inset-y-0 left-0 z-10 flex w-1.5 cursor-col-resize items-center justify-center',
            'hover:bg-primary/20',
            isResizing && 'bg-primary/40'
          )}
          title="Arrastrá para cambiar el tamaño"
          aria-label="Arrastrá para cambiar el tamaño"
        >
          {/* Visual grip indicator (appears on hover) */}
          <div
            className={cn(
              'flex h-12 w-1 flex-col items-center justify-center gap-0.5 rounded-full bg-border transition-opacity',
              'opacity-0 group-hover:opacity-100',
              isResizing && 'opacity-100'
            )}
          >
            <div className="h-1 w-1 rounded-full bg-muted-foreground" />
            <div className="h-1 w-1 rounded-full bg-muted-foreground" />
            <div className="h-1 w-1 rounded-full bg-muted-foreground" />
          </div>
        </div>

        {/* Collapse button — top-right corner */}
        <button
          onClick={() => setCollapsed(true)}
          className="absolute right-3 top-3 z-10 flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
          aria-label="Colapsar panel"
          title="Colapsar panel (Ctrl+\\)"
        >
          <PanelRightClose className="h-4 w-4" />
        </button>

        {/* Content */}
        <div className={cn('flex h-full flex-col overflow-hidden', className)}>
          {children}
        </div>
      </div>
    </>
  )
}
