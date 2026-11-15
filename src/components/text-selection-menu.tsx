'use client'

import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import {
  Check,
  Loader2,
  Sparkles,
  Wand2,
  BookOpen,
  Pencil,
  X,
  ArrowRight,
  Code,
  Quote,
  List,
  Heading1,
  Heading2,
  Heading3,
  Pilcrow,
  CheckSquare,
  ChevronDown,
  Type,
} from 'lucide-react'
import { aiText, type AiAction } from '@/lib/api'
import type { BlockType } from '@/lib/blocks'

type Props = {
  /** Currently selected text (window.getSelection().toString()). */
  selectedText: string
  /** Bounding rect of the current selection (from getRangeAt(0).getBoundingClientRect()). */
  rect: DOMRect | null
  /** Called when the AI returns a transformed text and the user accepts it. */
  onReplace: (original: string, next: string) => void
  /** Called when the user wants to convert the selected block to a different type. */
  onConvertBlockType: (type: BlockType) => void
  /** Called when the user closes the menu without an action. */
  onClose: () => void
  /** The container inside which the menu should position itself. */
  containerRef: React.RefObject<HTMLElement | null>
}

const ACTIONS: { id: AiAction; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'review', label: 'Revisar', icon: Check },
  { id: 'reformat', label: 'Reformatear', icon: Wand2 },
  { id: 'explain', label: 'Explicar', icon: BookOpen },
  { id: 'edit', label: 'Editar con IA', icon: Pencil },
]

const CONVERT_OPTIONS: {
  type: BlockType
  label: string
  icon: React.ComponentType<{ className?: string }>
  shortcut?: string
}[] = [
  { type: 'paragraph', label: 'Texto', icon: Pilcrow },
  { type: 'h1', label: 'Encabezado 1', icon: Heading1 },
  { type: 'h2', label: 'Encabezado 2', icon: Heading2 },
  { type: 'h3', label: 'Encabezado 3', icon: Heading3 },
  { type: 'list', label: 'Lista', icon: List },
  { type: 'todo', label: 'Tarea', icon: CheckSquare },
  { type: 'code', label: 'Código', icon: Code },
  { type: 'quote', label: 'Cita', icon: Quote },
]

/**
 * Floating menu that appears when the user selects text inside the block editor.
 *
 * Two groups of actions:
 * 1. **Convertir en** — converts the block that contains the selection to a
 *    different type (paragraph, h1, h2, h3, list, todo, code, quote).
 *    Opens as a dropdown submenu.
 * 2. **AI actions** — Revisar, Reformatear, Explicar, Editar con IA.
 *    Same as before.
 */
