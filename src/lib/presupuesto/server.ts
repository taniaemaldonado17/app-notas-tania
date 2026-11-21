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

/** Name of the project-row column that shows the budget total. */
export const COLUMNA_TOTAL = 'Presupuesto'

const id = () => 'c' + randomUUID().replace(/-/g, '').slice(0, 24)

export async function findAccessiblePresupuesto(userId: string, presupuestoId: string) {
  return db.presupuesto.findFirst({
    where: { id: presupuestoId, page: accessiblePageWhere(userId) },
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
  opts: { pageId: string; rowId: string | null; userId: string }
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

async function escribirTotalEnFila(rowId: string, total: number | null) {
  const row = await db.dbRow.findUnique({
    where: { id: rowId },
    select: { values: true, database: { select: { id: true, properties: true } } },
  })
  if (!row) return
  const properties = (row.database.properties as unknown as PropertyDef[]) ?? []
  let prop = properties.find((p) => p.name.trim().toLowerCase() === COLUMNA_TOTAL.toLowerCase() && p.type === 'number')
  if (!prop) {
    if (total === null) return
    prop = { id: newId('prop'), name: COLUMNA_TOTAL, type: 'number', numberFormat: 'ars' }
    await db.database.update({
      where: { id: row.database.id },
      data: { properties: [...properties, prop] as unknown as Prisma.InputJsonValue },
    })
  }
  const values = { ...((row.values as Record<string, unknown>) ?? {}) }
  if (total === null) delete values[prop.id]
  else values[prop.id] = total
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
