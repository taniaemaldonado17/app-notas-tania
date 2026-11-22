'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Calculator, ChevronRight, Link2Off, Loader2, MoreHorizontal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { useDb } from '@/components/db/db-context'
import * as api from '@/lib/api'
import type { DatabaseDef } from '@/lib/db-types'
import type { PresupuestoResumen } from '@/lib/presupuesto/types'
import { fmtARS, fmtUSD } from '@/lib/presupuesto/format'
import { useWorkspace } from '@/lib/workspace-store'

/** Special choices in the project card's selector. */
const NUEVO = '__nuevo__'
const ARCHIVO = '__archivo__'

/** Project databases get the budget block: named like "Proyectos" or with a "Presupuesto" column. */
export function admitePresupuesto(db: DatabaseDef): boolean {
  return /proyecto/i.test(db.title) || db.properties.some((p) => p.name.trim().toLowerCase() === 'presupuesto')
}

/**
 * "Cómputo y presupuesto" section in a project row's panel. The CyP itself
 * lives in Inicio › Cómputo y presupuesto; here it's linked to the project
 * (same record: editing it here or there is the same).
 */
export function PresupuestoBlock({ rowId, titulo }: { rowId: string; titulo?: string }) {
  const { ws } = useDb()
  const openPresupuesto = useWorkspace((s) => s.openPresupuesto)
  const openPresupuestoId = useWorkspace((s) => s.openPresupuestoId)
  const [state, setState] = useState<{ loading: boolean; presupuesto: PresupuestoResumen | null }>({ loading: true, presupuesto: null })
  const [disponibles, setDisponibles] = useState<api.CypResumen[] | null>(null)
  const [elegido, setElegido] = useState('')
  const [trabajando, setTrabajando] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const cargar = useCallback(async () => {
    try {
      const p = await api.fetchRowPresupuesto(rowId)
      setState({ loading: false, presupuesto: p })
      if (!p) {
        const lista = await api.fetchPresupuestos()
        setDisponibles(lista)
        const libres = lista.filter((c) => !c.proyecto)
        setElegido((e) => (libres.some((c) => c.id === e) || e === NUEVO || e === ARCHIVO ? e : (libres[0]?.id ?? NUEVO)))
      }
    } catch {
      setState({ loading: false, presupuesto: null })
      setDisponibles([])
    }
  }, [rowId])

  // Reload when the full-screen view closes (it may have been edited or deleted).
  useEffect(() => {
    if (!openPresupuestoId) void cargar()
  }, [cargar, openPresupuestoId])

  async function vincular() {
    if (!elegido) return
    if (elegido === ARCHIVO) {
      inputRef.current?.click()
      return
    }
    setTrabajando(true)
    try {
      if (elegido === NUEVO) {
        const { id } = await api.crearPresupuesto(titulo?.trim() ? `Cómputo y presupuesto – ${titulo.trim()}` : undefined)
        await api.vincularPresupuesto(rowId, id)
        void ws.refresh()
        openPresupuesto(id)
        return
      }
      await api.vincularPresupuesto(rowId, elegido)
      toast.success('Cómputo y presupuesto vinculado al proyecto')
      void ws.refresh() // the "Presupuesto" column and its value changed
      await cargar()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo vincular')
    } finally {
      setTrabajando(false)
    }
  }

  /** Imports a file straight into this project (.xlsx or the CyP app's .json). */
  async function importar(file: File) {
    setTrabajando(true)
    try {
      const { id, avisos } = await api.importPresupuesto(rowId, file)
      toast.success('Cómputo y presupuesto importado y vinculado')
      if (avisos.length) {
        toast.warning(`${avisos.length} aviso${avisos.length > 1 ? 's' : ''} al importar`, {
          description: avisos.slice(0, 3).join('\n') + (avisos.length > 3 ? '\n…' : ''),
          duration: 12000,
        })
      }
      void ws.refresh()
      openPresupuesto(id)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo importar', { duration: 10000 })
    } finally {
      setTrabajando(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  async function desvincular() {
    if (!window.confirm('¿Desvincular el cómputo y presupuesto de este proyecto?\n\nNo se borra: sigue en Inicio › Cómputo y presupuesto y lo podés volver a vincular.')) return
    setTrabajando(true)
    try {
      await api.desvincularPresupuesto(rowId)
      void ws.refresh()
      await cargar()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo desvincular')
    } finally {
      setTrabajando(false)
    }
  }

  const p = state.presupuesto
  return (
    <section className="rounded-xl border border-border bg-card/60 p-4">
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
        <Calculator className="h-4 w-4 text-muted-foreground" />
        <span className="flex-1">Cómputo y presupuesto</span>
        {p && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Opciones del cómputo y presupuesto">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => void desvincular()} disabled={trabajando}>
                <Link2Off className="mr-2 h-4 w-4" />
                Desvincular del proyecto
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
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
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <select
            value={elegido}
            onChange={(e) => setElegido(e.target.value)}
            aria-label="Cómputo y presupuesto para este proyecto"
            className="h-9 min-w-0 flex-1 rounded-lg border border-border bg-background px-3 text-sm font-medium focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          >
            {(disponibles ?? []).some((c) => !c.proyecto) && (
              <optgroup label="Sin proyecto">
                {(disponibles ?? [])
                  .filter((c) => !c.proyecto)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nombre}
                    </option>
                  ))}
              </optgroup>
            )}
            <optgroup label="Nuevo">
              <option value={NUEVO}>+ Crear CyP nuevo para este proyecto</option>
              <option value={ARCHIVO}>Importar Excel o JSON…</option>
            </optgroup>
            {(disponibles ?? []).some((c) => c.proyecto) && (
              <optgroup label="Ya vinculados a otro proyecto">
                {(disponibles ?? [])
                  .filter((c) => c.proyecto)
                  .map((c) => (
                    <option key={c.id} value={c.id} disabled>
                      {c.nombre} — {c.proyecto!.titulo}
                    </option>
                  ))}
              </optgroup>
            )}
          </select>
          <Button size="sm" onClick={() => void vincular()} disabled={trabajando || !elegido}>
            {trabajando && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            {elegido === NUEVO ? 'Crear CyP' : elegido === ARCHIVO ? 'Elegir archivo' : 'Importar CyP'}
          </Button>
        </div>
      )}
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx,.json,application/json,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) void importar(f)
        }}
      />
    </section>
  )
}
