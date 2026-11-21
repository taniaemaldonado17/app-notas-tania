/**
 * Lee una planilla de cómputo y presupuesto ("Computo_Presupuesto_*.xlsx").
 *
 * Hojas (se reconocen sin importar tildes ni mayúsculas):
 * - Insumos:             parámetros (tipo de cambio, cargas sociales,
 *                        coeficiente de ajuste) y la lista de insumos.
 * - Analisis de Precios: un bloque por ítem ("1.01 | descripción | … Unidad: | gl")
 *                        con las líneas insumo × cantidad.
 * - Computo metrico:     mediciones por ítem (Cant. × Largo × Ancho × Alto × Coef.).
 * - Presupuesto:         rubros (código entero) e ítems (código "1.01").
 * - Resumen, Supuestos y Fuentes: superficies y ubicación (opcionales).
 *
 * Solo se leen valores cargados; precios de cálculo, P.U. y subtotales los
 * recalcula calculo.ts. Excepción: los ítems cuya cantidad sale de otra hoja
 * (p. ej. "Mov. Suelos", "Arbolado") traen ese valor como una medición.
 *
 * Sin imports de la app a propósito: se testea con `node --test`.
 */
import ExcelJS from 'exceljs'
import { FACTORES_MEDICION, TIPOS_INSUMO, type FactorMedicion, type TipoInsumo } from './calculo.ts'

export class FormatoInvalido extends Error {}

export type MedicionPlanilla = { sector: string; criterio: string } & Record<FactorMedicion, number | null>
export type ItemPlanilla = {
  codigo: string
  descripcion: string
  unidad: string
  observaciones: string
  apu: { insumo: string; cantidad: number }[]
  mediciones: MedicionPlanilla[]
}
export type PlanillaPresupuesto = {
  nombre: string
  descripcion: string
  ubicacion: string
  tipoCambio: number | null
  cargasSociales: number
  coefAjuste: number
  superficieCubierta: number | null
  superficiePredio: number | null
  insumos: { codigo: string; descripcion: string; unidad: string; tipo: TipoInsumo; precioBase: number; fuente: string }[]
  rubros: { numero: number; descripcion: string; items: ItemPlanilla[] }[]
}

/* ------------------------------------------------------------------ */
/* Celdas                                                               */
/* ------------------------------------------------------------------ */

type Celda = { valor: unknown; formula: string | null }

/** Valor (o resultado guardado) y fórmula de una celda de exceljs. */
function celda(v: ExcelJS.CellValue): Celda {
  if (v && typeof v === 'object' && !(v instanceof Date)) {
    if ('formula' in v || 'sharedFormula' in v) {
      const f = v as { formula?: string; sharedFormula?: string; result?: unknown }
      const result = f.result && typeof f.result === 'object' && 'error' in (f.result as object) ? null : f.result
      return { valor: result ?? null, formula: '=' + (f.formula ?? f.sharedFormula ?? '') }
    }
    if ('richText' in v) return { valor: v.richText.map((t) => t.text).join(''), formula: null }
    if ('text' in v) return { valor: (v as { text: unknown }).text, formula: null }
    if ('error' in v) return { valor: null, formula: null }
  }
  return { valor: v ?? null, formula: null }
}

/** Filas como arrays de celdas (índice 0 = columna A), saltando las vacías. */
function filas(ws: ExcelJS.Worksheet): Celda[][] {
  const out: Celda[][] = []
  ws.eachRow({ includeEmpty: false }, (row) => {
    const vals: Celda[] = []
    const n = row.cellCount
    for (let c = 1; c <= n; c++) vals.push(celda(row.getCell(c).value))
    out.push(vals)
  })
  return out
}

const norm = (x: unknown): string =>
  x === null || x === undefined
    ? ''
    : String(x)
        .normalize('NFKD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '')

function num(c: Celda | undefined): number | null {
  if (!c || c.formula) return null
  const v = c.valor
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string') {
    const t = v.trim().replace(',', '.')
    if (t && /^[-+]?\d*\.?\d+(e[-+]?\d+)?$/i.test(t)) return Number(t)
  }
  return null
}

/** Número aunque venga de una fórmula (usa el resultado guardado). */
function numResultado(c: Celda | undefined): number | null {
  if (!c) return null
  return typeof c.valor === 'number' && Number.isFinite(c.valor) ? c.valor : num({ valor: c.valor, formula: null })
}

function txt(c: Celda | undefined): string {
  if (!c || c.valor === null || c.valor === undefined) return ''
  if (typeof c.valor === 'number' && Number.isInteger(c.valor)) return String(c.valor)
  return String(c.valor).trim()
}

