'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { NOMBRES_TIPO, type TipoInsumo } from '@/lib/presupuesto/calculo'
import { fmtInput, parseNumeroAR } from '@/lib/presupuesto/format'
import { cn } from '@/lib/utils'
import { usePresupuesto } from './presupuesto-context'

/* ------------------------------------------------------------------ */
/* Table styles shared by the budget screens                            */
/* ------------------------------------------------------------------ */

export const th = 'whitespace-nowrap px-3 py-2 text-left text-[11px] font-medium uppercase tracking-wide text-muted-foreground'
export const td = 'px-3 py-2 align-top'
export const tdEdit = 'px-1 py-1 align-middle'
export const num = 'text-right tabular-nums whitespace-nowrap'

/* ------------------------------------------------------------------ */
/* Saving edits                                                         */
/* ------------------------------------------------------------------ */

/**
 * Runs one budget edit on the device (works offline; uploaded in the
 * background). Shows the error and returns null if it can't be applied.
 */
export function useEditar() {
  return usePresupuesto().editar
}

/* ------------------------------------------------------------------ */
/* Editable fields: save on blur / Enter, Esc reverts                   */
/* ------------------------------------------------------------------ */

const campoBase =
  'h-8 w-full min-w-0 rounded-md border border-transparent bg-transparent px-2 text-sm outline-none transition hover:border-border focus:border-primary focus:bg-background focus:ring-2 focus:ring-primary/20 disabled:opacity-60'

export function CampoTexto({
  value,
  onSave,
  placeholder,
  className,
  requerido,
  ariaLabel,
}: {
  value: string | null
  onSave: (v: string | null) => unknown
  placeholder?: string
  className?: string
  /** Empty text isn't allowed (reverts instead of saving). */
  requerido?: boolean
  ariaLabel?: string
}) {
  const [draft, setDraft] = useState(value ?? '')
  useEffect(() => setDraft(value ?? ''), [value])

  function commit() {
    const next = draft.trim()
    if (next === (value ?? '').trim()) return
    if (requerido && !next) {
      setDraft(value ?? '')
      return
    }
    void onSave(next || null)
  }

  return (
    <input
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
        if (e.key === 'Escape') {
          e.stopPropagation()
          setDraft(value ?? '')
          requestAnimationFrame(() => (e.target as HTMLInputElement).blur())
        }
      }}
      placeholder={placeholder}
      aria-label={ariaLabel ?? placeholder}
      className={cn(campoBase, className)}
    />
  )
}

export function CampoNumero({
  value,
  onSave,
  placeholder,
  className,
  vacioPermitido = true,
  ariaLabel,
}: {
  value: number | null
  onSave: (v: number | null) => unknown
  placeholder?: string
  className?: string
  /** Allow clearing the field (saves null). */
  vacioPermitido?: boolean
  ariaLabel?: string
}) {
  const [draft, setDraft] = useState(fmtInput(value))
  useEffect(() => setDraft(fmtInput(value)), [value])

  function commit() {
    const n = parseNumeroAR(draft)
    if (n !== null && Number.isNaN(n)) {
      toast.error(`«${draft}» no es un número válido`)
      setDraft(fmtInput(value))
      return
    }
    if (n === null && !vacioPermitido) {
      setDraft(fmtInput(value))
      return
    }
    if (n === value) {
      setDraft(fmtInput(value))
      return
    }
    void onSave(n)
  }

  return (
    <input
      value={draft}
      inputMode="decimal"
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onFocus={(e) => e.target.select()}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
        if (e.key === 'Escape') {
          e.stopPropagation()
          setDraft(fmtInput(value))
          requestAnimationFrame(() => (e.target as HTMLInputElement).blur())
        }
      }}
      placeholder={placeholder}
      aria-label={ariaLabel ?? placeholder}
      className={cn(campoBase, 'text-right tabular-nums', className)}
    />
  )
}

/* ------------------------------------------------------------------ */
/* Small pieces                                                         */
/* ------------------------------------------------------------------ */

const TIPO_COLOR: Record<TipoInsumo, string> = {
  MO: 'bg-blue-500/15 text-blue-700 dark:text-blue-300',
  MAT: 'bg-green-500/15 text-green-700 dark:text-green-300',
  EQ: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
  SUB: 'bg-violet-500/15 text-violet-700 dark:text-violet-300',
}

export function TipoBadge({ tipo }: { tipo: TipoInsumo }) {
  return (
    <span title={NOMBRES_TIPO[tipo]} className={cn('rounded px-1.5 py-0.5 text-[11px] font-bold tracking-wide', TIPO_COLOR[tipo])}>
      {tipo}
    </span>
  )
}

export function Kpi({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-xl border border-border bg-card px-4 py-3">
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={cn('mt-1 text-lg font-semibold tabular-nums sm:text-xl', accent && 'text-primary')}>{value}</div>
    </div>
  )
}
