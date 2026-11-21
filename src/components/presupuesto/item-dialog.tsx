'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Loader2, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import * as api from '@/lib/api'
import { NOMBRES_TIPO, TIPOS_INSUMO } from '@/lib/presupuesto/calculo'
import { fmtARS, fmtNum } from '@/lib/presupuesto/format'
import type { InsumoFila, ItemDetalle } from '@/lib/presupuesto/types'
import { cn } from '@/lib/utils'
import { CampoNumero, CampoTexto, Kpi, num, td, tdEdit, th, TipoBadge, useEditar } from './campos'

/** Item: editable header, price analysis (APU) and measurements. */
export function ItemDialog({
  presupuestoId,
  itemId,
  onClose,
  onChanged,
}: {
  presupuestoId: string
  itemId: string | null
  onClose: () => void
  /** Something changed: the budget view reloads its totals. */
  onChanged: () => void
}) {
  const [d, setD] = useState<ItemDetalle | null>(null)

  const cargar = useCallback(async () => {
    if (!itemId) return
    try {
      setD(await api.fetchPresupuestoItem(presupuestoId, itemId))
    } catch {
      toast.error('No se pudo abrir el ítem')
      onClose()
    }
  }, [presupuestoId, itemId, onClose])

  useEffect(() => {
    setD(null)
    void cargar()
  }, [cargar])

  const despues = useCallback(() => {
    void cargar()
    onChanged()
  }, [cargar, onChanged])
  const editar = useEditar(presupuestoId, despues)

  async function eliminarItem() {
    if (!d) return
    if (!window.confirm(`¿Eliminar el ítem ${d.item.codigo} — ${d.item.descripcion}?\n\nSe borran su análisis de precio y sus mediciones.`)) return
    try {
      await api.editarPresupuesto(presupuestoId, { op: 'item.eliminar', id: d.item.id })
      toast.success('Ítem eliminado')
      onChanged()
      onClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo eliminar el ítem')
    }
  }

  return (
    <Dialog open={itemId !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-5xl">
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
            <DialogHeader className="space-y-1">
              <DialogDescription>
                Rubro {d.item.rubroNumero} · {d.item.rubroDescripcion}
              </DialogDescription>
              <DialogTitle className="sr-only">
                {d.item.codigo} — {d.item.descripcion}
              </DialogTitle>
              <div className="flex items-center gap-1 pr-6">
                <CampoTexto
                  value={d.item.codigo}
                  requerido
                  ariaLabel="Código del ítem"
                  className="h-10 w-20 shrink-0 text-lg font-bold"
                  onSave={(v) => editar({ op: 'item.editar', id: d.item.id, data: { codigo: v! } })}
                />
                <CampoTexto
                  value={d.item.descripcion}
                  requerido
                  ariaLabel="Descripción del ítem"
                  className="h-10 text-lg font-semibold"
                  onSave={(v) => editar({ op: 'item.editar', id: d.item.id, data: { descripcion: v! } })}
                />
              </div>
              <div className="flex items-center gap-1 text-sm">
                <span className="pl-2 text-muted-foreground">Unidad</span>
                <CampoTexto
                  value={d.item.unidad}
                  placeholder="m2"
                  ariaLabel="Unidad"
                  className="w-20"
                  onSave={(v) => editar({ op: 'item.editar', id: d.item.id, data: { unidad: v } })}
                />
                <CampoTexto
                  value={d.item.observaciones}
                  placeholder="Observaciones"
                  className="text-muted-foreground"
                  onSave={(v) => editar({ op: 'item.editar', id: d.item.id, data: { observaciones: v } })}
                />
              </div>
            </DialogHeader>

            <div className="grid grid-cols-3 gap-2">
              <Kpi label="Cantidad" value={`${fmtNum(d.cantidad)} ${d.item.unidad ?? ''}`} />
              <Kpi label="Precio unitario" value={fmtARS(d.puTotal)} />
              <Kpi label="Subtotal" value={fmtARS(d.subtotal)} accent />
            </div>

            <Analisis d={d} presupuestoId={presupuestoId} editar={editar} />
            <Mediciones d={d} editar={editar} />

            <div className="flex justify-end border-t border-border pt-3">
              <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={eliminarItem}>
                <Trash2 className="mr-1.5 h-4 w-4" />
                Eliminar ítem
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

type Editar = ReturnType<typeof useEditar>

function BotonBorrar({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="rounded p-1.5 text-muted-foreground opacity-0 transition hover:bg-destructive/10 hover:text-destructive focus:opacity-100 group-hover:opacity-100"
    >
      <Trash2 className="h-3.5 w-3.5" />
    </button>
  )
}

/* ------------------------------------------------------------------ */
/* Análisis de precio unitario                                          */
/* ------------------------------------------------------------------ */

function Analisis({ d, presupuestoId, editar }: { d: ItemDetalle; presupuestoId: string; editar: Editar }) {
  return (
    <section className="space-y-2">
      <div className="flex items-end justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold">Análisis de precio unitario</h3>
          <p className="text-xs text-muted-foreground">Cuánto de cada insumo lleva una unidad ({d.item.unidad || 'unidad'}) del ítem.</p>
        </div>
        <AgregarInsumo
          presupuestoId={presupuestoId}
          yaUsados={new Set(d.apu.map((l) => l.insumoId))}
          onElegir={(insumoId) => editar({ op: 'apu.crear', data: { itemId: d.item.id, insumoId, cantidad: 0 } })}
        />
      </div>
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full min-w-[680px] text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className={th}>Tipo</th>
              <th className={th}>Insumo</th>
              <th className={th}>Un.</th>
              <th className={cn(th, 'w-32 text-right')}>Cantidad</th>
              <th className={cn(th, 'text-right')}>Precio</th>
              <th className={cn(th, 'text-right')}>Parcial</th>
              <th className="w-8" />
            </tr>
          </thead>
          <tbody>
            {d.apu.map((l) => (
              <tr key={l.id} className="group border-t border-border/60">
                <td className={td}><TipoBadge tipo={l.tipo} /></td>
                <td className={td}>
                  {l.descripcion}
                  <span className="ml-1.5 text-xs text-muted-foreground">{l.codigo}</span>
                </td>
                <td className={td}>{l.unidad ?? '–'}</td>
                <td className={tdEdit}>
                  <CampoNumero
                    value={l.cantidad}
                    vacioPermitido={false}
                    ariaLabel={`Cantidad de ${l.descripcion}`}
                    onSave={(v) => editar({ op: 'apu.editar', id: l.id, data: { cantidad: v! } })}
                  />
                </td>
                <td className={cn(td, num)}>{fmtARS(l.precioCalculo)}</td>
                <td className={cn(td, num)}>{fmtARS(l.parcial)}</td>
                <td className="pr-1 text-right">
                  <BotonBorrar label="Quitar insumo" onClick={() => editar({ op: 'apu.eliminar', id: l.id })} />
                </td>
              </tr>
            ))}
            {d.apu.length === 0 && (
              <tr>
                <td colSpan={7} className="py-6 text-center text-sm text-muted-foreground">
                  Sin análisis de precio: el precio unitario es $ 0. Agregá insumos con el botón de arriba.
                </td>
              </tr>
            )}
          </tbody>
          {d.apu.length > 0 && (
            <tfoot className="bg-muted/30 text-sm">
              {TIPOS_INSUMO.filter((t) => d.puPorTipo[t]).map((t) => (
                <tr key={t} className="border-t border-border/60">
                  <td className={td} colSpan={5}>{NOMBRES_TIPO[t]}</td>
                  <td className={cn(td, num)}>{fmtARS(d.puPorTipo[t])}</td>
                  <td />
                </tr>
              ))}
              <tr className="border-t border-border font-semibold">
                <td className={td} colSpan={5}>Costo unitario</td>
                <td className={cn(td, num)}>{fmtARS(d.puTotal)}</td>
                <td />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </section>
  )
}

function AgregarInsumo({
  presupuestoId,
  yaUsados,
  onElegir,
}: {
  presupuestoId: string
  yaUsados: Set<string>
  onElegir: (insumoId: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [insumos, setInsumos] = useState<InsumoFila[] | null>(null)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    api
      .fetchPresupuestoInsumos(presupuestoId)
      .then((r) => !cancelled && setInsumos(r))
      .catch(() => !cancelled && toast.error('No se pudieron cargar los insumos'))
    return () => {
      cancelled = true
    }
  }, [open, presupuestoId])

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm">
          <Plus className="mr-1 h-4 w-4" />
          Agregar insumo
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 p-0">
        <Command>
          <CommandInput placeholder="Buscar insumo o código…" />
          <CommandList className="max-h-80">
            {!insumos ? (
              <div className="flex justify-center py-6">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <>
                <CommandEmpty>Ningún insumo coincide. Crealo en la pestaña Insumos.</CommandEmpty>
                {TIPOS_INSUMO.map((t) => {
                  const lista = insumos.filter((i) => i.tipo === t)
                  if (!lista.length) return null
                  return (
                    <CommandGroup key={t} heading={NOMBRES_TIPO[t]}>
                      {lista.map((i) => (
                        <CommandItem
                          key={i.id}
                          value={`${i.codigo} ${i.descripcion}`}
                          disabled={yaUsados.has(i.id)}
                          onSelect={() => {
                            setOpen(false)
                            onElegir(i.id)
                          }}
                          className="flex items-center gap-2"
                        >
                          <span className="min-w-0 flex-1 truncate">{i.descripcion}</span>
                          <span className="shrink-0 text-xs text-muted-foreground">
                            {i.codigo} · {fmtARS(i.precioCalculo)}/{i.unidad ?? 'u'}
                          </span>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  )
                })}
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

/* ------------------------------------------------------------------ */
/* Cómputo métrico                                                      */
/* ------------------------------------------------------------------ */

const FACTORES = [
  { k: 'cant', label: 'Cant.' },
  { k: 'largo', label: 'Largo' },
  { k: 'ancho', label: 'Ancho' },
  { k: 'alto', label: 'Alto' },
  { k: 'coef', label: 'Coef.' },
] as const

function Mediciones({ d, editar }: { d: ItemDetalle; editar: Editar }) {
  return (
    <section className="space-y-2">
      <div className="flex items-end justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold">Cómputo métrico</h3>
          <p className="text-xs text-muted-foreground">Parcial = Cant. × Largo × Ancho × Alto × Coef. Los vacíos no cuentan.</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => editar({ op: 'medicion.crear', data: { itemId: d.item.id, cant: 1 } })}
        >
          <Plus className="mr-1 h-4 w-4" />
          Agregar medición
        </Button>
      </div>
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full min-w-[820px] text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className={cn(th, 'w-40')}>Sector</th>
              <th className={th}>Medición / criterio</th>
              {FACTORES.map((f) => (
                <th key={f.k} className={cn(th, 'w-20 text-right')}>{f.label}</th>
              ))}
              <th className={cn(th, 'text-right')}>Parcial</th>
              <th className="w-8" />
            </tr>
          </thead>
          <tbody>
            {d.mediciones.map((m) => (
              <tr key={m.id} className="group border-t border-border/60">
                <td className={tdEdit}>
                  <CampoTexto
                    value={m.sector}
                    placeholder="Sector"
                    onSave={(v) => editar({ op: 'medicion.editar', id: m.id, data: { sector: v } })}
                  />
                </td>
                <td className={tdEdit}>
                  <CampoTexto
                    value={m.criterio}
                    placeholder="Criterio"
                    onSave={(v) => editar({ op: 'medicion.editar', id: m.id, data: { criterio: v } })}
                  />
                </td>
                {FACTORES.map((f) => (
                  <td key={f.k} className={tdEdit}>
                    <CampoNumero
                      value={m[f.k]}
                      ariaLabel={f.label}
                      onSave={(v) => editar({ op: 'medicion.editar', id: m.id, data: { [f.k]: v } })}
                    />
                  </td>
                ))}
                <td className={cn(td, num, 'font-medium')}>{fmtNum(m.parcial)}</td>
                <td className="pr-1 text-right">
                  <BotonBorrar label="Eliminar medición" onClick={() => editar({ op: 'medicion.eliminar', id: m.id })} />
                </td>
              </tr>
            ))}
            {d.mediciones.length === 0 && (
              <tr>
                <td colSpan={9} className="py-6 text-center text-sm text-muted-foreground">
                  Sin mediciones: la cantidad es 0. Agregá una con el botón de arriba.
                </td>
              </tr>
            )}
          </tbody>
          {d.mediciones.length > 0 && (
            <tfoot className="bg-muted/30">
              <tr className="border-t border-border font-semibold">
                <td className={td} colSpan={7}>Cantidad total</td>
                <td className={cn(td, num)}>
                  {fmtNum(d.cantidad)} {d.item.unidad ?? ''}
                </td>
                <td />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </section>
  )
}
