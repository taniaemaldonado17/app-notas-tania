'use client'

import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Calculator, ChevronRight, FileSpreadsheet, Loader2, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useDb } from '@/components/db/db-context'
import * as api from '@/lib/api'
import type { DatabaseDef } from '@/lib/db-types'
import type { PresupuestoResumen } from '@/lib/presupuesto/types'
import { fmtARS, fmtUSD } from '@/lib/presupuesto/format'
import { useWorkspace } from '@/lib/workspace-store'

/** Project databases get the budget block: named like "Proyectos" or with a "Presupuesto" column. */
export function admitePresupuesto(db: DatabaseDef): boolean {
  return /proyecto/i.test(db.title) || db.properties.some((p) => p.name.trim().toLowerCase() === 'presupuesto')
}

/** "Cómputo y presupuesto" section in a project row's panel. */
export function PresupuestoBlock({ rowId }: { rowId: string }) {
  const { ws } = useDb()
  const openPresupuesto = useWorkspace((s) => s.openPresupuesto)
  const openPresupuestoId = useWorkspace((s) => s.openPresupuestoId)
  const [state, setState] = useState<{ loading: boolean; presupuesto: PresupuestoResumen | null }>({ loading: true, presupuesto: null })
  const [importing, setImporting] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // Reload when the full-screen view closes (it may have been edited or deleted).
  useEffect(() => {
    if (openPresupuestoId) return
    let cancelled = false
    api
      .fetchRowPresupuesto(rowId)
      .then((p) => !cancelled && setState({ loading: false, presupuesto: p }))
      .catch(() => !cancelled && setState({ loading: false, presupuesto: null }))
    return () => {
      cancelled = true
    }
  }, [rowId, openPresupuestoId])

  async function onFile(file: File) {
    setImporting(true)
    try {
      const { id, avisos } = await api.importPresupuesto(rowId, file)
      toast.success('Presupuesto importado')
      if (avisos.length) {
        toast.warning(`${avisos.length} aviso${avisos.length > 1 ? 's' : ''} al importar`, {
          description: avisos.slice(0, 3).join('\n') + (avisos.length > 3 ? '\n…' : ''),
          duration: 12000,
        })
      }
      void ws.refresh() // the "Presupuesto" column and its value changed
      openPresupuesto(id)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo importar la planilla', { duration: 10000 })
    } finally {
      setImporting(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  const p = state.presupuesto
  return (
    <section className="rounded-xl border border-border bg-card/60 p-4">
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
        <Calculator className="h-4 w-4 text-muted-foreground" />
        Cómputo y presupuesto
      </div>

      {state.loading ? (
        <div className="h-16 animate-pulse rounded-lg bg-muted/50" />
      ) : p ? (
        <button
          type="button"
          onClick={() => openPresupuesto(p.id)}
          className="group flex w-full items-center gap-4 rounded-lg border border-border bg-background px-4 py-3 text-left transition hover:border-primary/40 hover:bg-accent/40"
        >
          <div className="min-w-0 flex-1">
            <div className="truncate text-xs text-muted-foreground">{p.nombre}</div>
            <div className="text-xl font-semibold tabular-nums">{fmtARS(p.total)}</div>
            <div className="mt-0.5 text-xs text-muted-foreground">
              {p.rubros} rubros · {p.items} ítems
              {p.tipoCambio ? ` · ${fmtUSD(p.total / p.tipoCambio)}` : ''}
            </div>
          </div>
          <span className="flex items-center gap-1 text-sm font-medium text-primary">
            Abrir
            <ChevronRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
          </span>
        </button>
      ) : (
        <div className="flex flex-col items-start gap-3 rounded-lg border border-dashed border-border px-4 py-4 sm:flex-row sm:items-center">
          <FileSpreadsheet className="h-8 w-8 shrink-0 text-muted-foreground/60" />
          <p className="flex-1 text-sm text-muted-foreground">
            Importá la planilla de cómputo y presupuesto (.xlsx) de este proyecto: insumos, análisis de precios, mediciones y rubros.
          </p>
          <Button size="sm" onClick={() => inputRef.current?.click()} disabled={importing}>
            {importing ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Upload className="mr-1.5 h-4 w-4" />}
            {importing ? 'Importando…' : 'Importar Excel'}
          </Button>
        </div>
      )}
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) void onFile(f)
        }}
      />
    </section>
  )
}
