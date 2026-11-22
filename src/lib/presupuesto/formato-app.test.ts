/**
 * The Cómputo y Presupuesto app's JSON ↔ this system, and moving items/rubros.
 * Run with: npm run test:presupuesto
 * The real-project tests read "computo y presupuesto/app_computo/datos" (kept out of git); skipped if missing.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { leerJsonApp, snapshotAProyecto } from './formato-app.ts'
import { aplicarLocal, derivarDetalle, moverItem, verificar, type Snapshot } from './local.ts'
import type { PlanillaPresupuesto } from './importar.ts'

const DATOS = path.resolve('computo y presupuesto/app_computo/datos')
const close = (a: number, b: number) => assert.ok(Math.abs(a - b) <= 0.005, `${a} != ${b}`)

/** What guardarPlanilla would store, as a snapshot. */
function aSnapshot(p: PlanillaPresupuesto): Snapshot {
  let n = 0
  const id = () => `x${n++}`
  const insumos = p.insumos.map((i, position) => ({ id: id(), ...i, unidad: i.unidad || null, fuente: i.fuente || null, position }))
  const porCodigo = new Map(insumos.map((i) => [i.codigo, i.id]))
  const s: Snapshot = {
    info: {
      id: 'p', pageId: null, rowId: null, nombre: p.nombre, descripcion: null, ubicacion: null, tipoCambio: p.tipoCambio,
      cargasSociales: p.cargasSociales, coefAjuste: p.coefAjuste, superficieCubierta: null, superficiePredio: null,
      gastosGenerales: p.gastosGenerales ?? 0, beneficio: p.beneficio ?? 0, impuestos: p.impuestos ?? 0, totalCache: 0,
      createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
    },
    insumos, rubros: [], items: [], apu: [], mediciones: [],
  }
  p.rubros.forEach((r, position) => {
    const rubroId = id()
    s.rubros.push({ id: rubroId, numero: r.numero, descripcion: r.descripcion, position })
    for (const it of r.items) {
      const itemId = id()
      s.items.push({ id: itemId, rubroId, codigo: it.codigo, descripcion: it.descripcion, unidad: it.unidad || null, observaciones: it.observaciones || null, position: s.items.length })
      it.apu.forEach((l, position) => s.apu.push({ id: id(), itemId, insumoId: porCodigo.get(l.insumo)!, cantidad: l.cantidad, position }))
      it.mediciones.forEach((m, position) => s.mediciones.push({ id: id(), itemId, ...m, sector: m.sector || null, criterio: m.criterio || null, position }))
    }
  })
  return s
}

for (const [archivo, total] of [
  ['Predio Deportivo - 1a etapa.json', 182728680.73],
  ['Predio Deportivo - proyecto completo rev2.json', 1703747001.04],
] as const) {
  const ruta = path.join(DATOS, archivo)
  test(`JSON de la app: ${archivo} → mismo total, y vuelta al formato de la app`, { skip: !existsSync(ruta) }, () => {
    const planilla = leerJsonApp(JSON.parse(readFileSync(ruta, 'utf8')), archivo)
    const s = aSnapshot(planilla)
    close(derivarDetalle(s).calc.total, total)
    assert.equal(typeof planilla.gastosGenerales, 'number')
    // Back to the app's format: its own engine gives the same total.
    const CPCalculo = createRequire(import.meta.url)('./app-computo/calculo.js')
    close(CPCalculo.planilla(snapshotAProyecto(s)).total, total)
    assert.equal(verificar(s).filter((c) => c.nivel === 'error').length, 0)
  })
}

test('un JSON que no es de la app da un error claro', () => {
  assert.throws(() => leerJsonApp({ hola: 1 }, 'x.json'), /no es un respaldo/)
})

test('mover ítems renumera los códigos del rubro', () => {
  const s = aSnapshot({
    nombre: 'x', descripcion: '', ubicacion: '', tipoCambio: null, cargasSociales: 0, coefAjuste: 1, superficieCubierta: null, superficiePredio: null,
    insumos: [],
    rubros: [
      { numero: 1, descripcion: 'Uno', items: ['A', 'B', 'C'].map((d, k) => ({ codigo: `1.0${k + 1}`, descripcion: d, unidad: 'u', observaciones: '', apu: [], mediciones: [] })) },
      { numero: 2, descripcion: 'Dos', items: [{ codigo: '2.01', descripcion: 'D', unidad: 'u', observaciones: '', apu: [], mediciones: [] }] },
    ],
  })
  const c = s.items.find((i) => i.descripcion === 'C')!
  let t = aplicarLocal(s, { op: 'item.mover', id: c.id, dir: -1 })
  const orden = (x: Snapshot) => derivarDetalle(x).calc.rubros.map((r) => r.items.map((i) => `${i.codigo} ${i.descripcion}`))
  assert.deepEqual(orden(t), [['1.01 A', '1.02 C', '1.03 B'], ['2.01 D']])
  assert.equal(moverItem(t, s.items[0].id, -1), null) // first one can't go up
  const r2 = t.rubros.find((r) => r.descripcion === 'Dos')!
  t = aplicarLocal(t, { op: 'rubro.mover', id: r2.id, dir: -1 })
  assert.deepEqual(orden(t), [['1.01 D'], ['2.01 A', '2.02 C', '2.03 B']])
})
