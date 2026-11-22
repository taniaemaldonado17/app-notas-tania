/**
 * Formato de la app "Cómputo y Presupuesto" (app_computo): su respaldo JSON
 * `{ formato: "computo-presupuesto", version, proyecto }` ↔ este sistema.
 *
 *   proyecto = {
 *     meta:  { nombre, tc, cargas, coef, gg, ben, imp, rubros: [{ id, n }] },   // rubros en orden
 *     ins:   [{ c, d, u, t, p, f }],
 *     items: [{ id, r, o, d, u, obs, apu: [{ c, q }], med: [{ s, d, n, l, a, h, k }] }]
 *   }
 *
 * Los códigos de ítem no se guardan allá: salen del orden ("<n° de rubro>.<orden con 2 dígitos>").
 * Sin imports de la app a propósito: se testea con `node --test`.
 */
import { TIPOS_INSUMO, type TipoInsumo } from './calculo.ts'
import { FormatoInvalido, type PlanillaPresupuesto } from './importar.ts'
import type { Snapshot } from './local.ts'

type Num = number | string | null | undefined

export type ProyectoApp = {
  id?: string
  meta: {
    nombre?: string
    creado?: number
    tc?: Num
    cargas?: Num
    coef?: Num
    gg?: Num
    ben?: Num
    imp?: Num
    rubros?: { id: string; n?: string }[]
  }
  ins?: { c: string; d?: string; u?: string; t?: string; p?: Num; f?: string }[]
  items?: {
    id?: string
    r?: string
    o?: Num
    d?: string
    u?: string
    obs?: string
    apu?: { c: string; q?: Num }[]
    med?: { s?: string; d?: string; n?: Num; l?: Num; a?: Num; h?: Num; k?: Num }[]
  }[]
}

const num = (v: Num): number => {
  const x = typeof v === 'string' ? Number(v.replace(',', '.')) : Number(v)
  return Number.isFinite(x) ? x : 0
}
const opcional = (v: Num): number | null => (v === null || v === undefined || v === '' ? null : num(v))
const texto = (v: unknown) => (v == null ? '' : String(v).trim())
const dos = (n: number) => String(n).padStart(2, '0')

/** The backup JSON, or the bare project. Throws FormatoInvalido if it isn't one. */
export function leerJsonApp(data: unknown, nombreArchivo: string): PlanillaPresupuesto {
  const raiz = data as { formato?: string; proyecto?: ProyectoApp } & Partial<ProyectoApp>
  const p: ProyectoApp | undefined = raiz?.proyecto ?? (raiz?.meta ? (raiz as ProyectoApp) : undefined)
  if (!p || typeof p !== 'object' || !p.meta || !Array.isArray(p.items ?? []) || !Array.isArray(p.ins ?? [])) {
    throw new FormatoInvalido('El archivo .json no es un respaldo de la app de cómputo y presupuesto.')
  }
  return proyectoAPlanilla(p, nombreArchivo)
}

