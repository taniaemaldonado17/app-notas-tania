'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import * as api from '@/lib/api'
import type { ContratoData } from '@/lib/certificacion/types'
import { fmtARS, fmtInput, fmtNumFino, parseNumeroAR } from '@/lib/presupuesto/format'
import { cn } from '@/lib/utils'

type Form = {
  /** Amount = the CyP's sale price, kept up to date until the first certificate. */
  sigue: boolean
  montoContrato: string
  anticipoPct: string
  fondoReparoPct: string
  fondoReparoTipo: 'deposito' | 'poliza'
  polizaAseguradora: string
  polizaNumero: string
  polizaMonto: string
  comitente: string
  contratista: string
  numero: string
  mesBasico: string
  fechaContrato: string
  fechaInicio: string
  fechaFin: string
  plazo: string
}

function formDe(c: ContratoData | null, precioVenta: number): Form {
  const pct = (v: number) => fmtInput(Math.round(v * 1e6) / 1e4)
  return {
    sigue: c ? c.montoSigueCyp : true,
    montoContrato: fmtInput(c ? c.montoContrato : Math.round(precioVenta * 100) / 100),
    anticipoPct: c ? pct(c.anticipoPct) : '0',
    fondoReparoPct: c ? pct(c.fondoReparoPct) : '5',
    fondoReparoTipo: c?.fondoReparoTipo ?? 'deposito',
    polizaAseguradora: c?.polizaAseguradora ?? '',
    polizaNumero: c?.polizaNumero ?? '',
    polizaMonto: fmtInput(c?.polizaMonto ?? null),
    comitente: c?.comitente ?? '',
    contratista: c?.contratista ?? '',
    numero: c?.numero ?? '',
    mesBasico: c?.mesBasico ?? '',
    fechaContrato: c?.fechaContrato ?? '',
    fechaInicio: c?.fechaInicio ?? '',
    fechaFin: c?.fechaFin ?? '',
    plazo: c?.plazo ?? '',
  }
}

