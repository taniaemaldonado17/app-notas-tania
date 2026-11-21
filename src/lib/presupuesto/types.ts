/** Shapes the presupuesto API returns (dates as ISO strings). */
import type { PresupuestoCalc, TipoInsumo } from './calculo'

export type PresupuestoResumen = {
  id: string
  nombre: string
  total: number
  tipoCambio: number | null
  rubros: number
  items: number
  updatedAt: string
}

export type PresupuestoInfo = {
  id: string
  pageId: string
  rowId: string | null
  nombre: string
  descripcion: string | null
  ubicacion: string | null
  tipoCambio: number | null
  cargasSociales: number
  coefAjuste: number
  superficieCubierta: number | null
  superficiePredio: number | null
  totalCache: number
  createdAt: string
  updatedAt: string
}

export type PresupuestoDetalle = { info: PresupuestoInfo; calc: PresupuestoCalc }

export type ApuLinea = {
  id: string
  cantidad: number
  insumoId: string
  codigo: string
  descripcion: string
  unidad: string | null
  tipo: TipoInsumo
  precioBase: number
  precioCalculo: number
  parcial: number
}

export type MedicionDetalle = {
  id: string
  sector: string | null
  criterio: string | null
  cant: number | null
  largo: number | null
  ancho: number | null
  alto: number | null
  coef: number | null
  parcial: number
}

export type ItemDetalle = {
  item: {
    id: string
    codigo: string
    descripcion: string
    unidad: string | null
    observaciones: string | null
    rubroNumero: number
    rubroDescripcion: string
  }
  apu: ApuLinea[]
  puPorTipo: Record<TipoInsumo, number>
  puTotal: number
  mediciones: MedicionDetalle[]
  cantidad: number
  subtotal: number
}

export type InsumoFila = {
  id: string
  codigo: string
  descripcion: string
  unidad: string | null
  tipo: TipoInsumo
  precioBase: number
  precioCalculo: number
  fuente: string | null
  usos: number
}
