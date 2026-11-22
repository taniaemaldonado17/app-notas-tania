'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { ArrowDown, ArrowLeft, ArrowUp, ChevronRight, Copy, Download, Loader2, MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react'
import { EstadoSincro } from './estado-sincro'
import { PresupuestoProvider, usePresupuesto } from './presupuesto-context'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import * as api from '@/lib/api'
import { fmtARS, fmtInput, fmtNum, fmtNumFino, fmtPct, fmtUSD, parseNumeroAR } from '@/lib/presupuesto/format'
import type { PresupuestoDetalle, PresupuestoInfo } from '@/lib/presupuesto/types'
import { cn } from '@/lib/utils'
import { CampoNumero, CampoTexto, Kpi, num, td, th, useEditar } from './campos'
import { InsumosTab } from './insumos-tab'
import { CertificacionTab } from '@/components/certificacion/certificacion-tab'
import { ItemDialog } from './item-dialog'
import { AnalisisTab, ComputoTab, ResumenTab, VerificacionTab } from './vistas-cyp'
import { useWorkspace } from '@/lib/workspace-store'

type Tab = 'resumen' | 'presupuesto' | 'analisis' | 'insumos' | 'computo' | 'verificacion' | 'certificacion'
const TABS: { id: Tab; label: string }[] = [
  { id: 'resumen', label: 'Resumen' },
  { id: 'presupuesto', label: 'Presupuesto' },
  { id: 'analisis', label: 'Análisis de precios' },
  { id: 'insumos', label: 'Insumos' },
  { id: 'computo', label: 'Cómputo métrico' },
  { id: 'verificacion', label: 'Verificación' },
  { id: 'certificacion', label: 'Certificación' },
]

/**
 * Full-screen budget opened from a project row. Works offline: it reads and
 * edits the copy kept on the device and uploads the changes when there's
 * connection (see lib/presupuesto/offline.ts).
 */