function codigoRubro(c: Celda | undefined): number | null {
  if (!c || c.formula) return null
  if (typeof c.valor === 'number' && Number.isInteger(c.valor)) return c.valor
  if (typeof c.valor === 'string' && /^\s*\d+\s*$/.test(c.valor)) return Number(c.valor)
  return null
}

function codigoItem(c: Celda | undefined): string | null {
  const t = txt(c)
  return /^\d+\.\d+$/.test(t) ? t : null
}

function hoja(wb: ExcelJS.Workbook, ...nombres: string[]): ExcelJS.Worksheet | undefined {
  const buscados = new Set(nombres.map(norm))
  return wb.worksheets.find((ws) => buscados.has(norm(ws.name)))
}

/** Ubica cada columna por el texto de su encabezado. */
function columnas<K extends string>(fila: Celda[], claves: Record<K, string[]>): Partial<Record<K, number>> {
  const out: Partial<Record<K, number>> = {}
  fila.forEach((c, idx) => {
    const n = norm(c.valor)
    if (!n) return
    for (const clave of Object.keys(claves) as K[]) {
      if (out[clave] === undefined && claves[clave].some((v) => n === v || n.startsWith(v))) {
        out[clave] = idx
        break
      }
    }
  })
  return out
}

/* ------------------------------------------------------------------ */
/* Hojas                                                                */
/* ------------------------------------------------------------------ */

function leerInsumos(ws: ExcelJS.Worksheet) {
  const params: { tipoCambio?: number | null; cargasSociales?: number | null; coefAjuste?: number | null } = {}
  const insumos: PlanillaPresupuesto['insumos'] = []
  let col: Partial<Record<'codigo' | 'descripcion' | 'unidad' | 'tipo' | 'precioBase' | 'fuente', number>> | null = null

  for (const f of filas(ws)) {
    if (!col) {
      const etiqueta = norm(f[0]?.valor)
      const valor = f.slice(1).map(num).find((v) => v !== null) ?? null
      if (etiqueta.includes('tipodecambio')) params.tipoCambio = valor
      else if (etiqueta.includes('cargassociales')) params.cargasSociales = valor
      else if (etiqueta.includes('coeficientedeajuste')) params.coefAjuste = valor
      else if (etiqueta === 'codigo') {
        col = columnas(f, {
          codigo: ['codigo'],
          descripcion: ['descripcion'],
          unidad: ['un', 'unidad'],
          tipo: ['tipo'],
          precioBase: ['preciobase'],
          fuente: ['fuente'],
        })
        const faltan = (['codigo', 'descripcion', 'tipo', 'precioBase'] as const).filter((k) => col![k] === undefined)
        if (faltan.length) throw new FormatoInvalido(`En la hoja Insumos no se encontraron las columnas: ${faltan.join(', ')}`)
      }
      continue
    }
    const codigo = txt(f[col.codigo!])
    if (!codigo) continue
    const tipo = txt(f[col.tipo!]).toUpperCase()
    if (!(TIPOS_INSUMO as readonly string[]).includes(tipo)) {
      throw new FormatoInvalido(`El insumo «${codigo}» tiene tipo «${tipo}». Los tipos válidos son: ${TIPOS_INSUMO.join(', ')}`)
    }
    insumos.push({
      codigo,
      descripcion: txt(f[col.descripcion!]) || codigo,
      unidad: col.unidad !== undefined ? txt(f[col.unidad]) : '',
      tipo: tipo as TipoInsumo,
      precioBase: num(f[col.precioBase!]) ?? 0,
      fuente: col.fuente !== undefined ? txt(f[col.fuente]) : '',
    })
  }
  if (!col) throw new FormatoInvalido('La hoja Insumos no tiene la fila de encabezados (Código, Descripción, …).')
  return { params, insumos }
}

function leerAnalisis(ws: ExcelJS.Worksheet): Map<string, { insumo: string; cantidad: number }[]> {
  const out = new Map<string, { insumo: string; cantidad: number }[]>()
  let actual: string | null = null
  let col = { codigo: 2, cantidad: 4 }
  for (const f of filas(ws)) {
    if (f.slice(1).some((c) => norm(c.valor) === 'unidad')) {
      actual = codigoItem(f[0])
      if (actual && !out.has(actual)) out.set(actual, [])
      continue
    }
    if (!actual) continue
    if (norm(f[0]?.valor) === 'tipo') {
      const c = columnas(f, { codigo: ['codigo'], cantidad: ['cantidad'] })
      if (c.codigo !== undefined && c.cantidad !== undefined) col = { codigo: c.codigo, cantidad: c.cantidad }
      continue
    }
    const codigo = txt(f[col.codigo])
    const cantidad = num(f[col.cantidad])
    if (codigo && cantidad !== null) out.get(actual)!.push({ insumo: codigo, cantidad })
  }
  return out
}

