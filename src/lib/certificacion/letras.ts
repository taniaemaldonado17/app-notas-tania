/** Amounts in words for certificates: 1234.5 → "SON PESOS MIL DOSCIENTOS TREINTA Y CUATRO CON 50/100". */

const UNIDADES = ['', 'UN', 'DOS', 'TRES', 'CUATRO', 'CINCO', 'SEIS', 'SIETE', 'OCHO', 'NUEVE']
const DIEZ_A_DIECINUEVE = ['DIEZ', 'ONCE', 'DOCE', 'TRECE', 'CATORCE', 'QUINCE', 'DIECISEIS', 'DIECISIETE', 'DIECIOCHO', 'DIECINUEVE']
const DECENAS = ['', 'DIEZ', 'VEINTE', 'TREINTA', 'CUARENTA', 'CINCUENTA', 'SESENTA', 'SETENTA', 'OCHENTA', 'NOVENTA']
const CENTENAS = ['', 'CIENTO', 'DOSCIENTOS', 'TRESCIENTOS', 'CUATROCIENTOS', 'QUINIENTOS', 'SEISCIENTOS', 'SETECIENTOS', 'OCHOCIENTOS', 'NOVECIENTOS']

/** 0-999. `apocopado`: "UN"/"VEINTIUN" (before MIL/MILLONES) instead of "UNO"/"VEINTIUNO". */
function tresCifras(n: number, apocopado: boolean): string {
  if (n === 0) return ''
  if (n === 100) return 'CIEN'
  const c = Math.floor(n / 100)
  const resto = n % 100
  const d = Math.floor(resto / 10)
  const u = resto % 10
  const uni = (x: number) => (x === 1 && !apocopado ? 'UNO' : UNIDADES[x])
  const partes: string[] = []
  if (c) partes.push(CENTENAS[c])
  if (resto >= 10 && resto < 20) partes.push(DIEZ_A_DIECINUEVE[resto - 10])
  else if (resto >= 20 && resto < 30) partes.push(u === 0 ? 'VEINTE' : `VEINTI${uni(u)}`)
  else {
    if (d) partes.push(DECENAS[d])
    if (u) {
      if (d) partes.push('Y')
      partes.push(uni(u))
    }
  }
  return partes.join(' ')
}

/** 0 - 999.999 */
function hastaMillon(n: number, apocopado: boolean): string {
  const miles = Math.floor(n / 1000)
  const resto = n % 1000
  const partes: string[] = []
  if (miles === 1) partes.push('MIL')
  else if (miles > 1) partes.push(`${tresCifras(miles, true)} MIL`)
  if (resto) partes.push(tresCifras(resto, apocopado))
  return partes.join(' ')
}

function entero(n: number, apocopado = false): string {
  if (n === 0) return 'CERO'
  const millones = Math.floor(n / 1_000_000)
  const resto = n % 1_000_000
  const partes: string[] = []
  if (millones === 1) partes.push('UN MILLON')
  else if (millones > 1) partes.push(`${entero(millones, true)} MILLONES`)
  if (resto) partes.push(hastaMillon(resto, apocopado))
  return partes.join(' ')
}

export function importeEnLetras(valor: number): string {
  if (!Number.isFinite(valor)) return 'SON PESOS CERO CON 00/100'
  const centavosTotales = Math.round(Math.abs(valor) * 100)
  const ent = Math.floor(centavosTotales / 100)
  const cent = centavosTotales % 100
  return `SON PESOS ${valor < 0 ? 'MENOS ' : ''}${entero(ent)} CON ${String(cent).padStart(2, '0')}/100`
}
