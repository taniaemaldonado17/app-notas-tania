'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Calculator, Copy, Download, FileSignature, Link2, Loader2, MoreHorizontal, Plus, Trash2, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import * as api from '@/lib/api'
import { fmtARS, fmtUSD } from '@/lib/presupuesto/format'
import { useWorkspace } from '@/lib/workspace-store'
import { PresupuestoView } from './presupuesto-view'
import { BotonCalculadora, CalculadoraMateriales } from './calculadora'

const fecha = (iso: string) => new Date(iso).toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' })

/**
 * Inicio › Cómputo y presupuesto: every CyP, with or without a project.
 * The same records the project cards link to ("Importar CyP").
 */
export function CypLista() {
  const [lista, setLista] = useState<api.CypResumen[] | null>(null)
  const [trabajando, setTrabajando] = useState(false)
  const [calcOpen, setCalcOpen] = useState(false)
  const cerrarCalc = useCallback(() => setCalcOpen(false), [])
  const inputRef = useRef<HTMLInputElement>(null)
  const openPresupuestoId = useWorkspace((s) => s.openPresupuestoId)
  const openPresupuesto = useWorkspace((s) => s.openPresupuesto)
  const closePresupuesto = useWorkspace((s) => s.closePresupuesto)

  const cargar = useCallback(async () => {
    try {
      setLista(await api.fetchPresupuestos())
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudieron cargar los cómputos y presupuestos')
      setLista((l) => l ?? [])
    }
  }, [])

  useEffect(() => {
    if (!openPresupuestoId) void cargar()
  }, [cargar, openPresupuestoId])

  async function nuevo() {
    setTrabajando(true)
    try {
      const { id } = await api.crearPresupuesto()
      openPresupuesto(id)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo crear')
    } finally {
      setTrabajando(false)
    }
  }

  async function importar(file: File) {
    setTrabajando(true)
    try {
      const { id, avisos } = await api.importPresupuesto(null, file)
      toast.success('Cómputo y presupuesto importado')
      if (avisos.length) {
        toast.warning(`${avisos.length} aviso${avisos.length > 1 ? 's' : ''} al importar`, {
          description: avisos.slice(0, 3).join('\n') + (avisos.length > 3 ? '\n…' : ''),
          duration: 12000,
        })
      }
      openPresupuesto(id)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo importar', { duration: 10000 })
    } finally {
      setTrabajando(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  async function duplicar(c: api.CypResumen) {
    try {
      const { id } = await api.duplicarPresupuesto(c.id)
      toast.success(`Copia de «${c.nombre}» creada`)
      void cargar()
      openPresupuesto(id)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo duplicar')
    }
  }

  async function eliminar(c: api.CypResumen) {
    const extra = c.proyecto ? `\n\nEstá vinculado al proyecto «${c.proyecto.titulo}»: se quita de ahí también.` : ''
    const contrato = c.conContrato ? '\nTiene contrato y certificados: también se borran.' : ''
    if (!window.confirm(`¿Eliminar «${c.nombre}»?${extra}${contrato}\n\nNo se puede deshacer.`)) return
    try {
      await api.deletePresupuesto(c.id)
      toast.success('Cómputo y presupuesto eliminado')
      void cargar()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo eliminar')
    }
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <p className="max-w-2xl text-sm text-muted-foreground">
          Armá el cómputo y presupuesto acá (de cero, importando el Excel o el respaldo .json de la app de cómputo) y vinculalo a
          su proyecto con «Importar CyP» en la tarjeta del proyecto. Es el mismo: lo que cambies acá o allá se ve en los dos lados.
        </p>
        <div className="flex flex-wrap gap-2">
          <BotonCalculadora onClick={() => setCalcOpen(true)} />
          <Button variant="outline" size="sm" onClick={() => inputRef.current?.click()} disabled={trabajando}>
            <Upload className="mr-1.5 h-4 w-4" />
            Importar
          </Button>
          <Button size="sm" onClick={() => void nuevo()} disabled={trabajando}>
            {trabajando ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Plus className="mr-1.5 h-4 w-4" />}
            Nuevo CyP
          </Button>
        </div>
      </div>

      {!lista ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : !lista.length ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border py-12 text-center">
          <Calculator className="h-8 w-8 text-muted-foreground/60" />
          <p className="font-medium">Todavía no hay cómputos y presupuestos</p>
          <p className="max-w-md text-sm text-muted-foreground">Creá uno nuevo o importá el Excel (.xlsx) o el respaldo (.json) de la app de cómputo.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {lista.map((c) => (
            <div key={c.id} className="group relative flex flex-col rounded-xl border border-border bg-card transition hover:border-primary/40">
              <button type="button" onClick={() => openPresupuesto(c.id)} className="flex flex-1 flex-col gap-1 p-4 pr-12 text-left">
                <span className="line-clamp-2 font-medium">{c.nombre}</span>
                <span className="text-xl font-semibold tabular-nums">{fmtARS(c.total)}</span>
                <span className="text-xs text-muted-foreground">
                  {c.rubros} rubros · {c.items} ítems{c.tipoCambio ? ` · ${fmtUSD(c.total / c.tipoCambio)}` : ''}
                </span>
                <span className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
                  {c.proyecto ? (
                    <span className="inline-flex max-w-full items-center gap-1 rounded bg-primary/10 px-1.5 py-0.5 text-primary">
                      <Link2 className="h-3 w-3 shrink-0" />
                      <span className="truncate">
                        {c.proyecto.icono ? `${c.proyecto.icono} ` : ''}
                        {c.proyecto.titulo}
                      </span>
                    </span>
                  ) : (
                    <span className="rounded bg-muted px-1.5 py-0.5 text-muted-foreground">Sin proyecto</span>
                  )}
                  {c.conContrato && (
                    <span className="inline-flex items-center gap-1 rounded bg-emerald-500/10 px-1.5 py-0.5 text-emerald-700 dark:text-emerald-300">
                      <FileSignature className="h-3 w-3" />
                      Con contrato
                    </span>
                  )}
                  {c.de && <span className="rounded bg-muted px-1.5 py-0.5 text-muted-foreground">de {c.de}</span>}
                  <span className="text-muted-foreground">· {fecha(c.updatedAt)}</span>
                </span>
              </button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="absolute right-2 top-2 h-8 w-8" aria-label={`Opciones de ${c.nombre}`}>
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => void duplicar(c)}>
                    <Copy className="mr-2 h-4 w-4" />
                    Duplicar (nueva revisión)
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <a href={api.urlExportarPresupuesto(c.id, 'xlsx')} download>
                      <Download className="mr-2 h-4 w-4" />
                      Exportar Excel
                    </a>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <a href={api.urlExportarPresupuesto(c.id, 'json')} download>
                      <Download className="mr-2 h-4 w-4" />
                      Exportar JSON (respaldo)
                    </a>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => void eliminar(c)} className="text-destructive focus:text-destructive">
                    <Trash2 className="mr-2 h-4 w-4" />
                    Eliminar
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ))}
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

      {calcOpen && <CalculadoraMateriales onClose={cerrarCalc} />}
      {openPresupuestoId && (
        <PresupuestoView
          key={openPresupuestoId}
          id={openPresupuestoId}
          onClose={() => {
            closePresupuesto()
            void cargar()
          }}
          onChanged={() => void cargar()}
        />
      )}
    </section>
  )
}
