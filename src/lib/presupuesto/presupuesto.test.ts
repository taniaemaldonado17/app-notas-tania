/**
 * Run with: npm run test:presupuesto
 *
 * The real-spreadsheet test reads the budget from "computo y presupuesto/"
 * (kept out of git); it's skipped when the file isn't there.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import ExcelJS from 'exceljs'
import { calcular, parcialMedicion, precioCalculo, type ApuIn, type ItemIn, type MedicionIn } from './calculo.ts'
import { FormatoInvalido, leerPlanilla, type PlanillaPresupuesto } from './importar.ts'

const close = (a: number, b: number, msg?: string) =>
  assert.ok(Math.abs(a - b) <= 1e-6 * Math.max(1, Math.abs(b)), `${msg ?? ''} ${a} != ${b}`)

test('precio de cálculo: MO lleva cargas sociales, el resto el coeficiente', () => {
  close(precioCalculo('MO', 1000, 1.1, 0.9), 2100)
  for (const t of ['MAT', 'EQ', 'SUB']) close(precioCalculo(t, 1000, 1.1, 0.9), 900)
})

test('parcial de medición ignora factores vacíos', () => {
  close(parcialMedicion({ cant: 2, largo: 10, ancho: null, alto: 0.5, coef: null }), 10)
  assert.equal(parcialMedicion({ cant: null, largo: null, ancho: null, alto: null, coef: null }), 0)
})

test('cálculo de un presupuesto chico', () => {
  const insumos = [
    { id: 'of', tipo: 'MO', precioBase: 100 },
    { id: 'cem', tipo: 'MAT', precioBase: 50 },
    { id: 'retro', tipo: 'EQ', precioBase: 300 },
    { id: 'topo', tipo: 'SUB', precioBase: 400 },
  ]
  const rubros = [
    { id: 'r1', numero: 1, descripcion: 'Uno', position: 0 },
    { id: 'r2', numero: 2, descripcion: 'Dos', position: 1 },
  ]
  const item = (id: string, rubroId: string, position: number): ItemIn => ({
    id, rubroId, codigo: id, descripcion: id, unidad: null, observaciones: null, position,
  })
  const items = [item('a', 'r1', 0), item('b', 'r2', 1)]
  const apu: ApuIn[] = [
    { itemId: 'a', insumoId: 'of', cantidad: 2 },
    { itemId: 'a', insumoId: 'cem', cantidad: 1 },
    { itemId: 'b', insumoId: 'retro', cantidad: 1 },
    { itemId: 'b', insumoId: 'topo', cantidad: 1 },
  ]
  const med = (itemId: string, f: Partial<MedicionIn>): MedicionIn => ({
    itemId, cant: null, largo: null, ancho: null, alto: null, coef: null, ...f,
  })
  const mediciones = [med('a', { cant: 2, largo: 5 }), med('a', { largo: 3, ancho: 2 }), med('b', { cant: 1 })]
  const c = calcular(
    { tipoCambio: 1000, cargasSociales: 1, coefAjuste: 1, superficieCubierta: null, superficiePredio: null },
    insumos, rubros, items, apu, mediciones
  )
  const a = c.rubros[0].items[0]
  close(a.puMo, 400)
  close(a.puMat, 50)
  close(a.cantidad, 16)
  close(a.subtotal, 16 * 450)
  close(c.rubros[1].items[0].puEq, 700) // EQ y SUB juntos
  close(c.total, 7900)
  close(c.rubros[0].incidencia, 7200 / 7900)
  close(c.totalUsd!, 7.9)
})

/** Same shape the server builds from the database, from a parsed spreadsheet. */
function calcularPlanilla(p: PlanillaPresupuesto) {
  const insumos = p.insumos.map((i) => ({ id: i.codigo, tipo: i.tipo, precioBase: i.precioBase }))
  const rubros = p.rubros.map((r, i) => ({ id: `r${r.numero}`, numero: r.numero, descripcion: r.descripcion, position: i }))
  const items: ItemIn[] = []
  const apu: ApuIn[] = []
  const mediciones: MedicionIn[] = []
  p.rubros.forEach((r) =>
    r.items.forEach((it) => {
      items.push({ id: it.codigo, rubroId: `r${r.numero}`, codigo: it.codigo, descripcion: it.descripcion, unidad: it.unidad, observaciones: it.observaciones, position: items.length })
      it.apu.forEach((l) => apu.push({ itemId: it.codigo, insumoId: l.insumo, cantidad: l.cantidad }))
      it.mediciones.forEach((m) => mediciones.push({ itemId: it.codigo, cant: m.cant, largo: m.largo, ancho: m.ancho, alto: m.alto, coef: m.coef }))
    })
  )
  return calcular(p, insumos, rubros, items, apu, mediciones)
}

