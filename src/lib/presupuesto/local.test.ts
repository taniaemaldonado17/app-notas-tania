/** Offline budget engine. Run with: npm run test:presupuesto */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { aplicarLocal, conIds, derivarDetalle, derivarInsumos, derivarItem, ErrorLocal, type Snapshot } from './local.ts'

const close = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`)

function base(): Snapshot {
  return {
    info: {
      id: 'p', pageId: 'pg', rowId: null, nombre: 'Obra', descripcion: null, ubicacion: null, tipoCambio: 1000,
      cargasSociales: 1, coefAjuste: 1, superficieCubierta: 10, superficiePredio: null, totalCache: 0,
      createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
    },
    insumos: [
      { id: 'of', codigo: 'OF', descripcion: 'Oficial', unidad: 'h', tipo: 'MO', precioBase: 100, fuente: null, position: 0 },
      { id: 'cem', codigo: 'CEM', descripcion: 'Cemento', unidad: 'bolsa', tipo: 'MAT', precioBase: 50, fuente: null, position: 1 },
    ],
    rubros: [
      { id: 'r1', numero: 1, descripcion: 'Uno', position: 0 },
      { id: 'r2', numero: 2, descripcion: 'Dos', position: 1 },
    ],
    items: [
      { id: 'a', rubroId: 'r1', codigo: '1.01', descripcion: 'A', unidad: 'm2', observaciones: null, position: 0 },
      { id: 'b', rubroId: 'r2', codigo: '2.01', descripcion: 'B', unidad: 'm3', observaciones: null, position: 1 },
    ],
    apu: [
      { id: 'x1', itemId: 'a', insumoId: 'of', cantidad: 2, position: 0 },
      { id: 'x2', itemId: 'a', insumoId: 'cem', cantidad: 1, position: 1 },
      { id: 'x3', itemId: 'b', insumoId: 'cem', cantidad: 4, position: 0 },
    ],
    mediciones: [
      { id: 'm1', itemId: 'a', sector: null, criterio: null, cant: 2, largo: 5, ancho: null, alto: null, coef: null, position: 0 },
      { id: 'm2', itemId: 'b', sector: null, criterio: null, cant: 1, largo: null, ancho: null, alto: null, coef: null, position: 0 },
    ],
  }
}

test('detalle derivado: mismos totales que el cálculo', () => {
  const d = derivarDetalle(base())
  // a: (2×200 + 50) × 10 = 4500; b: 4×50 × 1 = 200
  close(d.calc.total, 4700)
  close(d.info.totalCache, 4700)
  close(d.calc.porM2Cubierto!, 470)
})

test('cargar una medición recalcula ítem y total', () => {
  const s = aplicarLocal(base(), conIds({ op: 'medicion.crear', data: { itemId: 'a', largo: 3, ancho: 2 } }))
  const it = derivarItem(s, 'a')!
  close(it.cantidad, 16)
  close(it.subtotal, 16 * 450)
  assert.equal(it.mediciones.length, 2)
  close(derivarDetalle(s).calc.total, 16 * 450 + 200)
})

test('editar y borrar mediciones', () => {
  let s = aplicarLocal(base(), { op: 'medicion.editar', id: 'm1', data: { largo: 10 } })
  close(derivarItem(s, 'a')!.cantidad, 20)
  s = aplicarLocal(s, { op: 'medicion.eliminar', id: 'm1' })
  close(derivarItem(s, 'a')!.cantidad, 0)
})

test('el precio de un insumo cambia todos los ítems que lo usan', () => {
  const s = aplicarLocal(base(), { op: 'insumo.editar', id: 'cem', data: { precioBase: 100 } })
  close(derivarItem(s, 'a')!.puTotal, 500)
  close(derivarItem(s, 'b')!.puTotal, 400)
  assert.equal(derivarInsumos(s).find((i) => i.id === 'cem')!.usos, 2)
})

test('parámetros: cargas sociales', () => {
  const s = aplicarLocal(base(), { op: 'parametros', data: { cargasSociales: 0 } })
  close(derivarItem(s, 'a')!.puTotal, 250)
})

test('ítem nuevo: código siguiente del rubro, queda al final del rubro', () => {
  const op = conIds({ op: 'item.crear', data: { rubroId: 'r1', descripcion: 'Nuevo' } })
  const s = aplicarLocal(base(), op)
  const nuevo = s.items.find((i) => i.id === (op as { nuevoId: string }).nuevoId)!
  assert.equal(nuevo.codigo, '1.02')
  assert.deepEqual(derivarDetalle(s).calc.rubros[0].items.map((i) => i.codigo), ['1.01', '1.02'])
  assert.equal(s.items.find((i) => i.id === 'b')!.position, 2)
})

test('rubro nuevo: número siguiente; borrar rubro borra sus ítems', () => {
  let s = aplicarLocal(base(), conIds({ op: 'rubro.crear', data: { descripcion: 'Tres' } }))
  assert.equal(s.rubros.at(-1)!.numero, 3)
  s = aplicarLocal(s, { op: 'rubro.eliminar', id: 'r1' })
  assert.equal(s.items.some((i) => i.id === 'a'), false)
  assert.equal(s.mediciones.some((m) => m.itemId === 'a'), false)
  close(derivarDetalle(s).calc.total, 200)
})

test('mismas validaciones que el servidor', () => {
  assert.throws(() => aplicarLocal(base(), { op: 'insumo.eliminar', id: 'cem' }), ErrorLocal)
  assert.throws(
    () => aplicarLocal(base(), conIds({ op: 'insumo.crear', data: { codigo: 'OF', descripcion: 'x', tipo: 'MO', precioBase: 1 } })),
    ErrorLocal
  )
  assert.throws(() => aplicarLocal(base(), { op: 'medicion.editar', id: 'nope', data: { cant: 1 } }), ErrorLocal)
})

test('aplicar no modifica la copia original', () => {
  const s = base()
  aplicarLocal(s, { op: 'medicion.editar', id: 'm1', data: { largo: 99 } })
  assert.equal(s.mediciones[0].largo, 5)
})
