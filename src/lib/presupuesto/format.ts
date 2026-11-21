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
