'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { FileSignature, Loader2, MoreHorizontal, Pencil, Plus, RefreshCw, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import * as api from '@/lib/api'
import type { Antecedente } from '@/lib/certificacion/calculo'
import type { CertificacionData, CertificadoDetalleData, ContratoData } from '@/lib/certificacion/types'
import { fmtARS, fmtNumFino, fmtPct } from '@/lib/presupuesto/format'
import { cn } from '@/lib/utils'
import { Kpi, num, td, th } from '@/components/presupuesto/campos'
import { ContratoDialog } from './contrato-dialog'
import { CertificadoDetalle, fechaAR } from './certificado-detalle'
import { CertificadoForm, type FormCertificado } from './certificado-form'
import { CurvaAvance } from './curva-avance'

export function CertificacionTab({ presupuestoId, onChanged }: { presupuestoId: string; onChanged: () => void }) {
  const [data, setData] = useState<CertificacionData | null>(null)
  const [contratoOpen, setContratoOpen] = useState(false)
  const [form, setForm] = useState<FormCertificado | null>(null)
  const [detalleId, setDetalleId] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    try {
      setData(await api.fetchCertificacion(presupuestoId))
    } catch {
      toast.error('No se pudo cargar la certificación')
    }
  }, [presupuestoId])

  useEffect(() => {
    void cargar()
  }, [cargar])

  const despues = useCallback(() => {
    void cargar()
    onChanged()
  }, [cargar, onChanged])
  const cerrarDetalle = useCallback(() => setDetalleId(null), [])

  if (!data) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const total = data.presupuesto?.totalCache ?? 0
  const precioVentaCyp = data.presupuesto?.precioVenta ?? total
  const contrato = data.contrato

  if (!contrato) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
        <div className="rounded-2xl border border-dashed border-border px-6 py-10 text-center">
          <FileSignature className="mx-auto h-10 w-10 text-muted-foreground/60" />
          <h2 className="mt-3 text-lg font-semibold">Certificación de obra</h2>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            Creá el contrato para empezar a certificar: monto, anticipo y fondo de reparo. El monto es el precio de venta del CyP
            ({fmtARS(precioVentaCyp)}) y los ítems van a precio de contrato.
          </p>
          <Button className="mt-5" onClick={() => setContratoOpen(true)} disabled={!(total > 0)}>
            <Plus className="mr-1.5 h-4 w-4" />
            Crear contrato
          </Button>
          {!(total > 0) && <p className="mt-2 text-xs text-muted-foreground">El presupuesto da $ 0: cargá precios y cantidades primero.</p>}
        </div>
        <ContratoDialog
          open={contratoOpen}
          onOpenChange={setContratoOpen}
          presupuestoId={presupuestoId}
          contrato={null}
          totalPresupuesto={total}
          precioVenta={precioVentaCyp}
          hayCertificados={false}
          onSaved={despues}
        />
      </div>
    )
  }

  const certs = contrato.certificados
  const ultimo = certs[certs.length - 1]
  const acumulado = ultimo?.montoBrutoAcumulado ?? 0

  function nuevo() {
    if (!contrato) return
    const antecedente: Antecedente = ultimo
      ? {
          acumuladoPorItem: data?.acumuladoPorItem ?? {},
          montoBrutoAcumulado: ultimo.montoBrutoAcumulado,
          anticipoAcumulado: ultimo.anticipoAcumulado,
          fondoReparoAcumulado: ultimo.fondoReparoAcumulado,
        }
      : null
    setForm({ tipo: 'nuevo', numero: (ultimo?.numero ?? 0) + 1, antecedente })
  }

  function rectificar(c: CertificadoDetalleData) {
    if (!contrato) return
    const previo = certs.filter((x) => x.numero < c.numero).at(-1)
    const antecedente: Antecedente = previo
      ? {
          acumuladoPorItem: Object.fromEntries(c.lineas.map((l) => [l.contratoItemId, l.anterior])),
          montoBrutoAcumulado: previo.montoBrutoAcumulado,
          anticipoAcumulado: previo.anticipoAcumulado,
          fondoReparoAcumulado: previo.fondoReparoAcumulado,
        }
      : null
    setDetalleId(null)
    setForm({
      tipo: 'rectificar',
      id: c.id,
      numero: c.numero,
      antecedente,
      fecha: c.fecha,
      periodo: c.periodo,
      presentes: Object.fromEntries(c.lineas.filter((l) => l.presente).map((l) => [l.contratoItemId, l.presente])),
    })
  }

  async function opSimple(op: 'contrato.actualizarItemizado' | 'contrato.eliminar', confirmacion: string, ok: string) {
    if (!window.confirm(confirmacion)) return
    try {
      await api.certificacionOp(presupuestoId, { op })
      toast.success(ok)
      despues()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo completar')
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-8 px-4 py-6 sm:px-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Certificación de obra</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {[contrato.comitente && `Comitente: ${contrato.comitente}`, contrato.contratista && `Contratista: ${contrato.contratista}`, contrato.numero && `Contrato N° ${contrato.numero}`]
              .filter(Boolean)
              .join(' · ') || 'Completá los datos del contrato para que salgan en los certificados.'}
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={nuevo} disabled={acumulado >= contrato.montoContrato - 0.005}>
            <Plus className="mr-1.5 h-4 w-4" />
            Nuevo certificado
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon" aria-label="Opciones del contrato">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              <DropdownMenuItem onClick={() => setContratoOpen(true)}>
                <Pencil className="mr-2 h-4 w-4" />
                Editar contrato
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={certs.length > 0}
                onClick={() =>
                  opSimple(
                    'contrato.actualizarItemizado',
                    'Se vuelve a copiar el itemizado desde el presupuesto actual (cantidades y precios), manteniendo el monto de contrato. ¿Seguimos?',
                    'Itemizado actualizado'
                  )
                }
              >
                <RefreshCw className="mr-2 h-4 w-4" />
                Actualizar itemizado desde el presupuesto
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={certs.length > 0}
                className="text-destructive focus:text-destructive"
                onClick={() => opSimple('contrato.eliminar', '¿Eliminar el contrato? El presupuesto no se toca.', 'Contrato eliminado')}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Eliminar contrato
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Monto de contrato" value={fmtARS(contrato.montoContrato)} />
        <Kpi label="Certificado acumulado" value={fmtARS(acumulado)} />
        <Kpi label="Avance certificado" value={fmtPct(ultimo?.porcentajeAvance ?? 0)} accent />
        <Kpi label="Saldo de obra" value={fmtARS(contrato.montoContrato - acumulado)} />
      </div>

      <FichaContrato contrato={contrato} />

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Certificados</h2>
        {certs.length ? (
          <div className="overflow-x-auto rounded-xl border border-border bg-card">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className={th}>N°</th>
                  <th className={th}>Período</th>
                  <th className={th}>Fecha</th>
                  <th className={cn(th, 'text-right')}>Avance acum.</th>
                  <th className={cn(th, 'text-right')}>Bruto</th>
                  <th className={cn(th, 'text-right')}>Neto</th>
                </tr>
              </thead>
              <tbody>
                {certs.map((c) => (
                  <tr key={c.id} onClick={() => setDetalleId(c.id)} className="cursor-pointer border-t border-border/60 hover:bg-accent/40">
                    <td className={cn(td, 'font-semibold text-primary')}>
                      N° {c.numero}
                      {c.rectificado && (
                        <span className="ml-2 rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-300">
                          Rectificado
                        </span>
                      )}
                    </td>
                    <td className={td}>{c.periodo ?? '–'}</td>
                    <td className={td}>{fechaAR(c.fecha)}</td>
                    <td className={cn(td, num)}>{fmtPct(c.porcentajeAvance)}</td>
                    <td className={cn(td, num)}>{fmtARS(c.montoBruto)}</td>
                    <td className={cn(td, num, 'font-semibold')}>{fmtARS(c.montoNeto)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
            Todavía no hay certificados. Emití el primero con «Nuevo certificado».
          </p>
        )}
      </section>

      <CurvaAvance presupuestoId={presupuestoId} contrato={contrato} onSaved={despues} />

      <ContratoDialog
        open={contratoOpen}
        onOpenChange={setContratoOpen}
        presupuestoId={presupuestoId}
        contrato={contrato}
        totalPresupuesto={total}
          precioVenta={precioVentaCyp}
        hayCertificados={certs.length > 0}
        onSaved={despues}
      />
      <CertificadoForm presupuestoId={presupuestoId} contrato={contrato} form={form} onClose={() => setForm(null)} onSaved={despues} />
      <CertificadoDetalle
        presupuestoId={presupuestoId}
        contrato={contrato}
        certificadoId={detalleId}
        esUltimo={detalleId === ultimo?.id}
        onClose={cerrarDetalle}
        onRectificar={rectificar}
        onEliminado={despues}
      />
    </div>
  )
}

function FichaContrato({ contrato: c }: { contrato: ContratoData }) {
  const datos: [string, string | null][] = [
    ['Comitente', c.comitente],
    ['Contratista', c.contratista],
    ['N° de contrato', c.numero],
    ['Mes básico', c.mesBasico],
    ['Fecha de contrato', c.fechaContrato ? fechaAR(c.fechaContrato) : null],
    ['Inicio de obra', c.fechaInicio ? fechaAR(c.fechaInicio) : null],
    ['Fin de obra', c.fechaFin ? fechaAR(c.fechaFin) : null],
    ['Plazo', c.plazo],
    ['Coeficiente de pase', fmtNumFino(c.coeficientePase)],
    [
      'Monto',
      c.certificados.length
        ? 'congelado desde el primer certificado'
        : c.montoSigueCyp
          ? 'precio de venta del CyP (se actualiza solo)'
          : 'pactado a mano',
    ],
    ['Anticipo financiero', fmtPct(c.anticipoPct)],
    [
      'Fondo de reparo',
      `${fmtPct(c.fondoReparoPct)} · ${c.fondoReparoTipo === 'poliza' ? `póliza ${[c.polizaAseguradora, c.polizaNumero && `N° ${c.polizaNumero}`, c.polizaMonto && fmtARS(c.polizaMonto)].filter(Boolean).join(' ')}` : 'retención'}`,
    ],
  ]
  return (
    <dl className="grid grid-cols-1 gap-x-8 gap-y-1.5 rounded-xl border border-border bg-card px-4 py-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
      {datos
        .filter(([, v]) => v)
        .map(([k, v]) => (
          <div key={k} className="flex gap-2">
            <dt className="shrink-0 text-muted-foreground">{k}:</dt>
            <dd className="min-w-0">{v}</dd>
          </div>
        ))}
    </dl>
  )
}
