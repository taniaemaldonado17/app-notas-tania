'use client'

import { Fragment, useMemo, useState } from 'react'
import { AlertTriangle, CircleCheck, CircleX, Pencil, Plus, Search, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { FACTORES_MEDICION, precioVenta } from '@/lib/presupuesto/calculo'
import { fmtARS, fmtNum, fmtNumFino, fmtPct, fmtUSD } from '@/lib/presupuesto/format'
import { derivarItem, verificar } from '@/lib/presupuesto/local'
import { cn } from '@/lib/utils'
import { CampoNumero, CampoTexto, Kpi, num, td, tdEdit, th, TipoBadge, useEditar } from './campos'
import { usePresupuesto } from './presupuesto-context'

/** Accent-insensitive search: "medicion" finds "Medición". */
const normal = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

function Buscador({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <label className="flex h-9 w-full items-center gap-2 rounded-lg border border-border bg-background px-3 text-sm sm:w-72">
      <Search className="h-4 w-4 text-muted-foreground" />
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="min-w-0 flex-1 bg-transparent outline-none" />
    </label>
  )
}

function Encabezado({ titulo, texto, children }: { titulo: string; texto: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="max-w-3xl">
        <h1 className="text-2xl font-bold">{titulo}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{texto}</p>
      </div>
      {children}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Resumen: totales por rubro y precio de venta                         */
/* ------------------------------------------------------------------ */

export function ResumenTab({ onEditParams }: { onEditParams: () => void }) {
  const { detalle, vista } = usePresupuesto()
  const editar = useEditar()
  if (!detalle || !vista) return null
  const { info, calc } = detalle
  const v = precioVenta(calc.total, info)
  const coef = (campo: 'gastosGenerales' | 'beneficio' | 'impuestos', label: string) => (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm">{label}</span>
      <div className="flex w-32 items-center gap-1">
        <CampoNumero
          value={Math.round(info[campo] * 1e6) / 1e4}
          vacioPermitido={false}
          ariaLabel={label}
          className="border-border"
          onSave={(x) => {
            if (x! < 0 || x! > 1000) return
            return editar({ op: 'parametros', data: { [campo]: x! / 100 } })
          }}
        />
        <span className="text-sm text-muted-foreground">%</span>
      </div>
    </div>
  )
  const linea = (label: string, valor: number, fuerte = false) => (
    <div className={cn('flex justify-between gap-3 text-sm', fuerte && 'border-t border-border pt-2 font-semibold')}>
      <span className={cn(!fuerte && 'text-muted-foreground')}>{label}</span>
      <span className="tabular-nums">{fmtARS(valor)}</span>
    </div>
  )

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-6">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold sm:text-3xl">{info.nombre}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {calc.rubros.length} rubros · {calc.cantidadItems} ítems · {vista.insumos.length} insumos
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={onEditParams} className="shrink-0 text-muted-foreground">
          <Pencil className="mr-1.5 h-3.5 w-3.5" />
          Datos y parámetros
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Costo-costo" value={fmtARS(calc.total)} accent />
        <Kpi label="En dólares" value={fmtUSD(calc.totalUsd)} />
        <Kpi label="Coeficiente de pase" value={fmtNumFino(v.coeficiente || 1)} />
        <Kpi label="Precio de venta" value={fmtARS(v.precio)} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_22rem]">
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full min-w-[520px] text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className={th}>Rubro</th>
                <th className={th}>Descripción</th>
                <th className={cn(th, 'text-right')}>Costo-costo</th>
                <th className={cn(th, 'text-right')}>Incid.</th>
                <th className={cn(th, 'w-24')} />
              </tr>
            </thead>
            <tbody>
              {calc.rubros.map((r) => (
                <tr key={r.id} className="border-t border-border/60">
                  <td className={cn(td, 'font-medium')}>{r.numero}</td>
                  <td className={td}>{r.descripcion}</td>
                  <td className={cn(td, num)}>{fmtARS(r.total)}</td>
                  <td className={cn(td, num, 'text-muted-foreground')}>{fmtPct(r.incidencia)}</td>
                  <td className={cn(td, 'align-middle')}>
                    <span className="block h-1.5 overflow-hidden rounded-full bg-muted">
                      <span className="block h-full rounded-full bg-primary" style={{ width: `${Math.max(r.incidencia * 100, 1)}%` }} />
                    </span>
                  </td>
                </tr>
              ))}
              <tr className="border-t border-border bg-muted/40 font-semibold">
                <td className={td} />
                <td className={td}>Total costo-costo</td>
                <td className={cn(td, num)}>{fmtARS(calc.total)}</td>
                <td className={cn(td, num)}>100,00%</td>
                <td className={td} />
              </tr>
            </tbody>
          </table>
        </div>

        <div className="space-y-3 rounded-xl border border-border bg-card p-4">
          <h2 className="font-semibold">Precio de venta</h2>
          {coef('gastosGenerales', 'Gastos generales')}
          {coef('beneficio', 'Beneficio')}
          {coef('impuestos', 'Impuestos (IVA, IIBB)')}
          <div className="space-y-1.5 border-t border-border pt-3">
            {linea('Costo-costo', calc.total)}
            {linea('Gastos generales', v.gastosGenerales)}
            {linea('Beneficio', v.beneficio)}
            {linea('Impuestos', v.impuestos)}
            {linea('Precio de venta', v.precio, true)}
          </div>
          <p className="text-xs text-muted-foreground">Costo-costo × (1 + GG) × (1 + beneficio) × (1 + impuestos).</p>
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Análisis de precios: un bloque por ítem                              */
/* ------------------------------------------------------------------ */

export function AnalisisTab({ onOpenItem }: { onOpenItem: (id: string) => void }) {
  const { detalle, vista } = usePresupuesto()
  const [q, setQ] = useState('')
  const bloques = useMemo(() => {
    if (!detalle || !vista) return []
    const t = normal(q.trim())
    return detalle.calc.rubros
      .flatMap((r) => r.items)
      .filter((i) => !t || normal(`${i.codigo} ${i.descripcion}`).includes(t))
      .map((i) => derivarItem(vista, i.id)!)
      .filter(Boolean)
  }, [detalle, vista, q])
  if (!detalle) return null

  return (
    <div className="mx-auto max-w-6xl space-y-4 px-4 py-6 sm:px-6">
      <Encabezado titulo="Análisis de precios" texto="Un análisis por ítem, en el orden del presupuesto. Tocá un ítem para editar sus insumos y rendimientos.">
        <Buscador value={q} onChange={setQ} placeholder="Buscar ítem o código" />
      </Encabezado>
      {bloques.map((d) => (
        <section key={d.item.id} className="overflow-hidden rounded-xl border border-border bg-card">
          <button
            type="button"
            onClick={() => onOpenItem(d.item.id)}
            className="flex w-full flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-border bg-muted/40 px-4 py-2.5 text-left transition hover:bg-accent/40"
          >
            <span className="font-semibold text-primary">{d.item.codigo}</span>
            <span className="min-w-0 flex-1 font-medium">{d.item.descripcion}</span>
            <span className="text-xs text-muted-foreground">por {d.item.unidad || 'unidad'}</span>
            <span className="font-semibold tabular-nums">{fmtARS(d.puTotal)}</span>
          </button>
          {d.apu.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <tbody>
                  {d.apu.map((l) => (
                    <tr key={l.id} className="border-b border-border/50 last:border-b-0">
                      <td className={cn(td, 'w-14')}><TipoBadge tipo={l.tipo} /></td>
                      <td className={td}>
                        {l.descripcion} <span className="text-xs text-muted-foreground">{l.codigo}</span>
                      </td>
                      <td className={cn(td, num)}>
                        {fmtNumFino(l.cantidad)} {l.unidad ?? ''}
                      </td>
                      <td className={cn(td, num, 'text-muted-foreground')}>{fmtARS(l.precioCalculo)}</td>
                      <td className={cn(td, num)}>{fmtARS(l.parcial)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="px-4 py-3 text-sm text-amber-600 dark:text-amber-400">Sin insumos: el precio unitario es $ 0.</p>
          )}
          <div className="flex flex-wrap gap-x-5 gap-y-1 px-4 py-2 text-xs text-muted-foreground">
            <span>Materiales {fmtARS(d.puPorTipo.MAT)}</span>
            <span>Mano de obra {fmtARS(d.puPorTipo.MO)}</span>
            <span>Equipos y subcontratos {fmtARS(d.puPorTipo.EQ + d.puPorTipo.SUB)}</span>
          </div>
        </section>
      ))}
      {!bloques.length && <p className="py-10 text-center text-sm text-muted-foreground">Ningún ítem coincide.</p>}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Cómputo métrico: todas las mediciones, editables                     */
/* ------------------------------------------------------------------ */

const ETIQUETAS: Record<(typeof FACTORES_MEDICION)[number], string> = {
  cant: 'Cant.',
  largo: 'Largo',
  ancho: 'Ancho',
  alto: 'Alto',
  coef: 'Coef.',
}

export function ComputoTab({ onOpenItem }: { onOpenItem: (id: string) => void }) {
  const { detalle, vista } = usePresupuesto()
  const editar = useEditar()
  const [q, setQ] = useState('')
  const [rubro, setRubro] = useState('')

  const porItem = useMemo(() => {
    const m = new Map<string, NonNullable<typeof vista>['mediciones']>()
    for (const x of [...(vista?.mediciones ?? [])].sort((a, b) => a.position - b.position)) {
      m.set(x.itemId, [...(m.get(x.itemId) ?? []), x])
    }
    return m
  }, [vista])
  if (!detalle) return null
  const t = normal(q.trim())
  const rubros = detalle.calc.rubros
    .filter((r) => !rubro || r.id === rubro)
    .map((r) => ({ ...r, items: r.items.filter((i) => !t || normal(`${i.codigo} ${i.descripcion}`).includes(t)) }))
    .filter((r) => r.items.length)

  return (
    <div className="mx-auto max-w-7xl space-y-4 px-4 py-6 sm:px-6">
      <Encabezado
        titulo="Cómputo métrico"
        texto="Parcial = Cant. × Largo × Ancho × Alto × Coef. (los vacíos no cuentan). La cantidad de cada ítem es la suma de sus parciales y se recalcula al escribir."
      >
        <div className="flex w-full flex-wrap gap-2 sm:w-auto">
          <select
            value={rubro}
            onChange={(e) => setRubro(e.target.value)}
            aria-label="Rubro"
            className="h-9 min-w-0 flex-1 rounded-lg border border-border bg-background px-2 text-sm sm:w-56 sm:flex-none"
          >
            <option value="">Todos los rubros</option>
            {detalle.calc.rubros.map((r) => (
              <option key={r.id} value={r.id}>
                {r.numero} · {r.descripcion}
              </option>
            ))}
          </select>
          <Buscador value={q} onChange={setQ} placeholder="Buscar ítem o código" />
        </div>
      </Encabezado>

      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="sticky top-0 z-10 bg-muted">
            <tr>
              <th className={cn(th, 'w-24 lg:w-32')}>Sector</th>
              <th className={th}>Medición / criterio</th>
              {FACTORES_MEDICION.map((f) => (
                <th key={f} className={cn(th, 'w-[4.5rem] text-right lg:w-24')}>{ETIQUETAS[f]}</th>
              ))}
              <th className={cn(th, 'w-24 text-right')}>Parcial</th>
              <th className="w-9" />
            </tr>
          </thead>
          <tbody>
            {rubros.map((r) => (
              <Fragment key={r.id}>
                <tr className="bg-muted/60">
                  <td colSpan={9} className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wide">
                    {r.numero} · {r.descripcion}
                  </td>
                </tr>
                {r.items.map((it) => {
                  const meds = porItem.get(it.id) ?? []
                  return (
                    <Fragment key={it.id}>
                      <tr className="border-t border-border">
                        <td colSpan={6} className="px-3 pb-1 pt-2.5">
                          <button type="button" onClick={() => onOpenItem(it.id)} className="text-left hover:underline">
                            <span className="font-semibold text-primary">{it.codigo}</span> <span className="font-medium">{it.descripcion}</span>
                          </button>
                        </td>
                        <td colSpan={3} className={cn(num, 'px-3 pb-1 pt-2.5 font-semibold')}>
                          {fmtNum(it.cantidad)} {it.unidad ?? ''}
                        </td>
                      </tr>
                      {meds.map((m) => (
                        <tr key={m.id} className="group">
                          <td className={tdEdit}>
                            <CampoTexto value={m.sector} placeholder="Sector" onSave={(v) => editar({ op: 'medicion.editar', id: m.id, data: { sector: v } })} />
                          </td>
                          <td className={tdEdit}>
                            <CampoTexto value={m.criterio} placeholder="Criterio" onSave={(v) => editar({ op: 'medicion.editar', id: m.id, data: { criterio: v } })} />
                          </td>
                          {FACTORES_MEDICION.map((f) => (
                            <td key={f} className={tdEdit}>
                              <CampoNumero
                                value={m[f]}
                                ariaLabel={`${ETIQUETAS[f]} de ${it.codigo}`}
                                onSave={(v) => editar({ op: 'medicion.editar', id: m.id, data: { [f]: v } })}
                              />
                            </td>
                          ))}
                          <td className={cn(td, num, 'text-muted-foreground')}>{fmtNum(parcial(m))}</td>
                          <td className="pr-1 text-right">
                            <button
                              type="button"
                              onClick={() => editar({ op: 'medicion.eliminar', id: m.id })}
                              aria-label={`Eliminar medición de ${it.codigo}`}
                              title="Eliminar medición"
                              className="rounded p-1.5 text-muted-foreground opacity-0 transition hover:bg-destructive/10 hover:text-destructive focus:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                      <tr>
                        <td colSpan={9} className="px-2 pb-2">
                          <button
                            type="button"
                            onClick={() => editar({ op: 'medicion.crear', data: { itemId: it.id, cant: 1 } })}
                            className={cn(
                              'flex items-center gap-1 rounded px-1.5 py-1 text-xs hover:bg-accent hover:text-foreground',
                              meds.length ? 'text-muted-foreground' : 'text-amber-600 dark:text-amber-400'
                            )}
                          >
                            <Plus className="h-3.5 w-3.5" />
                            {meds.length ? 'Medición' : 'Sin mediciones (cantidad 0): agregar medición'}
                          </button>
                        </td>
                      </tr>
                    </Fragment>
                  )
                })}
              </Fragment>
            ))}
            {!rubros.length && (
              <tr>
                <td colSpan={9} className="py-10 text-center text-muted-foreground">Ningún ítem coincide.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function parcial(m: Record<(typeof FACTORES_MEDICION)[number], number | null>) {
  const f = FACTORES_MEDICION.map((k) => m[k]).filter((v): v is number => v !== null)
  return f.length ? f.reduce((a, b) => a * b, 1) : 0
}

/* ------------------------------------------------------------------ */
/* Verificación                                                         */
/* ------------------------------------------------------------------ */

export function VerificacionTab({ onOpenItem }: { onOpenItem: (id: string) => void }) {
  const { vista } = usePresupuesto()
  const chequeos = useMemo(() => (vista ? verificar(vista) : []), [vista])
  const sinUsar = useMemo(() => {
    if (!vista) return 0
    const usados = new Set(vista.apu.map((l) => l.insumoId))
    return vista.insumos.filter((i) => !usados.has(i.id)).length
  }, [vista])
  if (!vista) return null
  const errores = chequeos.filter((c) => c.nivel === 'error').length
  const avisos = chequeos.length - errores

  return (
    <div className="mx-auto max-w-5xl space-y-5 px-4 py-6 sm:px-6">
      <Encabezado
        titulo="Verificación"
        texto="Revisa que cada ítem tenga análisis de precios y mediciones antes de exportar o de armar el contrato para certificar."
      />
      <div className="grid grid-cols-3 gap-3">
        <Kpi label="Errores" value={String(errores)} accent={errores > 0} />
        <Kpi label="Avisos" value={String(avisos)} />
        <Kpi label="Insumos sin usar" value={String(sinUsar)} />
      </div>
      {chequeos.length ? (
        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
          {chequeos.map((c, k) => (
            <li key={k} className="flex items-start gap-3 px-4 py-2.5 text-sm">
              {c.nivel === 'error' ? (
                <CircleX className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
              ) : (
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
              )}
              <span className="flex-1">{c.texto}</span>
              {c.itemId && (
                <button type="button" onClick={() => onOpenItem(c.itemId!)} className="shrink-0 text-xs font-medium text-primary hover:underline">
                  Abrir ficha
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-border bg-card py-10 text-center">
          <CircleCheck className="h-8 w-8 text-emerald-500" />
          <p className="font-medium">Todo en orden</p>
          <p className="text-sm text-muted-foreground">Cada ítem tiene análisis de precios y cantidad.</p>
        </div>
      )}
      {sinUsar > 0 && (
        <p className="text-xs text-muted-foreground">Los insumos sin usar no afectan el total: quedan como lista de precios.</p>
      )}
    </div>
  )
}
