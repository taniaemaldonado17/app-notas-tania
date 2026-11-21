/**
 * Edición de un presupuesto: una operación tipada por pedido. Cada operación
 * se valida, se limita a filas de ESE presupuesto y después se recalcula el
 * total (que se copia a la columna "Presupuesto" del proyecto).
 */
import { z } from 'zod'
import { db } from '@/lib/db'
import { TIPOS_INSUMO } from './calculo'
import { sincronizarTotal } from './server'

export class ErrorEdicion extends Error {}

const texto = (max: number) => z.string().trim().max(max)
const textoONulo = (max: number) => z.string().trim().max(max).nullable().transform((v) => (v ? v : null))
const numero = z.number().finite()
const numeroONulo = z.number().finite().nullable()
const id = z.string().min(1).max(64)

const factores = {
  cant: numeroONulo.optional(),
  largo: numeroONulo.optional(),
  ancho: numeroONulo.optional(),
  alto: numeroONulo.optional(),
  coef: numeroONulo.optional(),
}

export const operacionSchema = z.discriminatedUnion('op', [
  z.object({
    op: z.literal('parametros'),
    data: z
      .object({
        nombre: texto(300).min(1),
        descripcion: textoONulo(2000),
        ubicacion: textoONulo(500),
        tipoCambio: numeroONulo,
        cargasSociales: numero.min(0).max(100),
        coefAjuste: numero.min(0).max(100),
        superficieCubierta: numeroONulo,
        superficiePredio: numeroONulo,
      })
      .partial(),
  }),

  z.object({
    op: z.literal('insumo.crear'),
    data: z.object({
      codigo: texto(40).min(1),
      descripcion: texto(500).min(1),
      unidad: textoONulo(20).optional(),
      tipo: z.enum(TIPOS_INSUMO),
      precioBase: numero.min(0),
      fuente: textoONulo(500).optional(),
    }),
  }),
  z.object({
    op: z.literal('insumo.editar'),
    id,
    data: z
      .object({
        codigo: texto(40).min(1),
        descripcion: texto(500).min(1),
        unidad: textoONulo(20),
        tipo: z.enum(TIPOS_INSUMO),
        precioBase: numero.min(0),
        fuente: textoONulo(500),
      })
      .partial(),
  }),
  z.object({ op: z.literal('insumo.eliminar'), id }),

  z.object({
    op: z.literal('rubro.crear'),
    data: z.object({ descripcion: texto(300).min(1), numero: z.number().int().min(0).max(9999).optional() }),
  }),
  z.object({
    op: z.literal('rubro.editar'),
    id,
    data: z.object({ descripcion: texto(300).min(1), numero: z.number().int().min(0).max(9999) }).partial(),
  }),
  z.object({ op: z.literal('rubro.eliminar'), id }),

  z.object({
    op: z.literal('item.crear'),
    data: z.object({
      rubroId: id,
      descripcion: texto(500).min(1),
      unidad: textoONulo(20).optional(),
      codigo: texto(20).min(1).optional(),
    }),
  }),
  z.object({
    op: z.literal('item.editar'),
    id,
    data: z
      .object({
        codigo: texto(20).min(1),
        descripcion: texto(500).min(1),
        unidad: textoONulo(20),
        observaciones: textoONulo(1000),
      })
      .partial(),
  }),
  z.object({ op: z.literal('item.eliminar'), id }),

  z.object({
    op: z.literal('apu.crear'),
    data: z.object({ itemId: id, insumoId: id, cantidad: numero.min(0) }),
  }),
  z.object({ op: z.literal('apu.editar'), id, data: z.object({ cantidad: numero.min(0) }) }),
  z.object({ op: z.literal('apu.eliminar'), id }),

  z.object({
    op: z.literal('medicion.crear'),
    data: z.object({ itemId: id, sector: textoONulo(200).optional(), criterio: textoONulo(500).optional(), ...factores }),
  }),
  z.object({
    op: z.literal('medicion.editar'),
    id,
    data: z.object({ sector: textoONulo(200).optional(), criterio: textoONulo(500).optional(), ...factores }),
  }),
  z.object({ op: z.literal('medicion.eliminar'), id }),
])

