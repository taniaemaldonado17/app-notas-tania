/** Shapes the certification API returns (dates as ISO strings). */

export type ContratoItemData = {
  id: string
  rubroNumero: number
  rubroDescripcion: string
  codigo: string
  descripcion: string
  unidad: string | null
  cantidad: number
  precioUnitario: number
  importe: number
  position: number
}

export type CertificadoResumen = {
  id: string
  numero: number
  fecha: string
  periodo: string | null
  porcentajeAvance: number
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
  rectificado: boolean
  rectificadoEn: string | null
  createdAt: string
}

export type CertificadoDetalleData = CertificadoResumen & {
  lineas: { contratoItemId: string; anterior: number; presente: number; acumulado: number; importePresente: number }[]
}

export type ContratoData = {
  id: string
  presupuestoId: string
  montoContrato: number
  coeficientePase: number
  /** The amount is the CyP's sale price and follows it until the first certificate. */
  montoSigueCyp: boolean
  anticipoPct: number
  fondoReparoPct: number
  fondoReparoTipo: 'deposito' | 'poliza'
  polizaAseguradora: string | null
  polizaNumero: string | null
  polizaMonto: number | null
  comitente: string | null
  contratista: string | null
  numero: string | null
  mesBasico: string | null
  fechaContrato: string | null
  fechaInicio: string | null
  fechaFin: string | null
  plazo: string | null
  items: ContratoItemData[]
  certificados: CertificadoResumen[]
  curva: { id: string; orden: number; periodo: string; porcentajeAcumulado: number }[]
}

export type CertificacionData = {
  contrato: ContratoData | null
  presupuesto: { totalCache: number; nombre: string; ubicacion: string | null; precioVenta: number } | null
  acumuladoPorItem?: Record<string, number>
}
