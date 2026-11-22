'use client'

import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Loader2, Plus, Trash2 } from 'lucide-react'
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Button } from '@/components/ui/button'
import * as api from '@/lib/api'
import { compararCurvas } from '@/lib/certificacion/calculo'
import type { ContratoData } from '@/lib/certificacion/types'
import { fmtInput, fmtPct, parseNumeroAR } from '@/lib/presupuesto/format'
import { cn } from '@/lib/utils'
import { num, td, th } from '@/components/presupuesto/campos'

type Fila = { periodo: string; pct: string }

const PLAN = 'var(--chart-1, #2a78d6)'
const REAL = 'var(--chart-2, #eb6834)'

/** Planned vs certified cumulative progress, plus the editable plan. */
export function CurvaAvance({ presupuestoId, contrato, onSaved }: { presupuestoId: string; contrato: ContratoData; onSaved: () => void }) {
  const inicial = useMemo(
    () => contrato.curva.map((p) => ({ periodo: p.periodo, pct: fmtInput(Math.round(p.porcentajeAcumulado * 1e6) / 1e4) })),
    [contrato.curva]
  )
  const [filas, setFilas] = useState<Fila[]>(inicial)
  const [guardando, setGuardando] = useState(false)
  useEffect(() => setFilas(inicial), [inicial])
  const sucio = JSON.stringify(filas) !== JSON.stringify(inicial)

  const puntos = useMemo(() => compararCurvas(contrato.curva, contrato.certificados), [contrato.curva, contrato.certificados])
  const datos = [
    { nombre: 'Inicio', plan: 0, real: 0 },
    ...puntos.map((p) => ({
      nombre: p.periodo ?? `N° ${p.orden}`,
      plan: p.planificado === null ? undefined : Math.round(p.planificado * 10000) / 100,
      real: p.real === null ? undefined : Math.round(p.real * 10000) / 100,
    })),
  ]

  async function guardar() {
    const out: { periodo: string; porcentajeAcumulado: number }[] = []
    let previo = 0
    for (const [i, f] of filas.entries()) {
      const v = parseNumeroAR(f.pct)
      if (!f.periodo.trim()) return toast.error(`Fila ${i + 1}: falta el nombre del período`)
      if (v === null || Number.isNaN(v) || v < 0 || v > 100) return toast.error(`Fila ${i + 1}: el % acumulado va de 0 a 100`)
      if (v / 100 < previo - 1e-9) return toast.error(`Fila ${i + 1}: el % acumulado no puede bajar respecto del período anterior`)
      previo = v / 100
      out.push({ periodo: f.periodo.trim(), porcentajeAcumulado: v / 100 })
    }
    setGuardando(true)
    try {
      await api.certificacionOp(presupuestoId, { op: 'curva.guardar', data: { puntos: out } })
      toast.success('Plan de trabajo guardado')
      onSaved()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo guardar el plan')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Curva de avance</h2>
        <p className="text-sm text-muted-foreground">
          El período N del plan se compara con el certificado N. Cargá el % acumulado previsto en el plan de trabajo.
        </p>
      </div>

      <div className="rounded-xl border border-border bg-card p-3">
        {puntos.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">Cargá el plan de trabajo o emití un certificado para ver la curva.</p>
        ) : (
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={datos} margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="nombre" tick={{ fontSize: 12 }} stroke="var(--muted-foreground)" />
                <YAxis domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={{ fontSize: 12 }} stroke="var(--muted-foreground)" width={44} />
                <Tooltip
                  formatter={(v: number, n: string) => [`${String(v).replace('.', ',')} %`, n]}
                  contentStyle={{ background: 'var(--popover)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line type="monotone" dataKey="plan" name="Plan de trabajo" stroke={PLAN} strokeWidth={2} strokeDasharray="6 4" dot={{ r: 3 }} connectNulls />
                <Line type="monotone" dataKey="real" name="Certificado" stroke={REAL} strokeWidth={2.5} dot={{ r: 4 }} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-2">
          <h3 className="text-sm font-semibold">Plan de trabajo</h3>
          <div className="overflow-hidden rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className={cn(th, 'w-10')}>N°</th>
                  <th className={th}>Período</th>
                  <th className={cn(th, 'w-36 text-right')}>% acumulado</th>
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody>
                {filas.map((f, i) => (
                  <tr key={i} className="group border-t border-border/60">
                    <td className={cn(td, 'text-muted-foreground')}>{i + 1}</td>
                    <td className="px-1 py-1">
                      <input
                        value={f.periodo}
                        onChange={(e) => setFilas(filas.map((x, j) => (j === i ? { ...x, periodo: e.target.value } : x)))}
                        placeholder={`Mes ${i + 1}`}
                        className="h-8 w-full rounded-md border border-transparent bg-transparent px-2 outline-none hover:border-border focus:border-primary"
                      />
                    </td>
                    <td className="px-1 py-1">
                      <div className="flex items-center gap-1">
                        <input
                          value={f.pct}
                          inputMode="decimal"
                          onChange={(e) => setFilas(filas.map((x, j) => (j === i ? { ...x, pct: e.target.value } : x)))}
                          className="h-8 w-full rounded-md border border-transparent bg-transparent px-2 text-right tabular-nums outline-none hover:border-border focus:border-primary"
                        />
                        <span className="text-xs text-muted-foreground">%</span>
                      </div>
                    </td>
                    <td className="pr-1">
                      <button
                        type="button"
                        aria-label="Quitar período"
                        onClick={() => setFilas(filas.filter((_, j) => j !== i))}
                        className="rounded p-1.5 text-muted-foreground opacity-0 hover:text-destructive group-hover:opacity-100 [@media(hover:none)]:opacity-100"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button
              type="button"
              onClick={() => setFilas([...filas, { periodo: `Mes ${filas.length + 1}`, pct: filas[filas.length - 1]?.pct ?? '' }])}
              className="flex w-full items-center gap-2 border-t border-border px-3 py-2 text-sm text-muted-foreground hover:bg-accent/40 hover:text-foreground"
            >
              <Plus className="h-4 w-4" />
              Agregar período
            </button>
          </div>
          <div className="flex justify-end gap-2">
            {sucio && (
              <Button variant="ghost" size="sm" onClick={() => setFilas(inicial)}>
                Descartar
              </Button>
            )}
            <Button size="sm" onClick={guardar} disabled={!sucio || guardando}>
              {guardando && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              Guardar plan
            </Button>
          </div>
        </div>

        <div className="space-y-2">
          <h3 className="text-sm font-semibold">Plan contra certificado</h3>
          <div className="overflow-hidden rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className={th}>Período</th>
                  <th className={cn(th, 'text-right')}>Plan</th>
                  <th className={cn(th, 'text-right')}>Real</th>
                  <th className={cn(th, 'text-right')}>Desvío</th>
                </tr>
              </thead>
              <tbody>
                {puntos.map((p) => (
                  <tr key={p.orden} className="border-t border-border/60">
                    <td className={td}>
                      {p.periodo ?? `N° ${p.orden}`}
                      {p.numeroCertificado && <span className="ml-1.5 text-xs text-muted-foreground">cert. {p.numeroCertificado}</span>}
                    </td>
                    <td className={cn(td, num)}>{fmtPct(p.planificado)}</td>
                    <td className={cn(td, num)}>{fmtPct(p.real)}</td>
                    <td
                      className={cn(
                        td,
                        num,
                        'font-medium',
                        p.desvio !== null && p.desvio < -1e-9 && 'text-destructive',
                        p.desvio !== null && p.desvio > 1e-9 && 'text-green-600 dark:text-green-400'
                      )}
                    >
                      {p.desvio === null ? '–' : `${p.desvio > 0 ? '+' : ''}${fmtPct(p.desvio)}`}
                    </td>
                  </tr>
                ))}
                {puntos.length === 0 && (
                  <tr>
                    <td colSpan={4} className="py-6 text-center text-muted-foreground">Sin datos todavía.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  )
}
