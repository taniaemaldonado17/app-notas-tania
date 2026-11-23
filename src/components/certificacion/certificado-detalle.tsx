'use client'

import { Fragment, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { FileDown, Loader2, PencilLine, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import * as api from '@/lib/api'
import type { CertificadoDetalleData, ContratoData } from '@/lib/certificacion/types'
import { fmtARS, fmtNum, fmtPct } from '@/lib/presupuesto/format'
import { cn } from '@/lib/utils'
import { num, td, th } from '@/components/presupuesto/campos'

export function fechaAR(iso: string | null | undefined) {
  if (!iso) return '–'
  const [y, m, d] = iso.slice(0, 10).split('-')
  return y && m && d ? `${d}/${m}/${y}` : iso
}

/** An issued certificate: amounts and per-item lines. */
export function CertificadoDetalle({
  presupuestoId,
  contrato,
  certificadoId,
  esUltimo,
  onClose,
  onRectificar,
  onEliminado,
}: {
  presupuestoId: string
  contrato: ContratoData
  certificadoId: string | null
  esUltimo: boolean
  onClose: () => void
  onRectificar: (c: CertificadoDetalleData) => void
  onEliminado: () => void
}) {
  const [c, setC] = useState<CertificadoDetalleData | null>(null)

  useEffect(() => {
    if (!certificadoId) return
    let cancelled = false
    setC(null)
    api
      .fetchCertificado(presupuestoId, certificadoId)
      .then((r) => !cancelled && setC(r))
      .catch(() => {
        if (!cancelled) {
          toast.error('No se pudo abrir el certificado')
          onClose()
        }
      })
    return () => {
      cancelled = true
    }
  }, [presupuestoId, certificadoId, onClose])

  async function eliminar() {
    if (!c) return
    if (!window.confirm(`¿Eliminar el certificado N° ${c.numero}? Se borra con todas sus líneas. No se puede deshacer.`)) return
    try {
      await api.certificacionOp(presupuestoId, { op: 'certificado.eliminar', id: c.id })
      toast.success(`Certificado N° ${c.numero} eliminado`)
      onEliminado()
      onClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo eliminar')
    }
  }

  const items = new Map(contrato.items.map((i) => [i.id, i]))
  const lineas = (c?.lineas ?? [])
    .filter((l) => l.acumulado || l.presente)
    .map((l) => ({ ...l, item: items.get(l.contratoItemId)! }))
    .filter((l) => l.item)
    .sort((a, b) => a.item.position - b.item.position)

  return (
    <Dialog open={certificadoId !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto p-4 sm:max-w-5xl lg:p-6">
        {!c ? (
          <>
            <DialogHeader>
              <DialogTitle>Cargando certificado…</DialogTitle>
              <DialogDescription className="sr-only">Detalle del certificado</DialogDescription>
            </DialogHeader>
            <div className="flex justify-center py-10">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                Certificado N° {c.numero}
                {c.rectificado && (
                  <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[11px] font-semibold text-amber-700 dark:text-amber-300">
                    Rectificado
                  </span>
                )}
              </DialogTitle>
              <DialogDescription>
                {c.periodo ? `${c.periodo} · ` : ''}Fecha {fechaAR(c.fecha)}
                {c.rectificadoEn ? ` · rectificado el ${fechaAR(c.rectificadoEn)}` : ''}
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-4 sm:grid-cols-2">
              <table className="text-sm">
                <tbody>
                  <Fila k="Monto bruto del período" v={fmtARS(c.montoBruto)} />
                  <Fila k={`Descuento anticipo (${fmtPct(contrato.anticipoPct)})`} v={`− ${fmtARS(c.descuentoAnticipo)}`} />
                  <Fila k={`Fondo de reparo (${fmtPct(contrato.fondoReparoPct)})`} v={`− ${fmtARS(c.descuentoFondoReparo)}`} />
                  {c.sustitucionFondoReparo > 0 && <Fila k="Sustitución por póliza" v={`+ ${fmtARS(c.sustitucionFondoReparo)}`} />}
                  <Fila k="Neto a cobrar" v={fmtARS(c.montoNeto)} fuerte />
                </tbody>
              </table>
              <table className="text-sm">
                <tbody>
                  <Fila k="Avance acumulado" v={fmtPct(c.porcentajeAvance)} />
                  <Fila k="Certificado acumulado" v={fmtARS(c.montoBrutoAcumulado)} />
                  <Fila k="Saldo de obra" v={fmtARS(c.saldoObra)} />
                  <Fila k="Saldo de anticipo a recuperar" v={fmtARS(c.saldoAnticipo)} />
                  <Fila k="Fondo de reparo acumulado" v={fmtARS(c.fondoReparoAcumulado)} />
                </tbody>
              </table>
            </div>

            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full min-w-[720px] text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className={th}>Ítem</th>
                    <th className={th}>Descripción</th>
                    <th className={cn(th, 'text-right')}>Anterior</th>
                    <th className={cn(th, 'text-right')}>Presente</th>
                    <th className={cn(th, 'text-right')}>Acumulado</th>
                    <th className={cn(th, 'text-right')}>Cant. presente</th>
                    <th className={cn(th, 'text-right')}>Importe presente</th>
                  </tr>
                </thead>
                <tbody>
                  {lineas.map((l, i) => (
                    <Fragment key={l.contratoItemId}>
                      {(i === 0 || lineas[i - 1].item.rubroNumero !== l.item.rubroNumero) && (
                        <tr className="bg-muted/30">
                          <td colSpan={7} className="px-3 py-1 text-xs font-semibold">
                            {l.item.rubroNumero} · {l.item.rubroDescripcion}
                          </td>
                        </tr>
                      )}
                      <tr className="border-t border-border/50">
                        <td className={cn(td, 'font-medium')}>{l.item.codigo}</td>
                        <td className={td}>{l.item.descripcion}</td>
                        <td className={cn(td, num, 'text-muted-foreground')}>{fmtPct(l.anterior)}</td>
                        <td className={cn(td, num, l.presente && 'font-semibold')}>{fmtPct(l.presente)}</td>
                        <td className={cn(td, num)}>{fmtPct(l.acumulado)}</td>
                        <td className={cn(td, num, 'text-muted-foreground')}>
                          {l.presente ? `${fmtNum(l.presente * l.item.cantidad)} ${l.item.unidad ?? ''}` : '–'}
                        </td>
                        <td className={cn(td, num)}>{l.importePresente ? fmtARS(l.importePresente) : '–'}</td>
                      </tr>
                    </Fragment>
                  ))}
                  {lineas.length === 0 && (
                    <tr>
                      <td colSpan={7} className="py-6 text-center text-muted-foreground">Sin avance cargado.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <DialogFooter className="flex-wrap gap-2 sm:justify-between">
              <div className="flex gap-2">
                {esUltimo && (
                  <>
                    <Button variant="outline" size="sm" onClick={() => onRectificar(c)}>
                      <PencilLine className="mr-1.5 h-4 w-4" />
                      Rectificar
                    </Button>
                    <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={eliminar}>
                      <Trash2 className="mr-1.5 h-4 w-4" />
                      Eliminar
                    </Button>
                  </>
                )}
              </div>
              <div className="flex flex-wrap justify-end gap-2">
                <Button size="sm" variant="outline" asChild>
                  <a
                    href={`/api/presupuestos/${presupuestoId}/certificados/${c.id}/pdf?tipo=foja`}
                    target="_blank"
                    rel="noreferrer"
                    title="Mismo avance, a costo-costo, sin anticipo ni fondo de reparo: para pagarle al contratista"
                  >
                    <FileDown className="mr-1.5 h-4 w-4" />
                    Foja contratista (costo-costo)
                  </a>
                </Button>
                <Button size="sm" asChild>
                  <a
                    href={`/api/presupuestos/${presupuestoId}/certificados/${c.id}/pdf`}
                    target="_blank"
                    rel="noreferrer"
                    title="A precio de contrato, con anticipo y fondo de reparo: para cobrarle al comitente"
                  >
                    <FileDown className="mr-1.5 h-4 w-4" />
                    Certificado comitente
                  </a>
                </Button>
              </div>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

function Fila({ k, v, fuerte }: { k: string; v: string; fuerte?: boolean }) {
  return (
    <tr className={cn('border-b border-border/50 last:border-b-0', fuerte && 'font-bold')}>
      <td className="py-1.5 pr-3 text-muted-foreground">{k}</td>
      <td className={cn('py-1.5 text-right tabular-nums', fuerte && 'text-primary')}>{v}</td>
    </tr>
  )
}
