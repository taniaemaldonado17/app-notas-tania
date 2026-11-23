'use client'

import { useEffect, useState } from 'react'
import { useTheme } from 'next-themes'
import { Calculator } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Calculadora de materiales of the CyP app (public/calculadora), full screen.
 * With a CyP open it can take quantities from its items and prices from its
 * insumos; it never changes the budget.
 */
export function CalculadoraMateriales({ presupuestoId, onClose }: { presupuestoId?: string; onClose: () => void }) {
  const { resolvedTheme } = useTheme()
  const [src] = useState(() => {
    const q = new URLSearchParams({ tema: resolvedTheme === 'light' ? 'light' : 'dark' })
    if (presupuestoId) q.set('p', presupuestoId)
    return `/calculadora/index.html?${q}`
  })

  // The panel's ✕ (or Esc inside it) asks to close.
  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (e.origin === window.location.origin && (e.data as { tipo?: string } | null)?.tipo === 'calculadora:cerrar') onClose()
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-[60] bg-background" role="dialog" aria-label="Calculadora de materiales">
      <iframe src={src} title="Calculadora de materiales" className="h-full w-full border-0" />
    </div>
  )
}

/** Dark grey button with white text. */
export function BotonCalculadora({ onClick, className, compacto }: { onClick: () => void; className?: string; compacto?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title="Calculadora de materiales: herramienta general, no cambia el presupuesto"
      className={cn(
        'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md bg-neutral-700 px-3 text-sm font-medium text-white shadow-sm transition hover:bg-neutral-800 dark:bg-neutral-600 dark:hover:bg-neutral-500',
        className
      )}
    >
      <Calculator className="h-4 w-4" />
      <span className={cn(compacto && 'hidden md:inline')}>Calculadora de materiales</span>
    </button>
  )
}