const CARPETA = path.resolve('computo y presupuesto')
const PLANILLA = existsSync(CARPETA)
  ? readdirSync(CARPETA).filter((f) => /^Computo_Presupuesto.*\.xlsx$/i.test(f)).map((f) => path.join(CARPETA, f))[0]
  : undefined

test('planilla real: coincide ítem por ítem con los valores de Excel', { skip: !PLANILLA && 'no está la planilla de ejemplo' }, async () => {
  const data = readFileSync(PLANILLA!)
  const { planilla, avisos } = await leerPlanilla(data)
  assert.deepEqual(avisos, [])
  assert.equal(planilla.nombre, 'PREDIO DEPORTIVO ALFREDO DANIEL NIEVES')
  assert.equal(planilla.tipoCambio, 1570)
  close(planilla.cargasSociales, 1.1)
  close(planilla.superficiePredio!, 29470)
  assert.equal(planilla.insumos.length, 141)
  assert.equal(planilla.rubros.length, 23)

  const c = calcularPlanilla(planilla)
  assert.equal(c.cantidadItems, 135)

  // Values Excel computed and saved in the file.
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(data as unknown as ArrayBuffer)
  const ws = wb.getWorksheet('Presupuesto')!
  // Formula cells whose result is 0 are saved without a result in this file.
  const res = (v: ExcelJS.CellValue) =>
    v && typeof v === 'object' && ('formula' in v || 'sharedFormula' in v)
      ? Number((v as { result?: unknown }).result ?? 0)
      : Number(v ?? 0)
  const excel = new Map<string, number[]>()
  let totalExcel = 0
  ws.eachRow((row) => {
    const codigo = row.getCell(1).value
    if (typeof codigo === 'string' && /^\d+\.\d+$/.test(codigo)) {
      excel.set(codigo, [4, 5, 6, 7, 9].map((col) => res(row.getCell(col).value)))
    }
    if (String(row.getCell(2).value ?? '').includes('TOTAL')) totalExcel = res(row.getCell(9).value)
  })
  for (const r of c.rubros) {
    for (const it of r.items) {
      const [cant, mat, mo, eq, sub] = excel.get(it.codigo)!
      close(it.cantidad, cant, `${it.codigo} cantidad`)
      close(it.puMat, mat, `${it.codigo} P.U. materiales`)
      close(it.puMo, mo, `${it.codigo} P.U. mano de obra`)
      close(it.puEq, eq, `${it.codigo} P.U. equipos`)
      close(it.subtotal, sub, `${it.codigo} subtotal`)
    }
  }
  close(c.total, totalExcel, 'total')
  assert.equal(Math.round(c.total * 100), 170374700104)

  const arbolado = planilla.rubros[0].items.find((i) => i.codigo === '1.07')!
  assert.equal(arbolado.mediciones.length, 1)
  assert.equal(arbolado.mediciones[0].sector, 'Hoja Arbolado')
})

test('un archivo que no es presupuesto da un error claro', async () => {
  const wb = new ExcelJS.Workbook()
  wb.addWorksheet('1-CERTIFICADO').addRow(['OBRA', 'algo'])
  const buf = await wb.xlsx.writeBuffer()
  await assert.rejects(leerPlanilla(buf as ArrayBuffer), (e: Error) => e instanceof FormatoInvalido && /faltan las hojas/.test(e.message))
})

test('un archivo que no es Excel da un error claro', async () => {
  await assert.rejects(leerPlanilla(new TextEncoder().encode('hola')), FormatoInvalido)
})
