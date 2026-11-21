/** Same cases as the Flask app's test_calculo_certificados.py. Run: npm run test:presupuesto */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { calcularCertificado, compararCurvas, ErrorCertificado, type Antecedente, type CertificadoCalc } from './calculo.ts'

const contrato = (tipo: 'deposito' | 'poliza' = 'deposito') => ({
  montoContrato: 1000,
  anticipoPct: 0.3,
  fondoReparoPct: 0.05,
  fondoReparoTipo: tipo,
})
const item = (id: string, importe = 500) => ({ id, codigo: id, descripcion: `Item ${id}`, importe })
const close = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`)

/** What a saved certificate leaves for the next one. */
function antecedenteDe(c: CertificadoCalc): Antecedente {
  return {
    acumuladoPorItem: Object.fromEntries(c.lineas.map((l) => [l.contratoItemId, l.acumulado])),
    montoBrutoAcumulado: c.montoBrutoAcumulado,
    anticipoAcumulado: c.anticipoAcumulado,
    fondoReparoAcumulado: c.fondoReparoAcumulado,
  }
}

test('primer certificado sin antecedente', () => {
  const c = calcularCertificado(contrato(), [item('a'), item('b')], null, { a: 1 })
  const a = c.lineas.find((l) => l.contratoItemId === 'a')!
  assert.deepEqual([a.anterior, a.presente, a.acumulado], [0, 1, 1])
  close(c.montoBruto, 500)
  close(c.descuentoAnticipo, 150) // 500 × 30 %
  close(c.descuentoFondoReparo, 25) // 500 × 5 %
  close(c.montoNeto, 325)
  close(c.porcentajeAvance, 0.5)
})

test('el segundo certificado arrastra el acumulado', () => {
  const items = [item('a')]
  const c1 = calcularCertificado(contrato(), items, null, { a: 0.4 })
  const c2 = calcularCertificado(contrato(), items, antecedenteDe(c1), { a: 0.3 })
  close(c2.lineas[0].anterior, 0.4)
  close(c2.lineas[0].acumulado, 0.7)
  close(c2.montoBrutoAcumulado, 350)
})

test('el acumulado no puede superar el 100 %', () => {
  const items = [item('a')]
  const c1 = calcularCertificado(contrato(), items, null, { a: 0.8 })
  assert.throws(() => calcularCertificado(contrato(), items, antecedenteDe(c1), { a: 0.3 }), ErrorCertificado)
})

test('el tope de anticipo frena el descuento', () => {
  const items = [item('a'), item('b'), item('c')]
  const c1 = calcularCertificado(contrato(), items, null, { a: 1 })
  const c2 = calcularCertificado(contrato(), items, antecedenteDe(c1), { b: 1 })
  close(c2.descuentoAnticipo, 150)
  close(c2.anticipoAcumulado, 300)
  close(c2.saldoAnticipo, 0)
  const c3 = calcularCertificado(contrato(), items, antecedenteDe(c2), { c: 1 })
  close(c3.descuentoAnticipo, 0)
  close(c3.montoBruto, 500)
  close(c3.montoNeto, c3.montoBruto - c3.descuentoFondoReparo)
})

test('fondo de reparo con póliza: se sustituye sin afectar el neto', () => {
  const c = calcularCertificado(contrato('poliza'), [item('a')], null, { a: 1 })
  close(c.descuentoFondoReparo, 25)
  close(c.fondoReparoAcumulado, 25)
  close(c.sustitucionFondoReparo, 25)
  close(c.montoNeto, c.montoBruto - c.descuentoAnticipo)
})

test('fondo de reparo con depósito: sin sustitución', () => {
  const c = calcularCertificado(contrato('deposito'), [item('a')], null, { a: 1 })
  close(c.sustitucionFondoReparo, 0)
  close(c.montoNeto, c.montoBruto - c.descuentoAnticipo - c.descuentoFondoReparo)
})

test('rectificar = recalcular con el antecedente del certificado anterior', () => {
  const items = [item('a')]
  // Rectifying certificate 1 uses no antecedent (it was the first one).
  const rect = calcularCertificado(contrato(), items, null, { a: 0.6 })
  close(rect.montoBruto, 300)
  close(rect.porcentajeAvance, 0.3)
  close(rect.lineas[0].acumulado, 0.6)
})

test('curva: plan N contra certificado N, desvío real − plan', () => {
  const puntos = compararCurvas(
    [
      { orden: 1, periodo: 'Mes 1', porcentajeAcumulado: 0.1 },
      { orden: 2, periodo: 'Mes 2', porcentajeAcumulado: 0.3 },
    ],
    [{ numero: 1, fecha: '2026-12-01', periodo: 'Noviembre 2026', porcentajeAvance: 0.08 }]
  )
  assert.equal(puntos.length, 2)
  close(puntos[0].desvio!, -0.02)
  assert.equal(puntos[0].periodo, 'Mes 1')
  assert.equal(puntos[1].real, null)
  assert.equal(puntos[1].desvio, null)
})

test('importe en letras', async () => {
  const { importeEnLetras: l } = await import('./letras.ts')
  assert.equal(l(0), 'SON PESOS CERO CON 00/100')
  assert.equal(l(1), 'SON PESOS UNO CON 00/100')
  assert.equal(l(21), 'SON PESOS VEINTIUNO CON 00/100')
  assert.equal(l(100), 'SON PESOS CIEN CON 00/100')
  assert.equal(l(101.5), 'SON PESOS CIENTO UNO CON 50/100')
  assert.equal(l(1000), 'SON PESOS MIL CON 00/100')
  assert.equal(l(21000), 'SON PESOS VEINTIUN MIL CON 00/100')
  assert.equal(l(800000), 'SON PESOS OCHOCIENTOS MIL CON 00/100')
  assert.equal(l(1_000_000), 'SON PESOS UN MILLON CON 00/100')
  assert.equal(l(2_500_000.99), 'SON PESOS DOS MILLONES QUINIENTOS MIL CON 99/100')
  assert.equal(
    l(1_703_747_001.04),
    'SON PESOS MIL SETECIENTOS TRES MILLONES SETECIENTOS CUARENTA Y SIETE MIL UNO CON 04/100'
  )
  assert.equal(l(31_000_000), 'SON PESOS TREINTA Y UN MILLONES CON 00/100')
  assert.equal(l(0.999), 'SON PESOS UNO CON 00/100')
})
