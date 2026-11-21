const ars = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 2, maximumFractionDigits: 2 })
const usd = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 })
const arsCorto = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', notation: 'compact', maximumFractionDigits: 1 })
const numero = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2 })
const numeroFino = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 4 })
const pct = new Intl.NumberFormat('es-AR', { style: 'percent', minimumFractionDigits: 2, maximumFractionDigits: 2 })

export const fmtARS = (v: number | null | undefined) => (v === null || v === undefined ? '–' : ars.format(v))
export const fmtUSD = (v: number | null | undefined) => (v === null || v === undefined ? '–' : usd.format(v))
export const fmtARSCorto = (v: number | null | undefined) => (v === null || v === undefined ? '–' : arsCorto.format(v))
export const fmtNum = (v: number | null | undefined) => (v === null || v === undefined ? '' : numero.format(v))
/** Rendimientos (0,005 h/m²) need more decimals than quantities. */
export const fmtNumFino = (v: number | null | undefined) => (v === null || v === undefined ? '' : numeroFino.format(v))
export const fmtPct = (v: number | null | undefined) => (v === null || v === undefined ? '–' : pct.format(v))

/** Value shown in an editable number field: no thousands separator, comma decimals. */
export const fmtInput = (v: number | null | undefined) =>
  v === null || v === undefined ? '' : String(Math.round(v * 1e6) / 1e6).replace('.', ',')

/**
 * Number typed by the user, Argentine style or not: "1.234,5" · "1234,5" ·
 * "1234.5" · "0,15" · "1.500" (thousands). Empty → null; invalid → NaN.
 */
export function parseNumeroAR(raw: string): number | null {
  let s = raw.trim().replace(/\s|\$/g, '')
  if (!s) return null
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.')
  else if ((s.match(/\./g) ?? []).length > 1) s = s.replace(/\./g, '')
  else if (/^-?[1-9]\d{0,2}\.\d{3}$/.test(s)) s = s.replace('.', '') // "1.500" = mil quinientos
  const n = Number(s)
  return Number.isFinite(n) ? n : NaN
}