function leerMediciones(ws: ExcelJS.Worksheet): Map<string, MedicionPlanilla[]> {
  const out = new Map<string, MedicionPlanilla[]>()
  let col: Partial<Record<'item' | 'sector' | 'criterio' | FactorMedicion, number>> | null = null
  for (const f of filas(ws)) {
    if (!col) {
      if (norm(f[0]?.valor) === 'item') {
        col = columnas(f, {
          item: ['item'],
          sector: ['sector'],
          criterio: ['medicion', 'criterio'],
          cant: ['cant'],
          largo: ['largo'],
          ancho: ['ancho'],
          alto: ['alto'],
          coef: ['coef'],
        })
      }
      continue
    }
    const codigo = codigoItem(f[col.item!])
    if (!codigo) continue
    const med = {
      sector: col.sector !== undefined ? txt(f[col.sector]) : '',
      criterio: col.criterio !== undefined ? txt(f[col.criterio]) : '',
    } as MedicionPlanilla
    for (const factor of FACTORES_MEDICION) med[factor] = col[factor] !== undefined ? num(f[col[factor]!]) : null
    const lista = out.get(codigo) ?? []
    lista.push(med)
    out.set(codigo, lista)
  }
  return out
}

const REF_HOJA = /(?:'([^']+)'|([A-Za-z0-9_. ]+))!/

function leerPresupuesto(ws: ExcelJS.Worksheet) {
  const todas = filas(ws)
  const titulo = txt(todas[0]?.[0])
  const subtitulo = txt(todas[1]?.[0])
  let col: Partial<Record<'codigo' | 'descripcion' | 'unidad' | 'cantidad' | 'observaciones', number>> | null = null
  const rubros: PlanillaPresupuesto['rubros'] = []
  const externas = new Map<string, { hoja: string | null; valor: number | null }>()

  for (const f of todas) {
    if (!col) {
      if (norm(f[0]?.valor) === 'item') {
        col = columnas(f, {
          codigo: ['item'],
          descripcion: ['descripcion'],
          unidad: ['un'],
          cantidad: ['cantidad'],
          observaciones: ['observaciones'],
        })
        if (col.codigo === undefined || col.descripcion === undefined) {
          throw new FormatoInvalido('La hoja Presupuesto no tiene las columnas Ítem y Descripción.')
        }
      }
      continue
    }
    const celdaCodigo = f[col.codigo!]
    const descripcion = txt(f[col.descripcion!])
    const numero = codigoRubro(celdaCodigo)
    if (numero !== null && descripcion) {
      rubros.push({ numero, descripcion, items: [] })
      continue
    }
    const codigo = codigoItem(celdaCodigo)
    if (!codigo || !descripcion) continue
    if (!rubros.length) throw new FormatoInvalido(`El ítem ${codigo} aparece antes de cualquier rubro en la hoja Presupuesto.`)

    rubros[rubros.length - 1].items.push({
      codigo,
      descripcion,
      unidad: col.unidad !== undefined ? txt(f[col.unidad]) : '',
      observaciones: col.observaciones !== undefined ? txt(f[col.observaciones]) : '',
      apu: [],
      mediciones: [],
    })

    if (col.cantidad !== undefined) {
      const c = f[col.cantidad]
      if (c?.formula && !/SUMIF/i.test(c.formula)) {
        const ref = REF_HOJA.exec(c.formula)
        externas.set(codigo, { hoja: ref ? (ref[1] ?? ref[2]).trim() : 'otra hoja', valor: numResultado(c) })
      } else if (num(c) !== null) {
        externas.set(codigo, { hoja: null, valor: num(c) })
      }
    }
  }
  if (!col) throw new FormatoInvalido('La hoja Presupuesto no tiene la fila de encabezados (Ítem, Descripción, …).')
  return { titulo, subtitulo, rubros, externas }
}

function leerSuperficies(ws: ExcelJS.Worksheet | undefined) {
  const out: { superficieCubierta?: number; superficiePredio?: number } = {}
  if (!ws) return out
  for (const f of filas(ws)) {
    const textos = f.filter((c) => typeof c.valor === 'string').map((c) => norm(c.valor))
    const valor = f.map(num).find((v) => v !== null)
    if (valor === undefined || valor === null) continue
    if (textos.some((t) => t.includes('superficiecubierta'))) out.superficieCubierta = valor
    else if (textos.some((t) => t.includes('superficiedelpredio'))) out.superficiePredio = valor
  }
  return out
}

