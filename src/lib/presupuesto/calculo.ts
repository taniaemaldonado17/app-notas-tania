/**
 * Cómputo y presupuesto costo-costo: cálculo puro (sin base de datos), igual
 * que la planilla Excel de cómputo y presupuesto.
 *
 *   precio de cálculo del insumo = base × (1 + cargas sociales)   si es MO
 *                                = base × coeficiente de ajuste   si no
 *   P.U. del ítem por tipo        = Σ cantidad × precio de cálculo
 *                                   (EQ y SUB van juntos en "equipos")
 *   cantidad del ítem             = Σ parciales de sus mediciones
 *   parcial de una medición       = producto de los factores cargados
 *   subtotal                      = cantidad × P.U. total
 *
 * Sin imports a propósito: se testea con `node --test` (ver *.test.ts).
 */

export const TIPOS_INSUMO = ['MO', 'MAT', 'EQ', 'SUB'] as const
export type TipoInsumo = (typeof TIPOS_INSUMO)[number]

export const NOMBRES_TIPO: Record<TipoInsumo, string> = {
  MO: 'Mano de obra',
  MAT: 'Materiales',
  EQ: 'Equipos',
  SUB: 'Subcontratos',
}

export const FACTORES_MEDICION = ['cant', 'largo', 'ancho', 'alto', 'coef'] as const
export type FactorMedicion = (typeof FACTORES_MEDICION)[number]

export type Parametros = {
  tipoCambio: number | null
  cargasSociales: number
  coefAjuste: number
  superficieCubierta: number | null
  superficiePredio: number | null
}

export type InsumoIn = { id: string; tipo: string; precioBase: number }
export type RubroIn = { id: string; numero: number; descripcion: string; position: number }
export type ItemIn = {
  id: string
  rubroId: string
  codigo: string
  descripcion: string
  unidad: string | null
  observaciones: string | null
  position: number
}
export type ApuIn = { itemId: string; insumoId: string; cantidad: number }
export type MedicionIn = { itemId: string } & Record<FactorMedicion, number | null>

export type ItemCalc = ItemIn & {
  cantidad: number
  mediciones: number
  puMat: number
  puMo: number
  puEq: number
  puTotal: number
  subtotal: number
  incidencia: number
}

export type RubroCalc = RubroIn & {
  items: ItemCalc[]
  total: number
  totalUsd: number | null
  incidencia: number
}

export type PresupuestoCalc = {
  rubros: RubroCalc[]
  total: number
  totalUsd: number | null
  porM2Cubierto: number | null
  porM2Predio: number | null
  cantidadItems: number
}

export function precioCalculo(tipo: string, precioBase: number | null, cargasSociales: number, coefAjuste: number): number {
  const base = precioBase ?? 0
  if (tipo === 'MO') return base * (1 + (cargasSociales ?? 0))
  return base * (coefAjuste ?? 1)
}

/** Producto de los factores cargados; los vacíos no cuentan (como PRODUCT() en Excel). */
export function parcialMedicion(m: Record<FactorMedicion, number | null | undefined>): number {
  const factores = FACTORES_MEDICION.map((f) => m[f]).filter((v): v is number => v !== null && v !== undefined)
  if (factores.length === 0) return 0
  return factores.reduce((a, b) => a * b, 1)
}

function grupoPU(tipo: string): 'puMat' | 'puMo' | 'puEq' {
  if (tipo === 'MO') return 'puMo'
  if (tipo === 'MAT') return 'puMat'
  return 'puEq'
}

export function calcular(
  params: Parametros,
  insumos: InsumoIn[],
  rubros: RubroIn[],
  items: ItemIn[],
  apu: ApuIn[],
  mediciones: MedicionIn[]
): PresupuestoCalc {
  const precioInsumo = new Map<string, { tipo: string; precio: number }>()
  for (const ins of insumos) {
    precioInsumo.set(ins.id, {
      tipo: ins.tipo,
      precio: precioCalculo(ins.tipo, ins.precioBase, params.cargasSociales, params.coefAjuste),
    })
  }

  const pu = new Map<string, { puMat: number; puMo: number; puEq: number }>()
  for (const linea of apu) {
    const ins = precioInsumo.get(linea.insumoId)
    if (!ins) continue
    const acc = pu.get(linea.itemId) ?? { puMat: 0, puMo: 0, puEq: 0 }
    acc[grupoPU(ins.tipo)] += (linea.cantidad ?? 0) * ins.precio
    pu.set(linea.itemId, acc)
  }

  const cantidades = new Map<string, { total: number; n: number }>()
  for (const m of mediciones) {
    const acc = cantidades.get(m.itemId) ?? { total: 0, n: 0 }
    acc.total += parcialMedicion(m)
    acc.n += 1
    cantidades.set(m.itemId, acc)
  }

  const porRubro = new Map<string, ItemCalc[]>()
  const ordenados = [...items].sort((a, b) => a.position - b.position)
  for (const item of ordenados) {
    const p = pu.get(item.id) ?? { puMat: 0, puMo: 0, puEq: 0 }
    const c = cantidades.get(item.id) ?? { total: 0, n: 0 }
    const puTotal = p.puMat + p.puMo + p.puEq
    const lista = porRubro.get(item.rubroId) ?? []
    lista.push({ ...item, ...p, puTotal, cantidad: c.total, mediciones: c.n, subtotal: c.total * puTotal, incidencia: 0 })
    porRubro.set(item.rubroId, lista)
  }

  const rubrosCalc: RubroCalc[] = [...rubros]
    .sort((a, b) => a.numero - b.numero || a.position - b.position)
    .map((r) => {
      const lista = porRubro.get(r.id) ?? []
      return { ...r, items: lista, total: lista.reduce((s, i) => s + i.subtotal, 0), totalUsd: null, incidencia: 0 }
    })

  const total = rubrosCalc.reduce((s, r) => s + r.total, 0)
  const tc = params.tipoCambio
  for (const r of rubrosCalc) {
    r.incidencia = total ? r.total / total : 0
    r.totalUsd = tc ? r.total / tc : null
    for (const i of r.items) i.incidencia = total ? i.subtotal / total : 0
  }

  return {
    rubros: rubrosCalc,
    total,
    totalUsd: tc ? total / tc : null,
    porM2Cubierto: params.superficieCubierta ? total / params.superficieCubierta : null,
    porM2Predio: params.superficiePredio ? total / params.superficiePredio : null,
    cantidadItems: items.length,
  }
}