export function proyectoAPlanilla(p: ProyectoApp, nombreArchivo = 'Proyecto importado'): PlanillaPresupuesto {
  const meta = p.meta
  const rubrosApp = meta.rubros ?? []
  const porRubro = new Map<string, NonNullable<ProyectoApp['items']>>()
  const sueltos: NonNullable<ProyectoApp['items']> = []
  for (const it of p.items ?? []) {
    const lista = it.r ? porRubro.get(it.r) : undefined
    if (lista) lista.push(it)
    else if (it.r && rubrosApp.some((r) => r.id === it.r)) porRubro.set(it.r, [it])
    else sueltos.push(it)
  }
  // Same as the app: items of a missing rubro go to the last one.
  if (sueltos.length && rubrosApp.length) {
    const ult = rubrosApp[rubrosApp.length - 1].id
    porRubro.set(ult, [...(porRubro.get(ult) ?? []), ...sueltos])
  }

  return {
    nombre: texto(meta.nombre) || nombreArchivo.replace(/\.json$/i, ''),
    descripcion: '',
    ubicacion: '',
    tipoCambio: opcional(meta.tc) || null,
    cargasSociales: num(meta.cargas),
    coefAjuste: meta.coef === null || meta.coef === undefined || meta.coef === '' ? 1 : num(meta.coef),
    superficieCubierta: null,
    superficiePredio: null,
    gastosGenerales: num(meta.gg),
    beneficio: num(meta.ben),
    impuestos: num(meta.imp),
    insumos: (p.ins ?? [])
      .filter((i, k, todos) => texto(i.c) && todos.findIndex((x) => x.c === i.c) === k)
      .map((i) => ({
        codigo: texto(i.c),
        descripcion: texto(i.d) || texto(i.c),
        unidad: texto(i.u),
        tipo: (TIPOS_INSUMO as readonly string[]).includes(String(i.t)) ? (i.t as TipoInsumo) : 'MAT',
        precioBase: num(i.p),
        fuente: texto(i.f),
      })),
    rubros: rubrosApp.map((r, k) => ({
      numero: k + 1,
      descripcion: texto(r.n) || `Rubro ${k + 1}`,
      items: [...(porRubro.get(r.id) ?? [])]
        .sort((a, b) => num(a.o) - num(b.o) || String(a.id).localeCompare(String(b.id)))
        .map((it, j) => ({
          codigo: `${k + 1}.${dos(j + 1)}`,
          descripcion: texto(it.d) || 'Sin descripción',
          unidad: texto(it.u),
          observaciones: texto(it.obs),
          apu: (it.apu ?? []).filter((l) => texto(l.c)).map((l) => ({ insumo: texto(l.c), cantidad: num(l.q) })),
          mediciones: (it.med ?? []).map((m) => ({
            sector: texto(m.s),
            criterio: texto(m.d),
            cant: opcional(m.n),
            largo: opcional(m.l),
            ancho: opcional(m.a),
            alto: opcional(m.h),
            coef: opcional(m.k),
          })),
        })),
    })),
  }
}

/** This system's budget in the app's format (for its JSON backup and its Excel export). */
export function snapshotAProyecto(s: Snapshot): ProyectoApp & { id: string } {
  const rubros = [...s.rubros].sort((a, b) => a.numero - b.numero || a.position - b.position)
  const insumo = new Map(s.insumos.map((i) => [i.id, i]))
  const items = rubros.flatMap((r) =>
    s.items
      .filter((i) => i.rubroId === r.id)
      .sort((a, b) => a.position - b.position)
      .map((it, j) => ({
        id: it.id,
        r: r.id,
        o: j + 1,
        d: it.descripcion,
        u: it.unidad ?? '',
        obs: it.observaciones ?? '',
        apu: s.apu
          .filter((l) => l.itemId === it.id && insumo.has(l.insumoId))
          .sort((a, b) => a.position - b.position)
          .map((l) => ({ c: insumo.get(l.insumoId)!.codigo, q: l.cantidad })),
        med: s.mediciones
          .filter((m) => m.itemId === it.id)
          .sort((a, b) => a.position - b.position)
          .map((m) => {
            const o: Record<string, string | number> = { s: m.sector ?? '', d: m.criterio ?? '' }
            if (m.cant !== null) o.n = m.cant
            if (m.largo !== null) o.l = m.largo
            if (m.ancho !== null) o.a = m.ancho
            if (m.alto !== null) o.h = m.alto
            if (m.coef !== null) o.k = m.coef
            return o
          }),
      }))
  )
  return {
    id: s.info.id,
    meta: {
      nombre: s.info.nombre,
      creado: Date.parse(s.info.createdAt) || Date.now(),
      tc: s.info.tipoCambio ?? 0,
      cargas: s.info.cargasSociales,
      coef: s.info.coefAjuste,
      gg: s.info.gastosGenerales,
      ben: s.info.beneficio,
      imp: s.info.impuestos,
      rubros: rubros.map((r) => ({ id: r.id, n: r.descripcion })),
    },
    ins: [...s.insumos]
      .sort((a, b) => a.position - b.position)
      .map((i) => ({ c: i.codigo, d: i.descripcion, u: i.unidad ?? '', t: i.tipo, p: i.precioBase, f: i.fuente ?? '' })),
    items,
  }
}