export function PresupuestoView({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
  return (
    <PresupuestoProvider id={id} onSubido={onChanged}>
      <Pantalla id={id} onClose={onClose} onChanged={onChanged} />
    </PresupuestoProvider>
  )
}

function Pantalla({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
  const { detalle: data, estado } = usePresupuesto()
  // Nothing on the device and the server couldn't be reached (or the budget is gone).
  const error = !data && !estado.subiendo && (estado.sinConexion || estado.sinSesion || estado.eliminado)
  const [tab, setTab] = useState<Tab>('presupuesto')
  const [itemId, setItemId] = useState<string | null>(null)
  const [paramsOpen, setParamsOpen] = useState(false)

  // Esc closes the view (dialogs handle their own Esc first).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape' || itemId || paramsOpen) return
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return
      onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [itemId, paramsOpen, onClose])

  async function eliminar() {
    if (!data) return
    const ok = window.confirm(
      `¿Eliminar el presupuesto «${data.info.nombre}»?\n\nSe borran sus insumos, análisis de precios, mediciones y rubros. No se puede deshacer.`
    )
    if (!ok) return
    try {
      await api.deletePresupuesto(id)
      toast.success('Presupuesto eliminado')
      onChanged()
      onClose()
    } catch {
      toast.error('No se pudo eliminar el presupuesto')
    }
  }

  const cerrarItem = useCallback(() => setItemId(null), [])
  const openPresupuesto = useWorkspace((s) => s.openPresupuesto)

  async function duplicar() {
    try {
      const { id: nuevo } = await api.duplicarPresupuesto(id)
      toast.success('Copia creada: queda en Inicio › Cómputo y presupuesto, sin proyecto')
      onChanged()
      openPresupuesto(nuevo)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo duplicar')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background" role="dialog" aria-label="Presupuesto">
      <header className="flex items-center gap-2 px-3 pt-2 sm:px-5">
        <Button variant="ghost" size="sm" onClick={onClose} className="gap-1.5">
          <ArrowLeft className="h-4 w-4" />
          <span className="hidden sm:inline">Volver</span>
        </Button>
        <div className="min-w-0 flex-1 truncate text-sm font-medium">{data?.info.nombre ?? 'Cómputo y presupuesto'}</div>
        <EstadoSincro />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Más opciones">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setParamsOpen(true)} disabled={!data}>
              <Pencil className="mr-2 h-4 w-4" />
              Editar datos y parámetros
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <a href={api.urlExportarPresupuesto(id, 'xlsx')} download>
                <Download className="mr-2 h-4 w-4" />
                Exportar Excel
              </a>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <a href={api.urlExportarPresupuesto(id, 'json')} download>
                <Download className="mr-2 h-4 w-4" />
                Exportar JSON (respaldo)
              </a>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={duplicar}>
              <Copy className="mr-2 h-4 w-4" />
              Duplicar (nueva revisión)
            </DropdownMenuItem>
            <DropdownMenuItem onClick={eliminar} className="text-destructive focus:text-destructive">
              <Trash2 className="mr-2 h-4 w-4" />
              Eliminar presupuesto
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </header>
      <nav className="notion-scroll flex gap-1 overflow-x-auto border-b border-border px-3 sm:px-5" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              '-mb-px shrink-0 whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition',
              tab === t.id ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'
            )}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <div className="notion-scroll flex-1 overflow-y-auto">
        {error ? (
          <p className="mx-auto max-w-md px-4 py-20 text-center text-sm text-muted-foreground">
            {estado.eliminado
              ? 'Este presupuesto ya no existe.'
              : estado.sinSesion
                ? 'Tu sesión venció: volvé a iniciar sesión para abrir el presupuesto.'
                : 'No hay conexión y este presupuesto todavía no está guardado en este dispositivo. Abrilo una vez con señal para poder usarlo sin conexión.'}
          </p>
        ) : !data ? (
          <div className="flex justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : tab === 'resumen' ? (
          <ResumenTab onEditParams={() => setParamsOpen(true)} />
        ) : tab === 'presupuesto' ? (
          <Resumen data={data} onOpenItem={setItemId} onEditParams={() => setParamsOpen(true)} />
        ) : tab === 'analisis' ? (
          <AnalisisTab onOpenItem={setItemId} />
        ) : tab === 'computo' ? (
          <ComputoTab onOpenItem={setItemId} />
        ) : tab === 'verificacion' ? (
          <VerificacionTab onOpenItem={setItemId} />
        ) : tab === 'insumos' ? (
          <InsumosTab cargas={data.info.cargasSociales} coef={data.info.coefAjuste} />
        ) : (
          <CertificacionTab presupuestoId={id} onChanged={onChanged} />
        )}
      </div>

      <ItemDialog itemId={itemId} onClose={cerrarItem} />
      {data && (
        <ParametrosDialog open={paramsOpen} onOpenChange={setParamsOpen} info={data.info} />
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Resumen: indicadores + rubros desplegables                           */
/* ------------------------------------------------------------------ */

function Resumen({
  data,
  onOpenItem,
  onEditParams,
}: {
  data: PresupuestoDetalle
  onOpenItem: (id: string) => void
  onEditParams: () => void
}) {
  const { info, calc } = data
  const editar = useEditar()
  const [abiertos, setAbiertos] = useState<Set<string>>(new Set())
  const todosAbiertos = calc.rubros.length > 0 && abiertos.size === calc.rubros.length

  function toggle(rubroId: string) {
    setAbiertos((s) => {
      const n = new Set(s)
      if (n.has(rubroId)) n.delete(rubroId)
      else n.add(rubroId)
      return n
    })
  }

  async function agregarRubro() {
    const r = await editar({ op: 'rubro.crear', data: { descripcion: 'Nuevo rubro' } })
    if (r?.id) setAbiertos((s) => new Set(s).add(r.id!))
  }

  async function agregarItem(rubroId: string) {
    const r = await editar({ op: 'item.crear', data: { rubroId, descripcion: 'Nuevo ítem' } })
    if (r?.id) onOpenItem(r.id)
  }

  async function eliminarRubro(r: PresupuestoDetalle['calc']['rubros'][number]) {
    const msg = r.items.length
      ? `¿Eliminar el rubro ${r.numero} — ${r.descripcion} y sus ${r.items.length} ítems (con sus análisis y mediciones)?`
      : `¿Eliminar el rubro ${r.numero} — ${r.descripcion}?`
    if (window.confirm(msg)) await editar({ op: 'rubro.eliminar', id: r.id })
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-6">
      <div className="group flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold sm:text-3xl">{info.nombre}</h1>
          {info.descripcion && <p className="mt-1 text-sm text-muted-foreground">{info.descripcion}</p>}
        </div>
        <Button variant="ghost" size="sm" onClick={onEditParams} className="shrink-0 text-muted-foreground">
          <Pencil className="mr-1.5 h-3.5 w-3.5" />
          Editar
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Total costo-costo" value={fmtARS(calc.total)} accent />
        <Kpi label="En dólares" value={fmtUSD(calc.totalUsd)} />
        <Kpi label="Por m² cubierto" value={fmtARS(calc.porM2Cubierto)} />
        <Kpi label="Rubros / ítems" value={`${calc.rubros.length} / ${calc.cantidadItems}`} />
      </div>

      <button
        type="button"
        onClick={onEditParams}
        className="flex w-full flex-wrap gap-x-6 gap-y-1 rounded-lg px-2 py-1.5 text-left text-sm transition hover:bg-accent/40"
        title="Editar parámetros"
      >
        {info.ubicacion && <Dato k="Ubicación" v={info.ubicacion} />}
        <Dato k="Tipo de cambio" v={info.tipoCambio ? `${fmtARS(info.tipoCambio)} por US$` : '–'} />
        <Dato k="Cargas sociales" v={`${fmtPct(info.cargasSociales)} (mano de obra)`} />
        <Dato k="Coef. de ajuste" v={`${fmtNumFino(info.coefAjuste)} (materiales y equipos)`} />
        {info.superficieCubierta ? <Dato k="Sup. cubierta" v={`${fmtNum(info.superficieCubierta)} m²`} /> : null}
        {info.superficiePredio ? <Dato k="Sup. del predio" v={`${fmtNum(info.superficiePredio)} m²`} /> : null}
      </button>

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Rubros e ítems</h2>
          {calc.rubros.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setAbiertos(todosAbiertos ? new Set() : new Set(calc.rubros.map((r) => r.id)))}
            >
              {todosAbiertos ? 'Contraer todo' : 'Expandir todo'}
            </Button>
          )}
        </div>

        <div className="overflow-hidden rounded-xl border border-border bg-card">
          {calc.rubros.map((r) => {
            const open = abiertos.has(r.id)
            return (
              <div key={r.id} className="border-b border-border">
                <button
                  type="button"
                  onClick={() => toggle(r.id)}
                  aria-expanded={open}
                  className="grid w-full grid-cols-[2rem_1fr_auto] items-center gap-x-3 gap-y-1 px-3 py-2.5 text-left transition hover:bg-accent/40 sm:grid-cols-[2rem_1fr_5rem_10rem_8.5rem] sm:px-4"
                >
                  <span
                    className={cn(
                      'flex h-7 w-7 items-center justify-center rounded-md text-xs font-bold transition',
                      open ? 'bg-primary text-primary-foreground' : 'bg-muted'
                    )}
                  >
                    {r.numero}
                  </span>
                  <span className="flex min-w-0 items-center gap-1.5 text-sm font-medium">
                    <ChevronRight className={cn('h-3.5 w-3.5 shrink-0 text-muted-foreground transition', open && 'rotate-90')} />
                    <span className="truncate">{r.descripcion}</span>
                  </span>
                  <span className="hidden text-xs text-muted-foreground sm:block">{r.items.length} ítems</span>
                  <span className="text-right text-sm font-semibold tabular-nums">{fmtARS(r.total)}</span>
                  <span className="col-start-2 flex items-center gap-2 text-xs text-muted-foreground sm:col-start-auto sm:justify-end">
                    <span className="h-1.5 w-14 overflow-hidden rounded-full bg-muted">
                      <span className="block h-full rounded-full bg-primary" style={{ width: `${Math.max(r.incidencia * 100, 1)}%` }} />
                    </span>
                    <span className="tabular-nums">{fmtPct(r.incidencia)}</span>
                  </span>
                </button>
                {open && (
                  <div className="border-t border-border bg-muted/30">
                    <div className="flex flex-wrap items-center gap-1 px-2 py-1.5 sm:px-3">
                      <span className="pl-1 text-xs text-muted-foreground">Rubro</span>
                      <CampoNumero
                        value={r.numero}
                        vacioPermitido={false}
                        ariaLabel="Número de rubro"
                        className="w-16 text-left"
                        onSave={(v) => {
                          if (!Number.isInteger(v) || v! < 0) return toast.error('El número de rubro tiene que ser un entero')
                          return editar({ op: 'rubro.editar', id: r.id, data: { numero: v! } })
                        }}
                      />
                      <CampoTexto
                        value={r.descripcion}
                        requerido
                        ariaLabel="Nombre del rubro"
                        className="min-w-48 flex-1 font-medium"
                        onSave={(v) => editar({ op: 'rubro.editar', id: r.id, data: { descripcion: v! } })}
                      />
                      <Button variant="ghost" size="sm" onClick={() => agregarItem(r.id)}>
                        <Plus className="mr-1 h-4 w-4" />
                        Ítem
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground"
                        disabled={calc.rubros[0]?.id === r.id}
                        onClick={() => editar({ op: 'rubro.mover', id: r.id, dir: -1 })}
                        aria-label="Subir rubro"
                        title="Subir rubro (renumera)"
                      >
                        <ArrowUp className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground"
                        disabled={calc.rubros.at(-1)?.id === r.id}
                        onClick={() => editar({ op: 'rubro.mover', id: r.id, dir: 1 })}
                        aria-label="Bajar rubro"
                        title="Bajar rubro (renumera)"
                      >
                        <ArrowDown className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-muted-foreground hover:text-destructive"
                        onClick={() => eliminarRubro(r)}
                        aria-label="Eliminar rubro"
                        title="Eliminar rubro"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                    {r.items.length ? (
                      <TablaItems items={r.items} onOpenItem={onOpenItem} onMover={(itemId, dir) => editar({ op: 'item.mover', id: itemId, dir })} />
                    ) : (
                      <p className="border-t border-border px-4 py-4 text-sm text-muted-foreground">
                        Este rubro no tiene ítems todavía.
                      </p>
                    )}
                  </div>
                )}
              </div>
            )
          })}
          <button
            type="button"
            onClick={agregarRubro}
            className="flex w-full items-center gap-2 border-b border-border px-4 py-2.5 text-sm text-muted-foreground transition hover:bg-accent/40 hover:text-foreground"
          >
            <Plus className="h-4 w-4" />
            Agregar rubro
          </button>
          <div className="flex items-center justify-between gap-3 bg-muted/50 px-4 py-3 text-sm font-semibold">
            <span>Total costo-costo</span>
            <span className="tabular-nums">{fmtARS(calc.total)}</span>
          </div>
        </div>
      </section>
    </div>
  )
}

function Dato({ k, v }: { k: string; v: string }) {
  return (
    <span className="flex gap-1.5">
      <span className="text-muted-foreground">{k}:</span>
      <span>{v}</span>
    </span>
  )
}

/** P.U. breakdown columns: only from 1024 px (iPad portrait shows totals; the breakdown is in the item sheet). */
const desglose = 'hidden lg:table-cell'

function TablaItems({
  items,
  onOpenItem,
  onMover,
}: {
  items: PresupuestoDetalle['calc']['rubros'][number]['items']
  onOpenItem: (id: string) => void
  onMover: (itemId: string, dir: -1 | 1) => void
}) {
  return (
    <div className="overflow-x-auto border-t border-border">
      <table className="w-full min-w-[640px] text-sm lg:min-w-[960px]">
        <thead>
          <tr className="border-b border-border">
            <th className={th}>Ítem</th>
            <th className={cn(th, 'min-w-48')}>Descripción</th>
            <th className={th}>Un.</th>
            <th className={cn(th, 'text-right')}>Cantidad</th>
            <th className={cn(th, desglose, 'text-right')}>P.U. mat.</th>
            <th className={cn(th, desglose, 'text-right')}>P.U. M.O.</th>
            <th className={cn(th, desglose, 'text-right')}>P.U. equipos</th>
            <th className={cn(th, 'text-right')}>P.U. total</th>
            <th className={cn(th, 'text-right')}>Subtotal</th>
            <th className={cn(th, 'text-right')}>Incid.</th>
            <th className="w-16" aria-label="Orden" />
          </tr>
        </thead>
        <tbody>
          {items.map((i, k) => (
            <tr
              key={i.id}
              onClick={() => onOpenItem(i.id)}
              className="cursor-pointer border-b border-border/60 last:border-b-0 hover:bg-accent/50"
            >
              <td className={cn(td, 'font-medium text-primary')}>{i.codigo}</td>
              <td className={td}>
                {i.descripcion}
                {i.observaciones && <div className="text-xs text-muted-foreground">{i.observaciones}</div>}
              </td>
              <td className={td}>{i.unidad ?? '–'}</td>
              <td className={cn(td, num)}>{fmtNum(i.cantidad)}</td>
              <td className={cn(td, num, desglose)}>{fmtARS(i.puMat)}</td>
              <td className={cn(td, num, desglose)}>{fmtARS(i.puMo)}</td>
              <td className={cn(td, num, desglose)}>{fmtARS(i.puEq)}</td>
              <td className={cn(td, num)}>{fmtARS(i.puTotal)}</td>
              <td className={cn(td, num, 'font-semibold')}>{fmtARS(i.subtotal)}</td>
              <td className={cn(td, num, 'text-muted-foreground')}>{fmtPct(i.incidencia)}</td>
              <td className="whitespace-nowrap px-1 py-1 text-right align-top" onClick={(e) => e.stopPropagation()}>
                <button
                  type="button"
                  disabled={k === 0}
                  onClick={() => onMover(i.id, -1)}
                  className="rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-25"
                  aria-label={`Subir ${i.codigo}`}
                  title="Subir (renumera)"
                >
                  <ArrowUp className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  disabled={k === items.length - 1}
                  onClick={() => onMover(i.id, 1)}
                  className="rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-25"
                  aria-label={`Bajar ${i.codigo}`}
                  title="Bajar (renumera)"
                >
                  <ArrowDown className="h-3.5 w-3.5" />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Datos y parámetros                                                   */
/* ------------------------------------------------------------------ */

function ParametrosDialog({
  open,
  onOpenChange,
  info,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  info: PresupuestoInfo
}) {
  const editar = useEditar()
  const inicial = useCallback(
    () => ({
      nombre: info.nombre,
      descripcion: info.descripcion ?? '',
      ubicacion: info.ubicacion ?? '',
      tipoCambio: fmtInput(info.tipoCambio),
      // Shown as a percentage: 1,1 → 110
      cargasSociales: fmtInput(Math.round(info.cargasSociales * 1e6) / 1e4),
      coefAjuste: fmtInput(info.coefAjuste),
      superficieCubierta: fmtInput(info.superficieCubierta),
      superficiePredio: fmtInput(info.superficiePredio),
    }),
    [info]
  )
  const [f, setF] = useState(inicial)
  const [guardando, setGuardando] = useState(false)
  useEffect(() => {
    if (open) setF(inicial())
  }, [open, inicial])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const n = (campo: string, s: string) => {
      const v = parseNumeroAR(s)
      if (v !== null && Number.isNaN(v)) throw new Error(`${campo}: «${s}» no es un número válido`)
      return v
    }
    let data
    try {
      const cargas = n('Cargas sociales', f.cargasSociales)
      const coef = n('Coeficiente de ajuste', f.coefAjuste)
      if (!f.nombre.trim()) throw new Error('El nombre no puede quedar vacío')
      data = {
        nombre: f.nombre.trim(),
        descripcion: f.descripcion.trim() || null,
        ubicacion: f.ubicacion.trim() || null,
        tipoCambio: n('Tipo de cambio', f.tipoCambio),
        cargasSociales: (cargas ?? 0) / 100,
        coefAjuste: coef ?? 1,
        superficieCubierta: n('Superficie cubierta', f.superficieCubierta),
        superficiePredio: n('Superficie del predio', f.superficiePredio),
      }
    } catch (err) {
      toast.error((err as Error).message)
      return
    }
    setGuardando(true)
    const ok = await editar({ op: 'parametros', data })
    setGuardando(false)
    if (ok) {
      toast.success('Datos guardados')
      onOpenChange(false)
    }
  }

  const campo = (k: keyof typeof f, label: string, opts: { sufijo?: string; placeholder?: string; num?: boolean } = {}) => (
    <div className="space-y-1.5">
      <Label htmlFor={`par-${k}`}>{label}</Label>
      <div className="flex items-center gap-2">
        <Input
          id={`par-${k}`}
          value={f[k]}
          inputMode={opts.num ? 'decimal' : undefined}
          placeholder={opts.placeholder}
          onChange={(e) => setF({ ...f, [k]: e.target.value })}
          className={cn(opts.num && 'text-right tabular-nums')}
        />
        {opts.sufijo && <span className="shrink-0 text-sm text-muted-foreground">{opts.sufijo}</span>}
      </div>
    </div>
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-xl">
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>Datos y parámetros</DialogTitle>
            <DialogDescription>
              Las cargas sociales se aplican a la mano de obra; el coeficiente de ajuste, a materiales, equipos y subcontratos
              (por ejemplo 0,826 para quitar el IVA). Al guardar se recalcula todo el presupuesto.
            </DialogDescription>
          </DialogHeader>
          {campo('nombre', 'Nombre')}
          <div className="space-y-1.5">
            <Label htmlFor="par-descripcion">Descripción</Label>
            <Textarea id="par-descripcion" value={f.descripcion} rows={2} onChange={(e) => setF({ ...f, descripcion: e.target.value })} />
          </div>
          {campo('ubicacion', 'Ubicación')}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {campo('tipoCambio', 'Tipo de cambio', { sufijo: '$/US$', num: true })}
            {campo('cargasSociales', 'Cargas sociales', { sufijo: '%', num: true })}
            {campo('coefAjuste', 'Coef. de ajuste', { num: true, placeholder: '1' })}
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {campo('superficieCubierta', 'Superficie cubierta', { sufijo: 'm²', num: true })}
            {campo('superficiePredio', 'Superficie del predio', { sufijo: 'm²', num: true })}
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={guardando}>
              {guardando && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              Guardar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
