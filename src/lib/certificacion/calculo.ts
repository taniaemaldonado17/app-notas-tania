/**
 * Certificación de obra: cálculo puro (sin base de datos). Lo usan el servidor
 * al emitir y el formulario para la vista previa en vivo.
 *
 * Por ítem (fracciones 0-1): acumulado = anterior + presente, nunca > 100 %.
 * Importe presente = importe de contrato del ítem × presente.
 *
 * Anticipo financiero: se descuenta anticipo% de cada certificado hasta
 * recuperar el total (monto de contrato × anticipo%); nunca de más.
 * Fondo de reparo: misma mecánica con tope (monto × fondo%). Con póliza se
 * descuenta y se reintegra en el acto ("sustitución"): queda documentado
 * pero el efecto neto es $ 0.
 *
 * Sin imports a propósito: se testea con `node --test`.
 */

export class ErrorCertificado extends Error {}

export type ContratoParams = {
  montoContrato: number
  anticipoPct: number
  fondoReparoPct: number
  fondoReparoTipo: 'deposito' | 'poliza' | string
}

export type ItemContrato = { id: string; codigo: string; descripcion: string; importe: number }

/** What the previous certificate leaves behind (null for the first one). */
export type Antecedente = {
  acumuladoPorItem: Record<string, number>
  montoBrutoAcumulado: number
  anticipoAcumulado: number
  fondoReparoAcumulado: number
} | null

export type LineaCalc = {
  contratoItemId: string
  anterior: number
  presente: number
  acumulado: number
  importePresente: number
}

export type CertificadoCalc = {
  lineas: LineaCalc[]
  montoBruto: number
  montoBrutoAcumulado: number
  descuentoAnticipo: number
  anticipoAcumulado: number
  descuentoFondoReparo: number
  sustitucionFondoReparo: number
  fondoReparoAcumulado: number
  montoNeto: number
  saldoObra: number
  saldoAnticipo: number
  saldoFondoReparo: number
  porcentajeAvance: number
}

const EPS = 1e-6

export function calcularCertificado(
  contrato: ContratoParams,
  items: ItemContrato[],
  antecedente: Antecedente,
  presentes: Record<string, number>
): CertificadoCalc {
  const lineas: LineaCalc[] = []
  let montoBruto = 0
  for (const item of items) {
    const anterior = antecedente?.acumuladoPorItem[item.id] ?? 0
    const presente = presentes[item.id] ?? 0
    const acumulado = anterior + presente
    if (acumulado > 1 + EPS) {
      const restante = Math.max(0, 1 - anterior) * 100
      throw new ErrorCertificado(
        `El ítem ${item.codigo} — ${item.descripcion} quedaría en ${(acumulado * 100).toFixed(2).replace(".", ",")} % de avance acumulado, que supera el 100 %. Como mucho podés cargar ${restante.toFixed(2).replace(".", ",")} % en este período.`
      )
    }
    if (acumulado < -EPS) {
      throw new ErrorCertificado(
        `El ítem ${item.codigo} — ${item.descripcion} quedaría con avance acumulado negativo (${(acumulado * 100).toFixed(2).replace(".", ",")} %).`
      )
    }
    const importePresente = item.importe * presente
    montoBruto += importePresente
    lineas.push({ contratoItemId: item.id, anterior, presente, acumulado, importePresente })
  }

  const { montoContrato, anticipoPct, fondoReparoPct } = contrato
  const brutoPrevio = antecedente?.montoBrutoAcumulado ?? 0
  const anticipoPrevio = antecedente?.anticipoAcumulado ?? 0
  const fondoPrevio = antecedente?.fondoReparoAcumulado ?? 0

  const anticipoTotal = montoContrato * anticipoPct
  const saldoAnticipoPrevio = Math.max(anticipoTotal - anticipoPrevio, 0)
  const descuentoAnticipo = Math.max(Math.min(montoBruto * anticipoPct, saldoAnticipoPrevio), 0)
  const anticipoAcumulado = anticipoPrevio + descuentoAnticipo

  const fondoTope = montoContrato * fondoReparoPct
  const saldoFondoPrevio = Math.max(fondoTope - fondoPrevio, 0)
  const descuentoFondoReparo = Math.max(Math.min(montoBruto * fondoReparoPct, saldoFondoPrevio), 0)
  const fondoReparoAcumulado = fondoPrevio + descuentoFondoReparo
  const sustitucionFondoReparo = contrato.fondoReparoTipo === 'poliza' ? descuentoFondoReparo : 0

  const montoNeto = montoBruto - descuentoAnticipo - descuentoFondoReparo + sustitucionFondoReparo
  const montoBrutoAcumulado = brutoPrevio + montoBruto

  return {
    lineas,
    montoBruto,
    montoBrutoAcumulado,
    descuentoAnticipo,
    anticipoAcumulado,
    descuentoFondoReparo,
    sustitucionFondoReparo,
    fondoReparoAcumulado,
    montoNeto,
    saldoObra: montoContrato - montoBrutoAcumulado,
    saldoAnticipo: Math.max(anticipoTotal - anticipoAcumulado, 0),
    saldoFondoReparo: Math.max(fondoTope - fondoReparoAcumulado, 0),
    porcentajeAvance: montoContrato ? montoBrutoAcumulado / montoContrato : 0,
  }
}

/* ------------------------------------------------------------------ */
/* Curva de avance                                                      */
/* ------------------------------------------------------------------ */

export type PuntoCurva = {
  orden: number
  periodo: string | null
  planificado: number | null
  numeroCertificado: number | null
  fechaCertificado: string | null
  real: number | null
  desvio: number | null
}

/**
 * Plan period N is compared with certificate N (same cadence assumed).
 * One point per number present on either side.
 */
export function compararCurvas(
  plan: { orden: number; periodo: string; porcentajeAcumulado: number }[],
  certificados: { numero: number; fecha: string; periodo: string | null; porcentajeAvance: number }[]
): PuntoCurva[] {
  const porPlan = new Map(plan.map((p) => [p.orden, p]))
  const porCert = new Map(certificados.map((c) => [c.numero, c]))
  const ordenes = [...new Set([...porPlan.keys(), ...porCert.keys()])].sort((a, b) => a - b)
  return ordenes.map((orden) => {
    const p = porPlan.get(orden)
    const c = porCert.get(orden)
    const planificado = p ? p.porcentajeAcumulado : null
    const real = c ? c.porcentajeAvance : null
    return {
      orden,
      periodo: p?.periodo ?? c?.periodo ?? null,
      planificado,
      numeroCertificado: c?.numero ?? null,
      fechaCertificado: c?.fecha ?? null,
      real,
      desvio: planificado !== null && real !== null ? real - planificado : null,
    }
  })
}