export function TextSelectionMenu({
  selectedText,
  rect,
  onReplace,
  onConvertBlockType,
  onClose,
  containerRef,
}: Props) {
  const [pendingAction, setPendingAction] = useState<AiAction | null>(null)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<string | null>(null)
  const [instruction, setInstruction] = useState('')
  const [showInstructionInput, setShowInstructionInput] = useState(false)
  const [showConvertMenu, setShowConvertMenu] = useState(false)

  // Position the menu above (or below) the selection rect, clamped to the container.
  const [pos, setPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 })

  useEffect(() => {
    if (!rect || !containerRef.current) return
    const containerRect = containerRef.current.getBoundingClientRect()
    const menuWidth = showInstructionInput ? 360 : showConvertMenu ? 200 : result ? 360 : 360
    const menuHeight = showInstructionInput ? 180 : showConvertMenu ? 320 : result ? 320 : 44

    // Default: above the selection
    let top = rect.top - containerRect.top - menuHeight - 8
    if (top < 8) {
      // Not enough room above — put it below
      top = rect.bottom - containerRect.top + 8
    }
    // Clamp left within container
    let left = rect.left - containerRect.left + rect.width / 2 - menuWidth / 2
    left = Math.max(8, Math.min(left, containerRect.width - menuWidth - 8))

    setPos({ top, left })
  }, [rect, containerRef, showInstructionInput, result, showConvertMenu])

  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        if (result !== null) {
          setResult(null)
          setPendingAction(null)
        } else if (showInstructionInput) {
          setShowInstructionInput(false)
          setInstruction('')
        } else if (showConvertMenu) {
          setShowConvertMenu(false)
        } else {
          onClose()
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, result, showInstructionInput, showConvertMenu])

  async function runAction(action: AiAction, instructionArg?: string) {
    setLoading(true)
    setPendingAction(action)
    try {
      const out = await aiText(action, selectedText, instructionArg)
      setResult(out)
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'No se pudo procesar con IA'
      )
      onClose()
    } finally {
      setLoading(false)
    }
  }

  function handlePick(action: AiAction) {
    if (action === 'edit') {
      setShowInstructionInput(true)
      return
    }
    runAction(action)
  }

  function handleConfirmEdit() {
    const inst = instruction.trim()
    if (!inst) return
    setShowInstructionInput(false)
    runAction('edit', inst)
  }

  function handleAccept() {
    if (result !== null && pendingAction !== null) {
      // For "explain" we don't replace — it's informational
      if (pendingAction === 'explain') {
        setResult(null)
        setPendingAction(null)
        onClose()
        return
      }
      onReplace(selectedText, result)
      setResult(null)
      setPendingAction(null)
      onClose()
    }
  }

  function handleDiscard() {
    setResult(null)
    setPendingAction(null)
    setShowInstructionInput(false)
    setInstruction('')
  }

  function handleConvert(type: BlockType) {
    onConvertBlockType(type)
    setShowConvertMenu(false)
    onClose()
  }

  // ---- Render states ----

  if (loading) {
    return (
      <div
        className="absolute z-50 flex items-center gap-2 rounded-md border border-border bg-popover px-3 py-2 text-xs shadow-lg"
        style={{ top: pos.top, left: pos.left }}
      >
        <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
        <span className="text-muted-foreground">Procesando con IA…</span>
      </div>
    )
  }

  if (result !== null && pendingAction) {
    const isExplanation = pendingAction === 'explain'
    return (
      <div
        className="absolute z-50 w-[360px] max-w-[90vw] rounded-md border border-border bg-popover shadow-xl"
        style={{ top: pos.top, left: pos.left }}
      >
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <div className="flex items-center gap-2 text-xs font-medium">
            <Sparkles className="h-3.5 w-3.5" />
            {isExplanation ? 'Explicación' : 'Resultado'}
          </div>
          <button
            type="button"
            onClick={handleDiscard}
            className="rounded-sm p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
            aria-label="Cerrar"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="max-h-64 overflow-y-auto p-3 text-sm leading-relaxed notion-scroll">
          {isExplanation ? (
            <div className="prose prose-sm dark:prose-invert max-w-none whitespace-pre-wrap">
              {result}
            </div>
          ) : (
            <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed">
              {result}
            </pre>
          )}
        </div>
        <div className="flex justify-end gap-1 border-t border-border px-3 py-2">
          {isExplanation ? (
            <button
              type="button"
              onClick={handleAccept}
              className="rounded-sm bg-foreground px-3 py-1 text-xs text-background hover:opacity-90"
            >
              Cerrar
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={handleDiscard}
                className="rounded-sm px-3 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                Descartar
              </button>
              <button
                type="button"
                onClick={handleAccept}
                className="flex items-center gap-1 rounded-sm bg-foreground px-3 py-1 text-xs text-background hover:opacity-90"
              >
                <ArrowRight className="h-3 w-3" />
                Reemplazar
              </button>
            </>
          )}
        </div>
      </div>
    )
  }

  if (showInstructionInput) {
    return (
      <div
        className="absolute z-50 w-[360px] max-w-[90vw] rounded-md border border-border bg-popover shadow-xl"
        style={{ top: pos.top, left: pos.left }}
      >
        <div className="flex items-center gap-2 border-b border-border px-3 py-2 text-xs font-medium">
          <Pencil className="h-3.5 w-3.5" />
          Editar con IA
        </div>
        <div className="p-3">
          <textarea
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            placeholder="Ej: acortar a la mitad, traducir al inglés, hacerlo más formal…"
            className="notion-scroll min-h-16 w-full resize-none bg-transparent text-sm outline-none"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                handleConfirmEdit()
              } else if (e.key === 'Escape') {
                setShowInstructionInput(false)
                setInstruction('')
              }
            }}
          />
        </div>
        <div className="flex justify-end gap-1 border-t border-border px-3 py-2">
          <button
            type="button"
            onClick={handleDiscard}
            className="rounded-sm px-3 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleConfirmEdit}
            disabled={!instruction.trim()}
            className="flex items-center gap-1 rounded-sm bg-foreground px-3 py-1 text-xs text-background disabled:opacity-40"
          >
            <Sparkles className="h-3 w-3" />
            Aplicar
          </button>
        </div>
      </div>
    )
  }

  // Convert menu (submenu) — shows when user clicked "Convertir en"
  if (showConvertMenu) {
    return (
      <div
        className="absolute z-50 w-48 rounded-md border border-border bg-popover shadow-xl"
        style={{ top: pos.top, left: pos.left }}
      >
        <div className="flex items-center justify-between border-b border-border px-3 py-2 text-xs font-medium">
          <div className="flex items-center gap-2">
            <Type className="h-3.5 w-3.5" />
            Convertir en
          </div>
          <button
            type="button"
            onClick={() => setShowConvertMenu(false)}
            className="rounded-sm p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
            aria-label="Volver"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
        <ul className="p-1">
          {CONVERT_OPTIONS.map((opt) => {
            const Icon = opt.icon
            return (
              <li key={opt.type}>
                <button
                  type="button"
                  onClick={() => handleConvert(opt.type)}
                  className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-xs text-foreground transition hover:bg-accent"
                >
                  <Icon className="h-3.5 w-3.5" />
                  {opt.label}
                </button>
              </li>
            )
          })}
        </ul>
      </div>
    )
  }

  // Default action picker — main menu with AI actions + Convertir button
  return (
    <div
      className="absolute z-50 flex items-center gap-0.5 rounded-md border border-border bg-popover p-1 shadow-lg"
      style={{ top: pos.top, left: pos.left }}
    >
      {/* Convertir en — opens the block-type conversion submenu */}
      <button
        type="button"
        onClick={() => setShowConvertMenu(true)}
        className="flex items-center gap-1 rounded-sm px-2 py-1 text-xs text-foreground transition hover:bg-accent"
        title="Convertir en otro tipo de bloque"
      >
        <Type className="h-3.5 w-3.5" />
        Convertir
        <ChevronDown className="h-3 w-3 opacity-60" />
      </button>

      {/* Divider */}
      <div className="mx-0.5 h-5 w-px bg-border" />

      {/* AI actions */}
      {ACTIONS.map((a) => {
        const Icon = a.icon
        return (
          <button
            key={a.id}
            type="button"
            onClick={() => handlePick(a.id)}
            className="flex items-center gap-1.5 rounded-sm px-2 py-1 text-xs text-foreground transition hover:bg-accent"
            title={a.label}
          >
            <Icon className="h-3.5 w-3.5" />
            {a.label}
          </button>
        )
      })}
    </div>
  )
}