export type Operacion = z.infer<typeof operacionSchema>

/** Throws ErrorEdicion when the row isn't part of this budget. */
function existe<T>(fila: T | null, que: string): T {
  if (!fila) throw new ErrorEdicion(`No se encontró ${que} en este presupuesto.`)
  return fila
}

async function siguientePosicion(model: 'item' | 'apu' | 'medicion', where: Record<string, string>) {
  const agg =
    model === 'item'
      ? await db.presItem.aggregate({ where, _max: { position: true } })
      : model === 'apu'
        ? await db.presApu.aggregate({ where, _max: { position: true } })
        : await db.presMedicion.aggregate({ where, _max: { position: true } })
  return (agg._max.position ?? -1) + 1
}

/** Applies one edit; returns the new data needed by the client (created id + total). */
export async function aplicarOperacion(presupuestoId: string, op: Operacion): Promise<{ id?: string; total: number }> {
  let creado: string | undefined
  const deItem = (itemId: string) => db.presItem.findFirst({ where: { id: itemId, presupuestoId }, select: { id: true } })

  switch (op.op) {
    case 'parametros':
      await db.presupuesto.update({ where: { id: presupuestoId }, data: op.data })
      break

    case 'insumo.crear': {
      const repetido = await db.presInsumo.findFirst({ where: { presupuestoId, codigo: op.data.codigo } })
      if (repetido) throw new ErrorEdicion(`Ya existe un insumo con el código «${op.data.codigo}».`)
      const agg = await db.presInsumo.aggregate({ where: { presupuestoId }, _max: { position: true } })
      const ins = await db.presInsumo.create({
        data: { presupuestoId, ...op.data, position: (agg._max.position ?? -1) + 1 },
        select: { id: true },
      })
      creado = ins.id
      break
    }
    case 'insumo.editar': {
      existe(await db.presInsumo.findFirst({ where: { id: op.id, presupuestoId } }), 'el insumo')
      if (op.data.codigo) {
        const repetido = await db.presInsumo.findFirst({ where: { presupuestoId, codigo: op.data.codigo, NOT: { id: op.id } } })
        if (repetido) throw new ErrorEdicion(`Ya existe un insumo con el código «${op.data.codigo}».`)
      }
      await db.presInsumo.update({ where: { id: op.id }, data: op.data })
      break
    }
    case 'insumo.eliminar': {
      existe(await db.presInsumo.findFirst({ where: { id: op.id, presupuestoId } }), 'el insumo')
      const usos = await db.presApu.findMany({ where: { insumoId: op.id }, select: { item: { select: { codigo: true } } } })
      if (usos.length) {
        const codigos = [...new Set(usos.map((u) => u.item.codigo))]
        throw new ErrorEdicion(
          `Este insumo se usa en ${codigos.length === 1 ? 'el ítem' : 'los ítems'} ${codigos.slice(0, 8).join(', ')}${codigos.length > 8 ? '…' : ''}. Quitalo de esos análisis antes de eliminarlo.`
        )
      }
      await db.presInsumo.delete({ where: { id: op.id } })
      break
    }

    case 'rubro.crear': {
      const agg = await db.presRubro.aggregate({ where: { presupuestoId }, _max: { numero: true, position: true } })
      const r = await db.presRubro.create({
        data: {
          presupuestoId,
          descripcion: op.data.descripcion,
          numero: op.data.numero ?? (agg._max.numero ?? 0) + 1,
          position: (agg._max.position ?? -1) + 1,
        },
        select: { id: true },
      })
      creado = r.id
      break
    }
    case 'rubro.editar':
      existe(await db.presRubro.findFirst({ where: { id: op.id, presupuestoId } }), 'el rubro')
      await db.presRubro.update({ where: { id: op.id }, data: op.data })
      break
    case 'rubro.eliminar':
      existe(await db.presRubro.findFirst({ where: { id: op.id, presupuestoId } }), 'el rubro')
      await db.presRubro.delete({ where: { id: op.id } }) // cascades to its items
      break

    case 'item.crear': {
      const rubro = existe(
        await db.presRubro.findFirst({ where: { id: op.data.rubroId, presupuestoId }, select: { id: true, numero: true } }),
        'el rubro'
      )
      let codigo = op.data.codigo
      if (!codigo) {
        // Next "N.MM" code in the rubro.
        const codigos = await db.presItem.findMany({ where: { rubroId: rubro.id }, select: { codigo: true } })
        const max = codigos.reduce((m, c) => Math.max(m, Number(c.codigo.split('.')[1]) || 0), 0)
        codigo = `${rubro.numero}.${String(max + 1).padStart(2, '0')}`
      }
      // Items are ordered globally; put the new one right after its rubro's last item.
      const ultimo = await db.presItem.findFirst({ where: { rubroId: rubro.id }, orderBy: { position: 'desc' }, select: { position: true } })
      const position = ultimo ? ultimo.position + 1 : await siguientePosicion('item', { presupuestoId })
      if (ultimo) {
        await db.presItem.updateMany({ where: { presupuestoId, position: { gte: position } }, data: { position: { increment: 1 } } })
      }
      const it = await db.presItem.create({
        data: { presupuestoId, rubroId: rubro.id, codigo, descripcion: op.data.descripcion, unidad: op.data.unidad ?? null, position },
        select: { id: true },
      })
      creado = it.id
      break
    }
    case 'item.editar':
      existe(await deItem(op.id), 'el ítem')
      await db.presItem.update({ where: { id: op.id }, data: op.data })
      break
    case 'item.eliminar':
      existe(await deItem(op.id), 'el ítem')
      await db.presItem.delete({ where: { id: op.id } })
      break

    case 'apu.crear': {
      existe(await deItem(op.data.itemId), 'el ítem')
      existe(await db.presInsumo.findFirst({ where: { id: op.data.insumoId, presupuestoId }, select: { id: true } }), 'el insumo')
      const l = await db.presApu.create({
        data: { ...op.data, position: await siguientePosicion('apu', { itemId: op.data.itemId }) },
        select: { id: true },
      })
      creado = l.id
      break
    }
    case 'apu.editar':
      existe(await db.presApu.findFirst({ where: { id: op.id, item: { presupuestoId } } }), 'la línea de análisis')
      await db.presApu.update({ where: { id: op.id }, data: op.data })
      break
    case 'apu.eliminar':
      existe(await db.presApu.findFirst({ where: { id: op.id, item: { presupuestoId } } }), 'la línea de análisis')
      await db.presApu.delete({ where: { id: op.id } })
      break

    case 'medicion.crear': {
      existe(await deItem(op.data.itemId), 'el ítem')
      const m = await db.presMedicion.create({
        data: { ...op.data, position: await siguientePosicion('medicion', { itemId: op.data.itemId }) },
        select: { id: true },
      })
      creado = m.id
      break
    }
    case 'medicion.editar':
      existe(await db.presMedicion.findFirst({ where: { id: op.id, item: { presupuestoId } } }), 'la medición')
      await db.presMedicion.update({ where: { id: op.id }, data: op.data })
      break
    case 'medicion.eliminar':
      existe(await db.presMedicion.findFirst({ where: { id: op.id, item: { presupuestoId } } }), 'la medición')
      await db.presMedicion.delete({ where: { id: op.id } })
      break
  }

  await db.presupuesto.update({ where: { id: presupuestoId }, data: { updatedAt: new Date() } })
  const total = await sincronizarTotal(presupuestoId)
  return { id: creado, total }
}
