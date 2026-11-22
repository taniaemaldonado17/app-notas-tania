/**
 * Presupuestos de obra: acceso, guardado y cálculo contra la base de datos.
 * Un presupuesto pertenece a una página (mismo acceso que la página) y suele
 * estar vinculado a una fila de proyecto (ARQUITECTURA › Proyectos), cuya
 * columna "Presupuesto" muestra el total.
 */
import { randomUUID } from 'node:crypto'
import type { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { accessiblePageWhere } from '@/lib/auth-helpers'
import { newId, type PropertyDef } from '@/lib/db-types'
import { calcular, precioCalculo, parcialMedicion, TIPOS_INSUMO, type PresupuestoCalc } from './calculo'
import type { PlanillaPresupuesto } from './importar'
import type { Snapshot } from './local'
import { proyectoAPlanilla, snapshotAProyecto } from './formato-app'

/** Name of the project-row column that shows the budget total. */
export const COLUMNA_TOTAL = 'Presupuesto'
/** Same as COLUMNA_AVANCE in lib/certificacion/server.ts (not imported: that module imports this one). */
const COLUMNA_AVANCE_FILA = 'Avance certificado'

const id = () => 'c' + randomUUID().replace(/-/g, '').slice(0, 24)

/**
 * Who sees a CyP: its creator, whoever the creator shared their "Cómputo y
 * presupuesto" section with, and everyone with access to the page of the
 * project it's linked to.
 */
export async function presupuestoAccesibleWhere(userId: string): Promise<Prisma.PresupuestoWhereInput> {
  const compartidos = await db.cypCompartido.findMany({ where: { userId }, select: { ownerId: true } })
  return {
    OR: [
      { createdById: { in: [userId, ...compartidos.map((c) => c.ownerId)] } },
      { page: accessiblePageWhere(userId) },
    ],
  }
}

export async function findAccessiblePresupuesto(userId: string, presupuestoId: string) {
  return db.presupuesto.findFirst({
    where: { id: presupuestoId, ...(await presupuestoAccesibleWhere(userId)) },
    select: { id: true, pageId: true, rowId: true },
  })
}

export const presupuestoSelect = {
  id: true,
  pageId: true,
  rowId: true,
  nombre: true,
  descripcion: true,
  ubicacion: true,
  tipoCambio: true,
  cargasSociales: true,
  coefAjuste: true,
  superficieCubierta: true,
  superficiePredio: true,
  gastosGenerales: true,
  beneficio: true,
  impuestos: true,
  totalCache: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.PresupuestoSelect

export type PresupuestoInfo = Prisma.PresupuestoGetPayload<{ select: typeof presupuestoSelect }>

/* ------------------------------------------------------------------ */
/* Guardado                                                             */
/* ------------------------------------------------------------------ */

/** Creates a budget with all its content (a few batched inserts). */
export async function guardarPlanilla(
  planilla: PlanillaPresupuesto,
  opts: { pageId: string | null; rowId: string | null; userId: string }
): Promise<string> {
  const presupuestoId = id()
  const insumoIds = new Map<string, string>()
  const insumos: Prisma.PresInsumoCreateManyInput[] = planilla.insumos.map((ins, position) => {
    const insumoId = id()
    insumoIds.set(ins.codigo, insumoId)
    return {
      id: insumoId, presupuestoId, codigo: ins.codigo, descripcion: ins.descripcion,
      unidad: ins.unidad || null, tipo: ins.tipo, precioBase: ins.precioBase, fuente: ins.fuente || null, position,
    }
  })

  const rubros: Prisma.PresRubroCreateManyInput[] = []
  const items: Prisma.PresItemCreateManyInput[] = []
  const apu: Prisma.PresApuCreateManyInput[] = []
  const mediciones: Prisma.PresMedicionCreateManyInput[] = []
  planilla.rubros.forEach((r, rubroPos) => {
    const rubroId = id()
    rubros.push({ id: rubroId, presupuestoId, numero: r.numero, descripcion: r.descripcion, position: rubroPos })
    for (const it of r.items) {
      const itemId = id()
      items.push({
        id: itemId, presupuestoId, rubroId, codigo: it.codigo, descripcion: it.descripcion,
        unidad: it.unidad || null, observaciones: it.observaciones || null, position: items.length,
      })
      it.apu.forEach((l, position) => {
        const insumoId = insumoIds.get(l.insumo)
        if (!insumoId) throw new Error(`El ítem ${it.codigo} usa el insumo «${l.insumo}», que no existe.`)
        apu.push({ id: id(), itemId, insumoId, cantidad: l.cantidad, position })
      })
      it.mediciones.forEach((m, position) =>
        mediciones.push({
          id: id(), itemId, sector: m.sector || null, criterio: m.criterio || null,
          cant: m.cant, largo: m.largo, ancho: m.ancho, alto: m.alto, coef: m.coef, position,
        })
      )
    }
  })

  await db.$transaction([
    db.presupuesto.create({
      data: {
        id: presupuestoId, pageId: opts.pageId, rowId: opts.rowId, createdById: opts.userId,
        nombre: planilla.nombre.slice(0, 300), descripcion: planilla.descripcion || null,
        ubicacion: planilla.ubicacion || null, tipoCambio: planilla.tipoCambio,
        cargasSociales: planilla.cargasSociales, coefAjuste: planilla.coefAjuste,
        superficieCubierta: planilla.superficieCubierta, superficiePredio: planilla.superficiePredio,
        gastosGenerales: planilla.gastosGenerales ?? 0, beneficio: planilla.beneficio ?? 0, impuestos: planilla.impuestos ?? 0,
      },
    }),
    db.presInsumo.createMany({ data: insumos }),
    db.presRubro.createMany({ data: rubros }),
    db.presItem.createMany({ data: items }),
    db.presApu.createMany({ data: apu }),
    db.presMedicion.createMany({ data: mediciones }),
  ])
  await sincronizarTotal(presupuestoId)
  return presupuestoId
}

/* ------------------------------------------------------------------ */
/* Cálculo                                                              */
/* ------------------------------------------------------------------ */

export async function calcularPresupuesto(presupuestoId: string): Promise<{ info: PresupuestoInfo; calc: PresupuestoCalc } | null> {
  const info = await db.presupuesto.findUnique({ where: { id: presupuestoId }, select: presupuestoSelect })
  if (!info) return null
  const [insumos, rubros, items, apu, mediciones] = await Promise.all([
    db.presInsumo.findMany({ where: { presupuestoId }, select: { id: true, tipo: true, precioBase: true } }),
    db.presRubro.findMany({ where: { presupuestoId }, select: { id: true, numero: true, descripcion: true, position: true } }),
    db.presItem.findMany({
      where: { presupuestoId },
      select: { id: true, rubroId: true, codigo: true, descripcion: true, unidad: true, observaciones: true, position: true },
    }),
    db.presApu.findMany({ where: { item: { presupuestoId } }, select: { itemId: true, insumoId: true, cantidad: true } }),
    db.presMedicion.findMany({
      where: { item: { presupuestoId } },
      select: { itemId: true, cant: true, largo: true, ancho: true, alto: true, coef: true },
    }),
  ])
  return { info, calc: calcular(info, insumos, rubros, items, apu, mediciones) }
}

/**
 * Recomputes the total, stores it and copies it to the linked project row's
 * "Presupuesto" column (created as an ARS number column if missing), so it
 * shows in tables, boards and dashboard stats.
 */
export async function sincronizarTotal(presupuestoId: string): Promise<number> {
  const r = await calcularPresupuesto(presupuestoId)
  if (!r) return 0
  const total = Math.round(r.calc.total * 100) / 100
  await db.presupuesto.update({ where: { id: presupuestoId }, data: { totalCache: total } })
  if (r.info.rowId) await escribirTotalEnFila(r.info.rowId, total)
  return total
}

function escribirTotalEnFila(rowId: string, total: number | null) {
  return escribirNumeroEnFila(rowId, { id: '', name: COLUMNA_TOTAL, type: 'number', numberFormat: 'ars' }, total)
}

/**
 * Writes a number into the project row's column named like `columna.name`
 * (a number column), creating the column if it's missing. null clears it.
 */
export async function escribirNumeroEnFila(rowId: string, columna: PropertyDef, valor: number | null) {
  const row = await db.dbRow.findUnique({
    where: { id: rowId },
    select: { values: true, database: { select: { id: true, properties: true } } },
  })
  if (!row) return
  const properties = (row.database.properties as unknown as PropertyDef[]) ?? []
  let prop = properties.find((p) => p.name.trim().toLowerCase() === columna.name.toLowerCase() && p.type === 'number')
  if (!prop) {
    if (valor === null) return
    prop = { ...columna, id: newId('prop') }
    await db.database.update({
      where: { id: row.database.id },
      data: { properties: [...properties, prop] as unknown as Prisma.InputJsonValue },
    })
  }
  const values = { ...((row.values as Record<string, unknown>) ?? {}) }
  if (valor === null) delete values[prop.id]
  else values[prop.id] = valor
  await db.dbRow.update({ where: { id: rowId }, data: { values: values as Prisma.InputJsonValue } })
}

/** Deletes a budget and clears the total from its project row. */
export async function eliminarPresupuesto(presupuestoId: string) {
  const p = await db.presupuesto.findUnique({ where: { id: presupuestoId }, select: { rowId: true } })
  await db.presupuesto.delete({ where: { id: presupuestoId } })
  if (p?.rowId) await escribirTotalEnFila(p.rowId, null)
}

/* ------------------------------------------------------------------ */
/* Detalle                                                              */
/* ------------------------------------------------------------------ */

export async function detalleItem(presupuestoId: string, itemId: string) {
  const [info, item] = await Promise.all([
    db.presupuesto.findUnique({ where: { id: presupuestoId }, select: { cargasSociales: true, coefAjuste: true } }),
    db.presItem.findFirst({
      where: { id: itemId, presupuestoId },
      include: {
        rubro: { select: { numero: true, descripcion: true } },
        apu: { orderBy: { position: 'asc' }, include: { insumo: true } },
        mediciones: { orderBy: { position: 'asc' } },
      },
    }),
  ])
  if (!info || !item) return null
  const apu = item.apu.map((l) => {
    const precio = precioCalculo(l.insumo.tipo, l.insumo.precioBase, info.cargasSociales, info.coefAjuste)
    return {
      id: l.id, cantidad: l.cantidad, insumoId: l.insumoId, codigo: l.insumo.codigo, descripcion: l.insumo.descripcion,
      unidad: l.insumo.unidad, tipo: l.insumo.tipo, precioBase: l.insumo.precioBase, precioCalculo: precio, parcial: l.cantidad * precio,
    }
  })
  const puPorTipo = Object.fromEntries(
    TIPOS_INSUMO.map((t) => [t, apu.filter((l) => l.tipo === t).reduce((s, l) => s + l.parcial, 0)])
  ) as Record<(typeof TIPOS_INSUMO)[number], number>
  const mediciones = item.mediciones.map((m) => ({
    id: m.id, sector: m.sector, criterio: m.criterio, cant: m.cant, largo: m.largo, ancho: m.ancho, alto: m.alto, coef: m.coef,
    parcial: parcialMedicion(m),
  }))
  const cantidad = mediciones.reduce((s, m) => s + m.parcial, 0)
  const puTotal = apu.reduce((s, l) => s + l.parcial, 0)
  return {
    item: {
      id: item.id, codigo: item.codigo, descripcion: item.descripcion, unidad: item.unidad, observaciones: item.observaciones,
      rubroNumero: item.rubro.numero, rubroDescripcion: item.rubro.descripcion,
    },
    apu,
    puPorTipo,
    puTotal,
    mediciones,
    cantidad,
    subtotal: cantidad * puTotal,
  }
}

export async function listarInsumos(presupuestoId: string) {
  const [info, insumos] = await Promise.all([
    db.presupuesto.findUnique({ where: { id: presupuestoId }, select: { cargasSociales: true, coefAjuste: true } }),
    db.presInsumo.findMany({
      where: { presupuestoId },
      orderBy: { position: 'asc' },
      include: { apu: { select: { itemId: true } } },
    }),
  ])
  if (!info) return []
  return insumos.map(({ apu, ...ins }) => ({
    ...ins,
    precioCalculo: precioCalculo(ins.tipo, ins.precioBase, info.cargasSociales, info.coefAjuste),
    usos: new Set(apu.map((a) => a.itemId)).size,
  }))
}

/** Whole budget as stored, for working on it offline (see lib/presupuesto/local.ts). */
export async function cargarSnapshot(presupuestoId: string): Promise<Snapshot | null> {
  const info = await db.presupuesto.findUnique({ where: { id: presupuestoId }, select: presupuestoSelect })
  if (!info) return null
  const [insumos, rubros, items, apu, mediciones] = await Promise.all([
    db.presInsumo.findMany({
      where: { presupuestoId },
      orderBy: { position: 'asc' },
      select: { id: true, codigo: true, descripcion: true, unidad: true, tipo: true, precioBase: true, fuente: true, position: true },
    }),
    db.presRubro.findMany({ where: { presupuestoId }, select: { id: true, numero: true, descripcion: true, position: true } }),
    db.presItem.findMany({
      where: { presupuestoId },
      orderBy: { position: 'asc' },
      select: { id: true, rubroId: true, codigo: true, descripcion: true, unidad: true, observaciones: true, position: true },
    }),
    db.presApu.findMany({
      where: { item: { presupuestoId } },
      select: { id: true, itemId: true, insumoId: true, cantidad: true, position: true },
    }),
    db.presMedicion.findMany({
      where: { item: { presupuestoId } },
      select: { id: true, itemId: true, sector: true, criterio: true, cant: true, largo: true, ancho: true, alto: true, coef: true, position: true },
    }),
  ])
  return {
    info: { ...info, createdAt: info.createdAt.toISOString(), updatedAt: info.updatedAt.toISOString() },
    insumos: insumos.map((i) => ({ ...i, tipo: i.tipo as Snapshot['insumos'][number]['tipo'] })),
    rubros,
    items,
    apu,
    mediciones,
  }
}

/* ------------------------------------------------------------------ */
/* Sección "Cómputo y presupuesto": listado, duplicar, vincular        */
/* ------------------------------------------------------------------ */

/** Every CyP the user can open, with the project it's linked to. */
export async function listarPresupuestos(userId: string) {
  const lista = await db.presupuesto.findMany({
    where: await presupuestoAccesibleWhere(userId),
    orderBy: { updatedAt: 'desc' },
    select: {
      id: true,
      createdById: true,
      nombre: true,
      totalCache: true,
      tipoCambio: true,
      updatedAt: true,
      rowId: true,
      row: { select: { title: true, icon: true, database: { select: { pageId: true, page: { select: { title: true } } } } } },
      _count: { select: { items: true, rubros: true } },
      contrato: { select: { id: true } },
    },
  })
  const otros = [...new Set(lista.map((p) => p.createdById).filter((x): x is string => !!x && x !== userId))]
  const nombres = new Map(
    (await db.user.findMany({ where: { id: { in: otros } }, select: { id: true, name: true, email: true } })).map((u) => [u.id, u.name || u.email])
  )
  return lista.map((p) => ({
    id: p.id,
    /** Who created it, when it isn't the current user (shared with them). */
    de: p.createdById && p.createdById !== userId ? (nombres.get(p.createdById) ?? null) : null,
    nombre: p.nombre,
    total: p.totalCache,
    tipoCambio: p.tipoCambio,
    rubros: p._count.rubros,
    items: p._count.items,
    updatedAt: p.updatedAt.toISOString(),
    conContrato: !!p.contrato,
    proyecto: p.row
      ? { rowId: p.rowId!, titulo: p.row.title || 'Sin título', icono: p.row.icon, pageId: p.row.database.pageId, pagina: p.row.database.page.title }
      : null,
  }))
}

/** Copy of a CyP (not linked to any project, no contract): for a new revision. */
export async function duplicarPresupuesto(presupuestoId: string, userId: string): Promise<string | null> {
  const s = await cargarSnapshot(presupuestoId)
  if (!s) return null
  const planilla = proyectoAPlanilla(snapshotAProyecto(s))
  return guardarPlanilla(
    {
      ...planilla,
      nombre: `${s.info.nombre} (copia)`.slice(0, 300),
      descripcion: s.info.descripcion ?? '',
      ubicacion: s.info.ubicacion ?? '',
      superficieCubierta: s.info.superficieCubierta,
      superficiePredio: s.info.superficiePredio,
    },
    { pageId: null, rowId: null, userId }
  )
}

/**
 * Links a CyP to a project row: the project's page members can see it, and
 * the row shows its total (and certified progress).
 */
export async function vincularPresupuesto(presupuestoId: string, rowId: string, pageId: string) {
  await db.presupuesto.update({ where: { id: presupuestoId }, data: { rowId, pageId } })
  await sincronizarTotal(presupuestoId)
}

/** Unlinks a CyP from its project; the project's columns are cleared. It stays in the CyP section. */
export async function desvincularPresupuesto(presupuestoId: string) {
  const p = await db.presupuesto.findUnique({ where: { id: presupuestoId }, select: { rowId: true } })
  if (!p?.rowId) return
  await escribirTotalEnFila(p.rowId, null)
  await escribirNumeroEnFila(p.rowId, { id: '', name: COLUMNA_AVANCE_FILA, type: 'number', numberFormat: 'percent', showAs: 'bar' }, null)
  await db.presupuesto.update({ where: { id: presupuestoId }, data: { rowId: null } })
}
