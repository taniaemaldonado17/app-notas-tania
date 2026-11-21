'use client'

import { Fragment, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Loader2, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import * as api from '@/lib/api'
import { calcularCertificado, type Antecedente } from '@/lib/certificacion/calculo'
import type { ContratoData } from '@/lib/certificacion/types'
import { fmtARS, fmtInput, fmtNum, fmtPct, parseNumeroAR } from '@/lib/presupuesto/format'
import { cn } from '@/lib/utils'
import { num, td, th } from '@/components/presupuesto/campos'

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']

export function hoyISO() {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/** "2026-11-21" → "Noviembre 2026" */
export function periodoDe(fecha: string) {
  const [y, m] = fecha.split('-').map(Number)
  return y && m ? `${MESES[m - 1]} ${y}` : ''
}

type Modo = 'cantidad' | 'porcentaje'

export type FormCertificado =
  | { tipo: 'nuevo'; numero: number; antecedente: Antecedente }
  | {
      tipo: 'rectificar'
      id: string
      numero: number
      antecedente: Antecedente
      fecha: string
      periodo: string | null
      presentes: Record<string, number>
    }

/** Load the period's progress per item; live preview; issue or rectify. */
export function CertificadoForm({
  presupuestoId,
  contrato,
  form,
  onClose,
  onSaved,
}: {
  presupuestoId: string
  contrato: ContratoData
  form: FormCertificado | null
  onClose: () => void
  onSaved: () => void
}) {
  return (
    <Dialog open={form !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex h-[94dvh] max-h-[94dvh] flex-col gap-0 p-0 sm:max-w-6xl">
        {form && <Cuerpo key={form.tipo + form.numero} presupuestoId={presupuestoId} contrato={contrato} form={form} onClose={onClose} onSaved={onSaved} />}
      </DialogContent>
    </Dialog>
  )
}

function Cuerpo({
  presupuestoId,
  contrato,
  form,
  onClose,
  onSaved,
}: {
  presupuestoId: string
  contrato: ContratoData
  form: FormCertificado
  onClose: () => void
  onSaved: () => void
}) {
  const inicialPresentes = form.tipo === 'rectificar' ? form.presentes : {}
  const [presentes, setPresentes] = useState<Record<string, number>>(inicialPresentes)
  const [modo, setModo] = useState<Modo>('cantidad')
  const [textos, setTextos] = useState<Record<string, string>>({})
  const [fecha, setFecha] = useState(form.tipo === 'rectificar' ? form.fecha : hoyISO())
  const [periodo, setPeriodo] = useState(form.tipo === 'rectificar' ? (form.periodo ?? '') : periodoDe(hoyISO()))
  const [q, setQ] = useState('')
  const [soloConAvance, setSoloConAvance] = useState(false)
  const [guardando, setGuardando] = useState(false)

  const anterior = (id: string) => form.antecedente?.acumuladoPorItem[id] ?? 0
  const porCantidad = (cantidad: number) => modo === 'cantidad' && cantidad > 0

  /** What the input shows for a fraction, in the current mode. */
  const mostrar = (frac: number | undefined, cantidad: number) =>
    frac === undefined || frac === 0
      ? ''
      : porCantidad(cantidad)
        ? fmtInput(Math.round(frac * cantidad * 1e4) / 1e4)
        : fmtInput(Math.round(frac * 100 * 1e4) / 1e4)

  function cambiarModo(m: Modo) {
    setModo(m)
    setTextos({}) // inputs re-derive from the fractions
  }

  function escribir(id: string, cantidad: number, texto: string) {
    setTextos((t) => ({ ...t, [id]: texto }))
    const v = parseNumeroAR(texto)
    setPresentes((p) => {
      const n = { ...p }
      if (v === null || Number.isNaN(v)) delete n[id]
      else n[id] = porCantidad(cantidad) ? v / cantidad : v / 100
      return n
    })
  }

  function completar(id: string) {
    const resto = Math.max(0, 1 - anterior(id))
    setPresentes((p) => ({ ...p, [id]: resto }))
    setTextos((t) => {
      const n = { ...t }
      delete n[id]
      return n
    })
  }

  const invalidos = Object.entries(textos).filter(([, t]) => t.trim() && Number.isNaN(parseNumeroAR(t) as number))

  const calc = useMemo(() => {
    try {
      return { ok: calcularCertificado(contrato, contrato.items, form.antecedente, presentes), error: null }
    } catch (err) {
      return { ok: null, error: (err as Error).message }
    }
  }, [contrato, form.antecedente, presentes])

  const lineaPorItem = useMemo(() => new Map(calc.ok?.lineas.map((l) => [l.contratoItemId, l]) ?? []), [calc.ok])

  const grupos = useMemo(() => {
    const t = q.trim().toLowerCase()
    const out: { numero: number; descripcion: string; items: ContratoData['items'] }[] = []
    for (const it of contrato.items) {
      if (soloConAvance && !presentes[it.id]) continue
      if (t && !`${it.codigo} ${it.descripcion}`.toLowerCase().includes(t)) continue
      let g = out[out.length - 1]
      if (!g || g.numero !== it.rubroNumero) {
        g = { numero: it.rubroNumero, descripcion: it.rubroDescripcion, items: [] }
        out.push(g)
      }
      g.items.push(it)
    }
    return out
  }, [contrato.items, q, soloConAvance, presentes])

  async function emitir() {
    if (!calc.ok) return
    if (invalidos.length) return toast.error('Hay valores que no son números válidos')
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return toast.error('Elegí la fecha del certificado')
    const cargados = Object.fromEntries(Object.entries(presentes).filter(([, v]) => v !== 0))
    if (form.tipo === 'nuevo' && Object.keys(cargados).length === 0) {
      return toast.error('Cargá el avance de al menos un ítem')
    }
    const accion = form.tipo === 'nuevo' ? `emitir el certificado N° ${form.numero}` : `rectificar el certificado N° ${form.numero}`
    if (!window.confirm(`¿Confirmás ${accion} por un neto de ${fmtARS(calc.ok.montoNeto)}?`)) return
    setGuardando(true)
    try {
      const data = { fecha, periodo: periodo.trim() || null, presentes: cargados }
      await api.certificacionOp(
        presupuestoId,
        form.tipo === 'nuevo' ? { op: 'certificado.emitir', data } : { op: 'certificado.rectificar', id: form.id, data }
      )
      toast.success(form.tipo === 'nuevo' ? `Certificado N° ${form.numero} emitido` : `Certificado N° ${form.numero} rectificado`)
      onSaved()
      onClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo guardar el certificado', { duration: 10000 })
    } finally {
      setGuardando(false)
    }
  }

  return (
    <>
      <DialogHeader className="space-y-3 border-b border-border px-5 py-4 text-left">
        <div>
          <DialogTitle>
            {form.tipo === 'nuevo' ? 'Nuevo certificado' : 'Rectificar certificado'} N° {form.numero}
          </DialogTitle>
          <DialogDescription>
            Cargá el avance de este período por ítem, en {modo === 'cantidad' ? 'cantidades (en la unidad de cada ítem)' : 'porcentaje del ítem'}.
          </DialogDescription>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <label className="space-y-1 text-xs text-muted-foreground">
            Fecha
            <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className="h-9 w-40" />
          </label>
          <label className="space-y-1 text-xs text-muted-foreground">
            Período
            <Input value={periodo} onChange={(e) => setPeriodo(e.target.value)} placeholder="Noviembre 2026" className="h-9 w-44" />
          </label>
          <div className="space-y-1 text-xs text-muted-foreground">
            Cargar por
            <div className="flex h-9 rounded-lg bg-muted p-0.5 text-sm">
              {(['cantidad', 'porcentaje'] as Modo[]).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => cambiarModo(m)}
                  className={cn('rounded-md px-3 font-medium', modo === m ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground')}
                >
                  {m === 'cantidad' ? 'Cantidad' : '%'}
                </button>
              ))}
            </div>
          </div>
          <label className="flex h-9 min-w-48 flex-1 items-center gap-2 rounded-lg border border-border px-3 text-sm">
            <Search className="h-4 w-4 text-muted-foreground" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar ítem" className="min-w-0 flex-1 bg-transparent outline-none" />
          </label>
          <label className="flex h-9 items-center gap-2 text-sm">
            <input type="checkbox" checked={soloConAvance} onChange={(e) => setSoloConAvance(e.target.checked)} />
            Solo con avance
          </label>
        </div>
      </DialogHeader>

      <div className="notion-scroll min-h-0 flex-1 overflow-auto">
        <table className="w-full min-w-[1000px] text-sm">
          <thead className="sticky top-0 z-10 bg-background shadow-[0_1px_0_var(--border)]">
            <tr>
              <th className={th}>Ítem</th>
              <th className={th}>Descripción</th>
              <th className={cn(th, 'text-right')}>Cant. contrato</th>
              <th className={cn(th, 'text-right')}>Importe</th>
              <th className={cn(th, 'text-right')}>Anterior</th>
              <th className={cn(th, 'w-40 text-right')}>Presente</th>
              <th className={cn(th, 'text-right')}>Acumulado</th>
              <th className={cn(th, 'text-right')}>Importe presente</th>
            </tr>
          </thead>
          <tbody>
            {grupos.map((g) => (
              <Fragment key={g.numero}>
                <tr className="bg-muted/40">
                  <td colSpan={8} className="px-3 py-1.5 text-xs font-semibold">
                    {g.numero} · {g.descripcion}
                  </td>
                </tr>
                {g.items.map((it) => {
                  const linea = lineaPorItem.get(it.id)
                  const ant = anterior(it.id)
                  const completo = ant >= 1 - 1e-9
                  const acum = linea?.acumulado ?? ant + (presentes[it.id] ?? 0)
                  const texto = textos[it.id] ?? mostrar(presentes[it.id], it.cantidad)
                  return (
                    <tr key={it.id} className={cn('border-b border-border/50', presentes[it.id] && 'bg-primary/5')}>
                      <td className={cn(td, 'font-medium')}>{it.codigo}</td>
                      <td className={td}>{it.descripcion}</td>
                      <td className={cn(td, num)}>
                        {fmtNum(it.cantidad)} {it.unidad ?? ''}
                      </td>
                      <td className={cn(td, num, 'text-muted-foreground')}>{fmtARS(it.importe)}</td>
                      <td className={cn(td, num, 'text-muted-foreground')}>{fmtPct(ant)}</td>
                      <td className="px-2 py-1">
                        <div className="flex items-center justify-end gap-1">
                          {!completo && (
                            <button
                              type="button"
                              onClick={() => completar(it.id)}
                              title="Completar al 100 %"
                              className="rounded px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground hover:bg-accent hover:text-foreground"
                            >
                              100%
                            </button>
                          )}
                          <input
                            value={texto}
                            inputMode="decimal"
                            disabled={completo && !presentes[it.id]}
                            onChange={(e) => escribir(it.id, it.cantidad, e.target.value)}
                            placeholder={completo ? 'Completo' : '0'}
                            aria-label={`Avance presente de ${it.codigo}`}
                            className="h-8 w-24 rounded-md border border-input bg-background px-2 text-right tabular-nums outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:bg-muted/50"
                          />
                          <span className="w-7 text-xs text-muted-foreground">{porCantidad(it.cantidad) ? (it.unidad ?? '') : '%'}</span>
                        </div>
                      </td>
                      <td className={cn(td, num, acum > 1 + 1e-9 && 'font-semibold text-destructive')}>{fmtPct(acum)}</td>
                      <td className={cn(td, num, presentes[it.id] && 'font-medium')}>{linea?.importePresente ? fmtARS(linea.importePresente) : '–'}</td>
                    </tr>
                  )
                })}
              </Fragment>
            ))}
            {grupos.length === 0 && (
              <tr>
                <td colSpan={8} className="py-10 text-center text-muted-foreground">Ningún ítem coincide.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <footer className="border-t border-border bg-muted/30 px-5 py-3">
        {calc.error ? (
          <p className="mb-2 text-sm font-medium text-destructive">{calc.error}</p>
        ) : null}
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
          <Resumen label="Bruto del período" valor={fmtARS(calc.ok?.montoBruto)} />
          <Resumen label="Anticipo" valor={calc.ok ? `− ${fmtARS(calc.ok.descuentoAnticipo)}` : '–'} />
          <Resumen
            label={contrato.fondoReparoTipo === 'poliza' ? 'Fondo de reparo (póliza)' : 'Fondo de reparo'}
            valor={calc.ok ? (contrato.fondoReparoTipo === 'poliza' ? '$ 0 (sustituido)' : `− ${fmtARS(calc.ok.descuentoFondoReparo)}`) : '–'}
          />
          <Resumen label="Neto a cobrar" valor={fmtARS(calc.ok?.montoNeto)} fuerte />
          <Resumen label="Avance acumulado" valor={fmtPct(calc.ok?.porcentajeAvance)} />
          <div className="ml-auto flex gap-2">
            <Button variant="ghost" onClick={onClose}>
              Cancelar
            </Button>
            <Button onClick={emitir} disabled={!calc.ok || guardando}>
              {guardando && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              {form.tipo === 'nuevo' ? `Emitir certificado N° ${form.numero}` : 'Guardar rectificación'}
            </Button>
          </div>
        </div>
      </footer>
    </>
  )
}

function Resumen({ label, valor, fuerte }: { label: string; valor: string; fuerte?: boolean }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={cn('tabular-nums', fuerte ? 'text-base font-bold text-primary' : 'font-medium')}>{valor}</div>
    </div>
  )
}
