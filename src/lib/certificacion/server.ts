/**
 * Certificación de obra contra la base de datos: contrato (con el itemizado
 * congelado), certificados, rectificación y curva de plan de trabajo.
 * Acceso = acceso al presupuesto (y por lo tanto a su página).
 */
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import type { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { calcularPresupuesto, escribirNumeroEnFila } from '@/lib/presupuesto/server'
import { calcularCertificado, ErrorCertificado, type Antecedente } from './calculo'

export class ErrorCertificacion extends Error {}

/** Project-row column that shows the certified progress. */
export const COLUMNA_AVANCE = 'Avance certificado'

const cuid = () => 'c' + randomUUID().replace(/-/g, '').slice(0, 24)

/* ------------------------------------------------------------------ */
/* Operaciones                                                          */
/* ------------------------------------------------------------------ */

const texto = (max: number) => z.string().trim().max(max).nullable().transform((v) => (v ? v : null))
const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida')
const pct = z.number().finite().min(0).max(1)

const datosContrato = {
  comitente: texto(300),
  contratista: texto(300),
  numero: texto(100),
  mesBasico: texto(50),
  fechaContrato: texto(10),
  fechaInicio: texto(10),
  fechaFin: texto(10),
  plazo: texto(100),
  polizaAseguradora: texto(200),
  polizaNumero: texto(100),
  polizaMonto: z.number().finite().min(0).nullable(),
}
const condiciones = {
  montoContrato: z.number().finite().positive(),
  anticipoPct: pct,
  fondoReparoPct: pct,
  fondoReparoTipo: z.enum(['deposito', 'poliza']),
}
const presentes = z.record(z.string().min(1).max(64), z.number().finite().min(-1).max(1))

export const operacionCertSchema = z.discriminatedUnion('op', [
  z.object({ op: z.literal('contrato.crear'), data: z.object({ ...condiciones, ...z.object(datosContrato).partial().shape }) }),
  z.object({ op: z.literal('contrato.editar'), data: z.object({ ...condiciones, ...datosContrato }).partial() }),
  z.object({ op: z.literal('contrato.actualizarItemizado') }),
  z.object({ op: z.literal('contrato.eliminar') }),
  z.object({ op: z.literal('certificado.emitir'), data: z.object({ fecha, periodo: texto(100), presentes }) }),
  z.object({ op: z.literal('certificado.rectificar'), id: z.string().min(1).max(64), data: z.object({ fecha, periodo: texto(100), presentes }) }),
  z.object({ op: z.literal('certificado.eliminar'), id: z.string().min(1).max(64) }),
  z.object({
    op: z.literal('curva.guardar'),
    data: z.object({ puntos: z.array(z.object({ periodo: z.string().trim().min(1).max(100), porcentajeAcumulado: pct })).max(240) }),
  }),
])
export type OperacionCert = z.infer<typeof operacionCertSchema>

/* ------------------------------------------------------------------ */
/* Lectura                                                              */
/* ------------------------------------------------------------------ */

const certificadoResumen = {
  id: true, numero: true, fecha: true, periodo: true, porcentajeAvance: true, montoBruto: true,
  montoBrutoAcumulado: true, descuentoAnticipo: true, anticipoAcumulado: true, descuentoFondoReparo: true,
  sustitucionFondoReparo: true, fondoReparoAcumulado: true, montoNeto: true, saldoObra: true,
  saldoAnticipo: true, saldoFondoReparo: true, rectificado: true, rectificadoEn: true, createdAt: true,
} satisfies Prisma.CertificadoSelect

/** Everything the certification tab needs (contract null if there's none yet). */
export async function cargarCertificacion(presupuestoId: string) {
  const contrato = await db.contrato.findUnique({
    where: { presupuestoId },
    include: {
      items: { orderBy: { position: 'asc' } },
      certificados: { orderBy: { numero: 'asc' }, select: certificadoResumen },
      curva: { orderBy: { orden: 'asc' } },
    },
  })
  const presupuesto = await db.presupuesto.findUnique({ where: { id: presupuestoId }, select: { totalCache: true, nombre: true, ubicacion: true } })
  if (!contrato) return { contrato: null, presupuesto }

  // Advance accumulated per item after the last certificate (the next one starts here).
  const ultimo = contrato.certificados[contrato.certificados.length - 1]
  const acumuladoPorItem: Record<string, number> = {}
  if (ultimo) {
    const lineas = await db.certificadoLinea.findMany({ where: { certificadoId: ultimo.id }, select: { contratoItemId: true, acumulado: true } })
    for (const l of lineas) acumuladoPorItem[l.contratoItemId] = l.acumulado
  }
  return { contrato, presupuesto, acumuladoPorItem }
}

export async function detalleCertificado(presupuestoId: string, certificadoId: string) {
  const cert = await db.certificado.findFirst({
    where: { id: certificadoId, contrato: { presupuestoId } },
    select: { ...certificadoResumen, lineas: { select: { contratoItemId: true, anterior: true, presente: true, acumulado: true, importePresente: true } } },
  })
  return cert
}

/* ------------------------------------------------------------------ */
/* Itemizado congelado                                                  */
/* ------------------------------------------------------------------ */

/** Contract items from the current budget, scaled by monto / costo-costo total. */
async function itemizadoDesdePresupuesto(presupuestoId: string, montoContrato: number) {
  const r = await calcularPresupuesto(presupuestoId)
  if (!r) throw new ErrorCertificacion('No se encontró el presupuesto.')
  const total = r.calc.total
  if (!(total > 0)) throw new ErrorCertificacion('El presupuesto da $ 0: cargá precios y cantidades antes de crear el contrato.')
  const coef = montoContrato / total
  const items: Omit<Prisma.ContratoItemCreateManyInput, 'contratoId'>[] = []
  for (const rubro of r.calc.rubros) {
    for (const it of rubro.items) {
      items.push({
        id: cuid(),
        rubroNumero: rubro.numero,
        rubroDescripcion: rubro.descripcion,
        codigo: it.codigo,
        descripcion: it.descripcion,
        unidad: it.unidad,
        cantidad: it.cantidad,
        precioUnitario: it.puTotal * coef,
        importe: it.subtotal * coef,
        position: items.length,
      })
    }
  }
  return { coef, items }
}

async function sinCertificados(contratoId: string, que: string) {
  const n = await db.certificado.count({ where: { contratoId } })
  if (n > 0) throw new ErrorCertificacion(`${que} solo se puede hacer mientras no haya certificados emitidos.`)
}

/* ------------------------------------------------------------------ */
/* Certificados                                                         */
/* ------------------------------------------------------------------ */

async function antecedenteDe(contratoId: string, antesDeNumero?: number): Promise<Antecedente> {
  const previo = await db.certificado.findFirst({
    where: { contratoId, ...(antesDeNumero !== undefined ? { numero: { lt: antesDeNumero } } : {}) },
    orderBy: { numero: 'desc' },
    select: { montoBrutoAcumulado: true, anticipoAcumulado: true, fondoReparoAcumulado: true, lineas: { select: { contratoItemId: true, acumulado: true } } },
  })
  if (!previo) return null
  return {
    acumuladoPorItem: Object.fromEntries(previo.lineas.map((l) => [l.contratoItemId, l.acumulado])),
    montoBrutoAcumulado: previo.montoBrutoAcumulado,
    anticipoAcumulado: previo.anticipoAcumulado,
    fondoReparoAcumulado: previo.fondoReparoAcumulado,
  }
}

async function calcular(contratoId: string, presentesIn: Record<string, number>, antecedente: Antecedente) {
  const contrato = await db.contrato.findUniqueOrThrow({
    where: { id: contratoId },
    include: { items: { orderBy: { position: 'asc' }, select: { id: true, codigo: true, descripcion: true, importe: true } } },
  })
  const ids = new Set(contrato.items.map((i) => i.id))
  for (const k of Object.keys(presentesIn)) {
    if (!ids.has(k)) throw new ErrorCertificacion('Hay ítems que no pertenecen a este contrato.')
  }
  try {
    return calcularCertificado(contrato, contrato.items, antecedente, presentesIn)
  } catch (err) {
    if (err instanceof ErrorCertificado) throw new ErrorCertificacion(err.message)
    throw err
  }
}

const datosCert = (c: ReturnType<typeof calcularCertificado>) => ({
  porcentajeAvance: c.porcentajeAvance,
  montoBruto: c.montoBruto,
  montoBrutoAcumulado: c.montoBrutoAcumulado,
  descuentoAnticipo: c.descuentoAnticipo,
  anticipoAcumulado: c.anticipoAcumulado,
  descuentoFondoReparo: c.descuentoFondoReparo,
  sustitucionFondoReparo: c.sustitucionFondoReparo,
  fondoReparoAcumulado: c.fondoReparoAcumulado,
  montoNeto: c.montoNeto,
  saldoObra: c.saldoObra,
  saldoAnticipo: c.saldoAnticipo,
  saldoFondoReparo: c.saldoFondoReparo,
})

/** Copies the certified progress of the last certificate to the project row. */
export async function sincronizarAvance(presupuestoId: string) {
  const p = await db.presupuesto.findUnique({
    where: { id: presupuestoId },
    select: { rowId: true, contrato: { select: { certificados: { orderBy: { numero: 'desc' }, take: 1, select: { porcentajeAvance: true } } } } },
  })
  if (!p?.rowId) return
  const ultimo = p.contrato?.certificados[0]
  await escribirNumeroEnFila(
    p.rowId,
    { id: '', name: COLUMNA_AVANCE, type: 'number', numberFormat: 'percent', showAs: 'bar' },
    ultimo ? Math.round(ultimo.porcentajeAvance * 10000) / 10000 : null
  )
}

/* ------------------------------------------------------------------ */
/* Aplicar                                                              */
/* ------------------------------------------------------------------ */

export async function aplicarOperacionCert(presupuestoId: string, op: OperacionCert, userId: string): Promise<{ id?: string }> {
  const contrato = await db.contrato.findUnique({
    where: { presupuestoId },
    select: { id: true, montoContrato: true, anticipoPct: true, fondoReparoPct: true },
  })
  const necesitaContrato = () => {
    if (!contrato) throw new ErrorCertificacion('Este presupuesto todavía no tiene contrato.')
    return contrato
  }
  let creado: string | undefined

  switch (op.op) {
    case 'contrato.crear': {
      if (contrato) throw new ErrorCertificacion('Este presupuesto ya tiene contrato.')
      const { coef, items } = await itemizadoDesdePresupuesto(presupuestoId, op.data.montoContrato)
      const id = cuid()
      await db.$transaction([
        db.contrato.create({ data: { id, presupuestoId, coeficientePase: coef, ...op.data } }),
        db.contratoItem.createMany({ data: items.map((i) => ({ ...i, contratoId: id })) }),
      ])
      creado = id
      break
    }

    case 'contrato.editar': {
      const c = necesitaContrato()
      const { montoContrato, anticipoPct, fondoReparoPct, ...resto } = op.data
      const cambiaMonto = montoContrato !== undefined && montoContrato !== c.montoContrato
      const cambiaCondiciones =
        cambiaMonto ||
        (anticipoPct !== undefined && anticipoPct !== c.anticipoPct) ||
        (fondoReparoPct !== undefined && fondoReparoPct !== c.fondoReparoPct)
      if (cambiaCondiciones) {
        await sinCertificados(c.id, 'Cambiar el monto, el anticipo o el fondo de reparo')
      }
      if (cambiaMonto) {
        // New amount: re-scale the frozen itemized list (no certificates, checked above).
        const { coef, items } = await itemizadoDesdePresupuesto(presupuestoId, montoContrato)
        await db.$transaction([
          db.contratoItem.deleteMany({ where: { contratoId: c.id } }),
          db.contratoItem.createMany({ data: items.map((i) => ({ ...i, contratoId: c.id })) }),
          db.contrato.update({ where: { id: c.id }, data: { montoContrato, coeficientePase: coef } }),
        ])
      }
      await db.contrato.update({
        where: { id: c.id },
        data: { ...resto, ...(anticipoPct !== undefined ? { anticipoPct } : {}), ...(fondoReparoPct !== undefined ? { fondoReparoPct } : {}) },
      })
      break
    }

    case 'contrato.actualizarItemizado': {
      const c = necesitaContrato()
      await sinCertificados(c.id, 'Actualizar el itemizado desde el presupuesto')
      const { coef, items } = await itemizadoDesdePresupuesto(presupuestoId, c.montoContrato)
      await db.$transaction([
        db.contratoItem.deleteMany({ where: { contratoId: c.id } }),
        db.contratoItem.createMany({ data: items.map((i) => ({ ...i, contratoId: c.id })) }),
        db.contrato.update({ where: { id: c.id }, data: { coeficientePase: coef } }),
      ])
      break
    }

    case 'contrato.eliminar': {
      const c = necesitaContrato()
      await sinCertificados(c.id, 'Eliminar el contrato')
      await db.contrato.delete({ where: { id: c.id } })
      break
    }

    case 'certificado.emitir': {
      const c = necesitaContrato()
      const ultimo = await db.certificado.findFirst({ where: { contratoId: c.id }, orderBy: { numero: 'desc' }, select: { numero: true } })
      const calc = await calcular(c.id, op.data.presentes, await antecedenteDe(c.id))
      const id = cuid()
      try {
        await db.$transaction([
          db.certificado.create({
            data: { id, contratoId: c.id, numero: (ultimo?.numero ?? 0) + 1, fecha: op.data.fecha, periodo: op.data.periodo, createdById: userId, ...datosCert(calc) },
          }),
          db.certificadoLinea.createMany({ data: calc.lineas.map((l) => ({ ...l, certificadoId: id })) }),
        ])
      } catch (err) {
        if ((err as { code?: string }).code === 'P2002') {
          throw new ErrorCertificacion('Alguien emitió un certificado al mismo tiempo. Recargá y volvé a intentar.')
        }
        throw err
      }
      creado = id
      break
    }

    case 'certificado.rectificar': {
      const c = necesitaContrato()
      const cert = await db.certificado.findFirst({ where: { id: op.id, contratoId: c.id }, select: { numero: true } })
      if (!cert) throw new ErrorCertificacion('No se encontró el certificado.')
      const ultimo = await db.certificado.findFirst({ where: { contratoId: c.id }, orderBy: { numero: 'desc' }, select: { id: true } })
      if (ultimo?.id !== op.id) {
        throw new ErrorCertificacion('Solo se puede rectificar el último certificado: los siguientes ya arrastran sus valores acumulados.')
      }
      const calc = await calcular(c.id, op.data.presentes, await antecedenteDe(c.id, cert.numero))
      await db.$transaction([
        db.certificadoLinea.deleteMany({ where: { certificadoId: op.id } }),
        db.certificadoLinea.createMany({ data: calc.lineas.map((l) => ({ ...l, certificadoId: op.id })) }),
        db.certificado.update({
          where: { id: op.id },
          data: { fecha: op.data.fecha, periodo: op.data.periodo, ...datosCert(calc), rectificado: true, rectificadoEn: new Date() },
        }),
      ])
      break
    }

    case 'certificado.eliminar': {
      const c = necesitaContrato()
      const ultimo = await db.certificado.findFirst({ where: { contratoId: c.id }, orderBy: { numero: 'desc' }, select: { id: true } })
      if (ultimo?.id !== op.id) throw new ErrorCertificacion('Solo se puede eliminar el último certificado emitido.')
      await db.certificado.delete({ where: { id: op.id } })
      break
    }

    case 'curva.guardar': {
      const c = necesitaContrato()
      await db.$transaction([
        db.curvaPlan.deleteMany({ where: { contratoId: c.id } }),
        db.curvaPlan.createMany({
          data: op.data.puntos.map((p, i) => ({ contratoId: c.id, orden: i + 1, periodo: p.periodo, porcentajeAcumulado: p.porcentajeAcumulado })),
        }),
      ])
      break
    }
  }

  if (op.op.startsWith('certificado.') || op.op === 'contrato.eliminar') await sincronizarAvance(presupuestoId)
  return { id: creado }
}