function leerUbicacion(ws: ExcelJS.Worksheet | undefined): string {
  if (!ws) return ''
  for (const f of filas(ws)) if (norm(f[0]?.valor) === 'ubicacion') return txt(f[1])
  return ''
}

/* ------------------------------------------------------------------ */
/* Entrada                                                              */
/* ------------------------------------------------------------------ */

export async function leerPlanilla(
  data: ArrayBuffer | Uint8Array,
  nombreArchivo = 'Presupuesto'
): Promise<{ planilla: PlanillaPresupuesto; avisos: string[] }> {
  const wb = new ExcelJS.Workbook()
  try {
    // exceljs' types predate the generic Buffer in newer @types/node.
    await wb.xlsx.load(data as unknown as ArrayBuffer)
  } catch {
    throw new FormatoInvalido('No se pudo leer el archivo. Tiene que ser una planilla de Excel .xlsx.')
  }

  const requeridas: Record<string, string[]> = {
    Insumos: ['Insumos'],
    'Analisis de Precios': ['Analisis de Precios'],
    'Computo metrico': ['Computo metrico'],
    Presupuesto: ['Presupuesto'],
  }
  const hojas = Object.fromEntries(Object.entries(requeridas).map(([k, ns]) => [k, hoja(wb, ...ns)]))
  const faltan = Object.keys(hojas).filter((k) => !hojas[k])
  if (faltan.length) {
    throw new FormatoInvalido(
      `A la planilla le faltan las hojas: ${faltan.join(', ')}. Tiene que ser una planilla de cómputo y presupuesto (no un certificado).`
    )
  }

  const avisos: string[] = []
  const { params, insumos } = leerInsumos(hojas.Insumos!)
  const analisis = leerAnalisis(hojas['Analisis de Precios']!)
  const mediciones = leerMediciones(hojas['Computo metrico']!)
  const { titulo, subtitulo, rubros, externas } = leerPresupuesto(hojas.Presupuesto!)

  const codigosInsumo = new Set(insumos.map((i) => i.codigo))
  const codigosItem = new Set<string>()
  for (const rubro of rubros) {
    for (const item of rubro.items) {
      codigosItem.add(item.codigo)
      item.apu = analisis.get(item.codigo) ?? []
      if (!item.apu.length) avisos.push(`El ítem ${item.codigo} no tiene análisis de precio: queda con P.U. $ 0.`)
      for (const linea of item.apu) {
        if (!codigosInsumo.has(linea.insumo)) {
          throw new FormatoInvalido(
            `El análisis del ítem ${item.codigo} usa el insumo «${linea.insumo}», que no está en la hoja Insumos.`
          )
        }
      }
      item.mediciones = [...(mediciones.get(item.codigo) ?? [])]
      const ext = externas.get(item.codigo)
      if (ext) {
        if (ext.valor === null) {
          avisos.push(
            `La cantidad del ítem ${item.codigo} sale de la hoja «${ext.hoja}», pero el Excel no tiene el valor calculado guardado. Abrilo y guardalo en Excel, o cargá la medición a mano.`
          )
        } else {
          item.mediciones.push({
            sector: ext.hoja ? `Hoja ${ext.hoja}` : 'Presupuesto',
            criterio:
              item.observaciones ||
              (ext.hoja ? `Cantidad tomada de la hoja ${ext.hoja}` : 'Cantidad escrita en la hoja Presupuesto'),
            cant: ext.valor,
            largo: null,
            ancho: null,
            alto: null,
            coef: null,
          })
        }
      }
    }
  }

  const huerfanas = [...mediciones.keys()].filter((c) => !codigosItem.has(c))
  if (huerfanas.length) {
    avisos.push(`Hay mediciones de ítems que no están en la hoja Presupuesto (no se importaron): ${huerfanas.join(', ')}`)
  }
  if (!rubros.length) throw new FormatoInvalido('No se encontró ningún rubro en la hoja Presupuesto.')

  const resumen = hoja(wb, 'Resumen')
  const nombre =
    (resumen ? txt(filas(resumen)[0]?.[0]) : '') || titulo.split(/\s+[—–-]\s+/)[0] || nombreArchivo.replace(/\.xlsx$/i, '')

  return {
    planilla: {
      nombre,
      descripcion: subtitulo,
      ubicacion: leerUbicacion(hoja(wb, 'Supuestos y Fuentes')),
      tipoCambio: params.tipoCambio ?? null,
      cargasSociales: params.cargasSociales ?? 0,
      coefAjuste: params.coefAjuste ?? 1,
      superficieCubierta: null,
      superficiePredio: null,
      ...leerSuperficies(resumen),
      insumos,
      rubros,
    },
    avisos,
  }
}