/** Create or edit the contract of a budget. */
export function ContratoDialog({
  open,
  onOpenChange,
  presupuestoId,
  contrato,
  totalPresupuesto,
  precioVenta,
  hayCertificados,
  onSaved,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  presupuestoId: string
  contrato: ContratoData | null
  totalPresupuesto: number
  /** The CyP's sale price (costo-costo x its pass coefficient). */
  precioVenta: number
  hayCertificados: boolean
  onSaved: () => void
}) {
  const [f, setF] = useState<Form>(() => formDe(contrato, precioVenta))
  const [guardando, setGuardando] = useState(false)
  useEffect(() => {
    if (open) setF(formDe(contrato, precioVenta))
  }, [open, contrato, precioVenta])

  const monto = f.sigue ? precioVenta : parseNumeroAR(f.montoContrato)
  const coef = monto && totalPresupuesto ? monto / totalPresupuesto : null
  const bloqueado = hayCertificados

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const n = (campo: string, s: string) => {
      const v = parseNumeroAR(s)
      if (v !== null && Number.isNaN(v)) throw new Error(`${campo}: «${s}» no es un número válido`)
      return v
    }
    let data
    try {
      const montoContrato = f.sigue ? Math.round(precioVenta * 100) / 100 : n('Monto de contrato', f.montoContrato)
      if (!montoContrato || montoContrato <= 0) throw new Error(f.sigue ? 'El precio de venta del CyP da $ 0' : 'Cargá el monto de contrato')
      const anticipo = n('Anticipo', f.anticipoPct) ?? 0
      const fondo = n('Fondo de reparo', f.fondoReparoPct) ?? 0
      if (anticipo < 0 || anticipo > 100 || fondo < 0 || fondo > 100) throw new Error('Los porcentajes van de 0 a 100')
      if (f.fondoReparoTipo === 'poliza' && !(f.polizaAseguradora.trim() && f.polizaNumero.trim())) {
        throw new Error('Con póliza, completá la aseguradora y el número de póliza')
      }
      data = {
        montoContrato,
        montoSigueCyp: f.sigue,
        anticipoPct: anticipo / 100,
        fondoReparoPct: fondo / 100,
        fondoReparoTipo: f.fondoReparoTipo,
        polizaAseguradora: f.polizaAseguradora.trim() || null,
        polizaNumero: f.polizaNumero.trim() || null,
        polizaMonto: n('Monto de la póliza', f.polizaMonto),
        comitente: f.comitente.trim() || null,
        contratista: f.contratista.trim() || null,
        numero: f.numero.trim() || null,
        mesBasico: f.mesBasico.trim() || null,
        fechaContrato: f.fechaContrato || null,
        fechaInicio: f.fechaInicio || null,
        fechaFin: f.fechaFin || null,
        plazo: f.plazo.trim() || null,
      }
    } catch (err) {
      toast.error((err as Error).message)
      return
    }
    setGuardando(true)
    try {
      await api.certificacionOp(presupuestoId, contrato ? { op: 'contrato.editar', data } : { op: 'contrato.crear', data })
      toast.success(contrato ? 'Contrato actualizado' : 'Contrato creado')
      onSaved()
      onOpenChange(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo guardar el contrato')
    } finally {
      setGuardando(false)
    }
  }

  const campo = (
    k: Exclude<keyof Form, 'sigue'>,
    label: string,
    opts: { sufijo?: string; placeholder?: string; num?: boolean; tipo?: string; disabled?: boolean; className?: string } = {}
  ) => (
    <div className={cn('space-y-1.5', opts.className)}>
      <Label htmlFor={`ct-${k}`}>{label}</Label>
      <div className="flex items-center gap-2">
        <Input
          id={`ct-${k}`}
          type={opts.tipo ?? 'text'}
          value={f[k]}
          disabled={opts.disabled}
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
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-2xl">
        <form onSubmit={submit} className="space-y-5">
          <DialogHeader>
            <DialogTitle>{contrato ? 'Contrato' : 'Crear contrato'}</DialogTitle>
            <DialogDescription>
              El itemizado del CyP pasa al contrato con precios de contrato (P.U. costo-costo × coeficiente de pase), así el 100 %
              certificado da exactamente el monto de contrato. Se congela al emitir el primer certificado.
            </DialogDescription>
          </DialogHeader>

          <fieldset className="space-y-3">
            <legend className="mb-1 text-sm font-semibold">Condiciones</legend>
            {bloqueado && (
              <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
                Con certificados emitidos, el monto, el anticipo y el fondo de reparo ya no se pueden cambiar.
              </p>
            )}
            <label className={cn('flex items-start gap-2 text-sm', bloqueado && 'opacity-60')}>
              <input
                type="checkbox"
                className="mt-0.5"
                checked={f.sigue}
                disabled={bloqueado}
                onChange={(e) => setF({ ...f, sigue: e.target.checked, montoContrato: e.target.checked ? fmtInput(Math.round(precioVenta * 100) / 100) : f.montoContrato })}
              />
              <span>
                Igual al precio de venta del cómputo y presupuesto
                <span className="block text-xs text-muted-foreground">
                  Costo-costo × coeficiente de pase del Resumen. Se actualiza solo cada vez que cambiás el CyP, hasta el primer
                  certificado.
                </span>
              </span>
            </label>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {f.sigue ? (
                <div className="space-y-1.5 sm:col-span-3">
                  <Label>Monto de contrato</Label>
                  <div className="flex h-9 items-center justify-end rounded-md border border-input bg-muted/40 px-3 text-sm font-semibold tabular-nums">
                    {fmtARS(precioVenta)}
                  </div>
                </div>
              ) : (
                campo('montoContrato', 'Monto de contrato pactado', { sufijo: '$', num: true, disabled: bloqueado, className: 'sm:col-span-3' })
              )}
            </div>
            <p className="-mt-1 text-xs text-muted-foreground">
              Costo-costo del CyP: {fmtARS(totalPresupuesto)} · precio de venta: {fmtARS(precioVenta)}
              {coef ? ` · coeficiente de pase del contrato ${fmtNumFino(coef)}` : ''}
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {campo('anticipoPct', 'Anticipo financiero', { sufijo: '%', num: true, disabled: bloqueado })}
              {campo('fondoReparoPct', 'Fondo de reparo', { sufijo: '%', num: true, disabled: bloqueado })}
              <div className="space-y-1.5">
                <Label htmlFor="ct-tipo">Fondo de reparo por</Label>
                <select
                  id="ct-tipo"
                  value={f.fondoReparoTipo}
                  onChange={(e) => setF({ ...f, fondoReparoTipo: e.target.value as Form['fondoReparoTipo'] })}
                  className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm"
                >
                  <option value="deposito">Retención (depósito)</option>
                  <option value="poliza">Póliza de caución</option>
                </select>
              </div>
            </div>
            {f.fondoReparoTipo === 'poliza' && (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                {campo('polizaAseguradora', 'Aseguradora')}
                {campo('polizaNumero', 'N° de póliza')}
                {campo('polizaMonto', 'Monto asegurado', { sufijo: '$', num: true })}
              </div>
            )}
          </fieldset>

          <fieldset className="space-y-3">
            <legend className="mb-1 text-sm font-semibold">Datos de la obra</legend>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {campo('comitente', 'Comitente', { placeholder: 'Quien encarga la obra' })}
              {campo('contratista', 'Contratista', { placeholder: 'Empresa constructora' })}
              {campo('numero', 'N° de contrato / orden')}
              {campo('mesBasico', 'Mes básico', { placeholder: 'Noviembre 2026' })}
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
              {campo('fechaContrato', 'Fecha de contrato', { tipo: 'date' })}
              {campo('fechaInicio', 'Inicio de obra', { tipo: 'date' })}
              {campo('fechaFin', 'Fin de obra', { tipo: 'date' })}
              {campo('plazo', 'Plazo', { placeholder: '10 meses' })}
            </div>
          </fieldset>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={guardando}>
              {guardando && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              {contrato ? 'Guardar' : 'Crear contrato'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
