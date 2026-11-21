'use client'

import { Fragment, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { ArrowLeft, ChevronRight, Loader2, MoreHorizontal, Search, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import * as api from '@/lib/api'
import { NOMBRES_TIPO, TIPOS_INSUMO, type TipoInsumo } from '@/lib/presupuesto/calculo'
import { fmtARS, fmtNum, fmtNumFino, fmtPct, fmtUSD } from '@/lib/presupuesto/format'
import type { InsumoFila, ItemDetalle, PresupuestoDetalle } from '@/lib/presupuesto/types'
import { cn } from '@/lib/utils'

type Tab = 'presupuesto' | 'insumos'

/** Full-screen budget opened from a project row. */
export function PresupuestoView({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
  const [data, setData] = useState<PresupuestoDetalle | null>(null)
  const [error, setError] = useState(false)
  const [tab, setTab] = useState<Tab>('presupuesto')
  const [itemId, setItemId] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    api
      .fetchPresupuesto(id)
      .then((d) => !cancelled && setData(d))
      .catch(() => !cancelled && setError(true))
    return () => {
      cancelled = true
    }
  }, [id])

  // Esc closes the view (the item dialog handles its own Esc first).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !itemId) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [itemId, onClose])

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

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background" role="dialog" aria-label="Presupuesto">
      <header className="flex items-center gap-2 border-b border-border px-3 py-2 sm:px-5">
        <Button variant="ghost" size="sm" onClick={onClose} className="gap-1.5">
          <ArrowLeft className="h-4 w-4" />
          <span className="hidden sm:inline">Volver al proyecto</span>
        </Button>
        <div className="min-w-0 flex-1 truncate text-sm font-medium">{data?.info.nombre ?? 'Presupuesto'}</div>
        <nav className="flex rounded-lg bg-muted p-0.5 text-sm">
          {(['presupuesto', 'insumos'] as Tab[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={cn(
                'rounded-md px-3 py-1 font-medium transition',
                tab === t ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {t === 'presupuesto' ? 'Presupuesto' : 'Insumos'}
            </button>
          ))}
        </nav>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Más opciones">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={eliminar} className="text-destructive focus:text-destructive">
              <Trash2 className="mr-2 h-4 w-4" />
              Eliminar presupuesto
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </header>

      <div className="notion-scroll flex-1 overflow-y-auto">
        {error ? (
          <p className="py-20 text-center text-sm text-muted-foreground">No se pudo abrir el presupuesto.</p>
        ) : !data ? (
          <div className="flex justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : tab === 'presupuesto' ? (
          <Resumen data={data} onOpenItem={setItemId} />
        ) : (
          <Insumos id={id} cargas={data.info.cargasSociales} coef={data.info.coefAjuste} />
        )}
      </div>

      <ItemDialog presupuestoId={id} itemId={itemId} onClose={() => setItemId(null)} />
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Resumen: indicadores + rubros desplegables                           */
/* ------------------------------------------------------------------ */

function Kpi({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-xl border border-border bg-card px-4 py-3">
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={cn('mt-1 text-lg font-semibold tabular-nums sm:text-xl', accent && 'text-primary')}>{value}</div>
    </div>
  )
}

function Resumen({ data, onOpenItem }: { data: PresupuestoDetalle; onOpenItem: (id: string) => void }) {
  const { info, calc } = data
  const [abiertos, setAbiertos] = useState<Set<string>>(new Set())
  const todosAbiertos = abiertos.size === calc.rubros.length

  function toggle(rubroId: string) {
    setAbiertos((s) => {
      const n = new Set(s)
      if (n.has(rubroId)) n.delete(rubroId)
      else n.add(rubroId)
      return n
    })
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-6">
      <div>
        <h1 className="text-2xl font-bold sm:text-3xl">{info.nombre}</h1>
        {info.descripcion && <p className="mt-1 text-sm text-muted-foreground">{info.descripcion}</p>}
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Total costo-costo" value={fmtARS(calc.total)} accent />
        <Kpi label="En dólares" value={fmtUSD(calc.totalUsd)} />
        <Kpi label="Por m² cubierto" value={fmtARS(calc.porM2Cubierto)} />
        <Kpi label="Rubros / ítems" value={`${calc.rubros.length} / ${calc.cantidadItems}`} />
      </div>

      <dl className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
        {info.ubicacion && <Dato k="Ubicación" v={info.ubicacion} />}
        <Dato k="Tipo de cambio" v={info.tipoCambio ? `${fmtARS(info.tipoCambio)} por US$` : '–'} />
        <Dato k="Cargas sociales" v={`${fmtPct(info.cargasSociales)} (mano de obra)`} />
        <Dato k="Coef. de ajuste" v={`${fmtNumFino(info.coefAjuste)} (materiales y equipos)`} />
        {info.superficieCubierta ? <Dato k="Sup. cubierta" v={`${fmtNum(info.superficieCubierta)} m²`} /> : null}
        {info.superficiePredio ? <Dato k="Sup. del predio" v={`${fmtNum(info.superficiePredio)} m²`} /> : null}
      </dl>

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Rubros e ítems</h2>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setAbiertos(todosAbiertos ? new Set() : new Set(calc.rubros.map((r) => r.id)))}
          >
            {todosAbiertos ? 'Contraer todo' : 'Expandir todo'}
          </Button>
        </div>

        <div className="overflow-hidden rounded-xl border border-border bg-card">
          {calc.rubros.map((r) => {
            const open = abiertos.has(r.id)
            return (
              <div key={r.id} className="border-b border-border last:border-b-0">
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
                {open && <TablaItems items={r.items} onOpenItem={onOpenItem} />}
              </div>
            )
          })}
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
    <div className="flex gap-1.5">
      <dt className="text-muted-foreground">{k}:</dt>
      <dd>{v}</dd>
    </div>
  )
}

const th = 'whitespace-nowrap px-3 py-2 text-left text-[11px] font-medium uppercase tracking-wide text-muted-foreground'
const td = 'px-3 py-2 align-top'
const num = 'text-right tabular-nums whitespace-nowrap'

function TablaItems({ items, onOpenItem }: { items: PresupuestoDetalle['calc']['rubros'][number]['items']; onOpenItem: (id: string) => void }) {
  return (
    <div className="overflow-x-auto border-t border-border bg-muted/30">
      <table className="w-full min-w-[960px] text-sm">
        <thead>
          <tr className="border-b border-border">
            <th className={th}>Ítem</th>
            <th className={th}>Descripción</th>
            <th className={th}>Un.</th>
            <th className={cn(th, 'text-right')}>Cantidad</th>
            <th className={cn(th, 'text-right')}>P.U. mat.</th>
            <th className={cn(th, 'text-right')}>P.U. M.O.</th>
            <th className={cn(th, 'text-right')}>P.U. equipos</th>
            <th className={cn(th, 'text-right')}>P.U. total</th>
            <th className={cn(th, 'text-right')}>Subtotal</th>
            <th className={cn(th, 'text-right')}>Incid.</th>
          </tr>
        </thead>
        <tbody>
          {items.map((i) => (
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
              <td className={cn(td, num)}>{fmtARS(i.puMat)}</td>
              <td className={cn(td, num)}>{fmtARS(i.puMo)}</td>
              <td className={cn(td, num)}>{fmtARS(i.puEq)}</td>
              <td className={cn(td, num)}>{fmtARS(i.puTotal)}</td>
              <td className={cn(td, num, 'font-semibold')}>{fmtARS(i.subtotal)}</td>
              <td className={cn(td, num, 'text-muted-foreground')}>{fmtPct(i.incidencia)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Ítem: análisis de precio + cómputo métrico                           */
/* ------------------------------------------------------------------ */

const TIPO_COLOR: Record<TipoInsumo, string> = {
  MO: 'bg-blue-500/15 text-blue-700 dark:text-blue-300',
  MAT: 'bg-green-500/15 text-green-700 dark:text-green-300',
  EQ: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
  SUB: 'bg-violet-500/15 text-violet-700 dark:text-violet-300',
}

function TipoBadge({ tipo }: { tipo: TipoInsumo }) {
  return (
    <span title={NOMBRES_TIPO[tipo]} className={cn('rounded px-1.5 py-0.5 text-[11px] font-bold tracking-wide', TIPO_COLOR[tipo])}>
      {tipo}
    </span>
  )
}

function ItemDialog({ presupuestoId, itemId, onClose }: { presupuestoId: string; itemId: string | null; onClose: () => void }) {
  const [d, setD] = useState<ItemDetalle | null>(null)

  useEffect(() => {
    if (!itemId) return
    let cancelled = false
    setD(null)
    api
      .fetchPresupuestoItem(presupuestoId, itemId)
      .then((r) => !cancelled && setD(r))
      .catch(() => {
        if (!cancelled) {
          toast.error('No se pudo abrir el ítem')
          onClose()
        }
      })
    return () => {
      cancelled = true
    }
  }, [presupuestoId, itemId, onClose])

  return (
    <Dialog open={itemId !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-4xl">
        {!d ? (
          <>
            <DialogHeader>
              <DialogTitle>Cargando ítem…</DialogTitle>
              <DialogDescription className="sr-only">Análisis de precio y mediciones</DialogDescription>
            </DialogHeader>
            <div className="flex justify-center py-10">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogDescription>
                Rubro {d.item.rubroNumero} · {d.item.rubroDescripcion}
              </DialogDescription>
              <DialogTitle className="text-xl leading-snug">
                {d.item.codigo} — {d.item.descripcion}
              </DialogTitle>
              {d.item.observaciones && <p className="text-sm text-muted-foreground">{d.item.observaciones}</p>}
            </DialogHeader>

            <div className="grid grid-cols-3 gap-2">
              <Kpi label="Cantidad" value={`${fmtNum(d.cantidad)} ${d.item.unidad ?? ''}`} />
              <Kpi label="Precio unitario" value={fmtARS(d.puTotal)} />
              <Kpi label="Subtotal" value={fmtARS(d.subtotal)} accent />
            </div>

            <h3 className="mt-2 text-sm font-semibold">Análisis de precio unitario</h3>
            <p className="-mt-1 text-xs text-muted-foreground">
              Lo que lleva una unidad ({d.item.unidad || 'unidad'}) del ítem.
            </p>
            {d.apu.length ? (
              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full min-w-[640px] text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className={th}>Tipo</th>
                      <th className={th}>Insumo</th>
                      <th className={th}>Un.</th>
                      <th className={cn(th, 'text-right')}>Cantidad</th>
                      <th className={cn(th, 'text-right')}>Precio</th>
                      <th className={cn(th, 'text-right')}>Parcial</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.apu.map((l) => (
                      <tr key={l.id} className="border-t border-border/60">
                        <td className={td}><TipoBadge tipo={l.tipo} /></td>
                        <td className={td}>
                          {l.descripcion}
                          <span className="ml-1.5 text-xs text-muted-foreground">{l.codigo}</span>
                        </td>
                        <td className={td}>{l.unidad ?? '–'}</td>
                        <td className={cn(td, num)}>{fmtNumFino(l.cantidad)}</td>
                        <td className={cn(td, num)}>{fmtARS(l.precioCalculo)}</td>
                        <td className={cn(td, num)}>{fmtARS(l.parcial)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-muted/30 text-sm">
                    {TIPOS_INSUMO.filter((t) => d.puPorTipo[t]).map((t) => (
                      <tr key={t} className="border-t border-border/60">
                        <td className={td} colSpan={5}>{NOMBRES_TIPO[t]}</td>
                        <td className={cn(td, num)}>{fmtARS(d.puPorTipo[t])}</td>
                      </tr>
                    ))}
                    <tr className="border-t border-border font-semibold">
                      <td className={td} colSpan={5}>Costo unitario</td>
                      <td className={cn(td, num)}>{fmtARS(d.puTotal)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Sin análisis de precio: el precio unitario es $ 0.</p>
            )}

            <h3 className="mt-2 text-sm font-semibold">Cómputo métrico</h3>
            <p className="-mt-1 text-xs text-muted-foreground">
              Parcial = Cant. × Largo × Ancho × Alto × Coef. (los vacíos no cuentan).
            </p>
            {d.mediciones.length ? (
              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full min-w-[700px] text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className={th}>Sector</th>
                      <th className={th}>Medición / criterio</th>
                      {['Cant.', 'Largo', 'Ancho', 'Alto', 'Coef.', 'Parcial'].map((h) => (
                        <th key={h} className={cn(th, 'text-right')}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {d.mediciones.map((m) => (
                      <tr key={m.id} className="border-t border-border/60">
                        <td className={td}>{m.sector || '–'}</td>
                        <td className={td}>{m.criterio || '–'}</td>
                        {([m.cant, m.largo, m.ancho, m.alto, m.coef] as (number | null)[]).map((v, i) => (
                          <td key={i} className={cn(td, num)}>{fmtNum(v)}</td>
                        ))}
                        <td className={cn(td, num, 'font-medium')}>{fmtNum(m.parcial)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-muted/30">
                    <tr className="border-t border-border font-semibold">
                      <td className={td} colSpan={7}>Cantidad total</td>
                      <td className={cn(td, num)}>
                        {fmtNum(d.cantidad)} {d.item.unidad ?? ''}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Sin mediciones: la cantidad es 0.</p>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

/* ------------------------------------------------------------------ */
/* Insumos                                                              */
/* ------------------------------------------------------------------ */

function Insumos({ id, cargas, coef }: { id: string; cargas: number; coef: number }) {
  const [insumos, setInsumos] = useState<InsumoFila[] | null>(null)
  const [q, setQ] = useState('')
  const [tipo, setTipo] = useState<TipoInsumo | null>(null)

  useEffect(() => {
    let cancelled = false
    api
      .fetchPresupuestoInsumos(id)
      .then((r) => !cancelled && setInsumos(r))
      .catch(() => !cancelled && toast.error('No se pudieron cargar los insumos'))
    return () => {
      cancelled = true
    }
  }, [id])

  const visibles = useMemo(() => {
    const t = q.trim().toLowerCase()
    return (insumos ?? []).filter(
      (i) => (!tipo || i.tipo === tipo) && (!t || i.descripcion.toLowerCase().includes(t) || i.codigo.toLowerCase().includes(t))
    )
  }, [insumos, q, tipo])

  return (
    <div className="mx-auto max-w-6xl space-y-4 px-4 py-6 sm:px-6">
      <div>
        <h1 className="text-2xl font-bold">Insumos y precios</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Precio de cálculo: mano de obra = base × (1 + {fmtPct(cargas)} de cargas sociales); materiales, equipos y
          subcontratos = base × {fmtNumFino(coef)}.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <label className="flex h-9 min-w-56 flex-1 items-center gap-2 rounded-lg border border-border bg-background px-3 text-sm sm:max-w-xs">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar insumo o código"
            className="min-w-0 flex-1 bg-transparent outline-none"
          />
        </label>
        {[null, ...TIPOS_INSUMO].map((t) => (
          <button
            key={t ?? 'todos'}
            type="button"
            onClick={() => setTipo(t)}
            className={cn(
              'h-8 rounded-full border px-3 text-xs font-medium transition',
              tipo === t ? 'border-primary bg-primary text-primary-foreground' : 'border-border hover:bg-accent'
            )}
          >
            {t ? NOMBRES_TIPO[t] : 'Todos'}
          </button>
        ))}
      </div>

      {!insumos ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full min-w-[900px] text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className={th}>Código</th>
                <th className={th}>Descripción</th>
                <th className={th}>Un.</th>
                <th className={th}>Tipo</th>
                <th className={cn(th, 'text-right')}>Precio base</th>
                <th className={cn(th, 'text-right')}>Precio de cálculo</th>
                <th className={cn(th, 'text-right')}>Usado en</th>
                <th className={th}>Fuente</th>
              </tr>
            </thead>
            <tbody>
              {visibles.map((i) => (
                <Fragment key={i.id}>
                  <tr className="border-t border-border/60 hover:bg-accent/30">
                    <td className={cn(td, 'font-medium')}>{i.codigo}</td>
                    <td className={td}>{i.descripcion}</td>
                    <td className={td}>{i.unidad ?? '–'}</td>
                    <td className={td}><TipoBadge tipo={i.tipo} /></td>
                    <td className={cn(td, num)}>{fmtARS(i.precioBase)}</td>
                    <td className={cn(td, num, 'font-medium')}>{fmtARS(i.precioCalculo)}</td>
                    <td className={cn(td, num, 'text-muted-foreground')}>{i.usos} {i.usos === 1 ? 'ítem' : 'ítems'}</td>
                    <td className={cn(td, 'max-w-72 text-xs text-muted-foreground')}>{i.fuente}</td>
                  </tr>
                </Fragment>
              ))}
              {visibles.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-sm text-muted-foreground">Ningún insumo coincide.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
