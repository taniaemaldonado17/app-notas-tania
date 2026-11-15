'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Check, Maximize2, PanelRight, PanelRightClose, PanelRightOpen, SquareSplitVertical, X } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'

const STORAGE_KEY = 'notas:panel-width'
const MODE_KEY = 'notas:panel-mode'

/** How the detail opens, like Notion's "side peek / center peek / full page". */
export type PanelMode = 'side' | 'center' | 'full'
const MODES: { id: PanelMode; label: string; icon: typeof PanelRight }[] = [
  { id: 'side', label: 'Panel lateral', icon: PanelRight },
  { id: 'center', label: 'Tarjeta centrada', icon: SquareSplitVertical },
  { id: 'full', label: 'Pantalla completa', icon: Maximize2 },
]
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
  const [mode, setModeState] = useState<PanelMode>('side')
  const [isResizing, setIsResizing] = useState(false)

  useEffect(() => {
    try {
      const saved = localStorage.getItem(MODE_KEY)
      if (saved === 'side' || saved === 'center' || saved === 'full') setModeState(saved)
    } catch {
      // ignore
    }
  }, [])

  const setMode = (m: PanelMode) => {
    setModeState(m)
    setCollapsed(false)
    try {
      localStorage.setItem(MODE_KEY, m)
    } catch {
      // ignore
    }
  }
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
        if (!open || mode !== 'side') return
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
  }, [open, collapsed, onClose, mode])

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

      {/* Panel — side: floating on the right; center: card in the middle; full: whole window */}
      <div
        ref={panelRef}
        className="fixed z-50 flex flex-col border border-border bg-background shadow-xl"
        style={
          mode === 'full'
            ? { inset: 0, borderRadius: 0, overflow: 'hidden', borderWidth: 0 }
            : mode === 'center'
              ? {
                  width: 'min(960px, calc(100vw - 32px))',
                  top: '5vh',
                  bottom: '5vh',
                  left: '50%',
                  transform: 'translateX(-50%)',
                  borderRadius: '12px',
                  overflow: 'hidden',
                }
              : {
                  width: `${width}px`,
                  maxWidth: `calc(100vw - ${PANEL_MARGIN * 2}px)`,
                  top: `${PANEL_MARGIN}px`,
                  bottom: `${PANEL_MARGIN}px`,
                  right: `${PANEL_MARGIN}px`,
                  borderRadius: '12px',
                  overflow: 'hidden',
                }
        }
        role="dialog"
        aria-modal="true"
        aria-label={title ?? 'Detalle de la tarjeta'}
        data-panel-mode={mode}
      >
        {/* Resize handle on the left edge (side mode only) */}
        {mode === 'side' && (
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
        )}

        {/* View mode + collapse — top-right corner */}
        <div className="absolute right-3 top-3 z-30 flex items-center gap-0.5">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
                aria-label="Cambiar cómo se abre"
                title="Ver como…"
              >
                {(() => {
                  const Icon = MODES.find((m) => m.id === mode)!.icon
                  return <Icon className="h-4 w-4" />
                })()}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="z-[70] w-52">
              <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">Ver como</DropdownMenuLabel>
              {MODES.map((m) => (
                <DropdownMenuItem key={m.id} onClick={() => setMode(m.id)}>
                  <m.icon className="h-4 w-4" />
                  {m.label}
                  {mode === m.id && <Check className="ml-auto h-3.5 w-3.5" />}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          {mode === 'side' && (
            <button
              onClick={() => setCollapsed(true)}
              className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
              aria-label="Colapsar panel"
              title="Colapsar panel (Ctrl+\\)"
            >
              <PanelRightClose className="h-4 w-4" />
            </button>
          )}
          {mode !== 'side' && (
            <button
              onClick={onClose}
              className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
              aria-label="Cerrar"
              title="Cerrar (Esc)"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Content */}
        <div className={cn('flex h-full flex-col overflow-hidden', className)}>
          {children}
        </div>
      </div>
    </>
  )
}
