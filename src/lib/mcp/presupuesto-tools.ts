/**
 * Claude connector tools for «Cómputo y presupuesto», read-only. Only the
 * app's admins (ADMIN_EMAILS, see lib/admins.ts) get them: the route doesn't
 * list them for anyone else and the runner checks again on every call.
 * Access to each CyP is the same as in the app (presupuestoAccesibleWhere).
 */
import { db } from '@/lib/db'
import { esAdmin, SOLO_ADMIN } from '@/lib/admins'
import { findAccessibleRow } from '@/lib/db-server'
import { parcialMedicion, precioCalculo, precioVenta } from '@/lib/presupuesto/calculo'
import { calcularPresupuesto, findAccessiblePresupuesto, listarPresupuestos } from '@/lib/presupuesto/server'
import { text, ToolError, type ToolDef, type ToolResult } from '@/lib/mcp/protocol'

export const PRESUPUESTO_TOOLS: ToolDef[] = [
  {
    name: 'listar_presupuestos',
    title: 'Listar cómputos y presupuestos',
    description:
      'Lista los cómputos y presupuestos (CyP) de obra a los que hay acceso: nombre, proyecto vinculado (fila de ARQUITECTURA › Proyectos), total costo-costo, cantidad de rubros e ítems y última modificación. Usalo para encontrar el id que pide leer_presupuesto.',
    inputSchema: {
      type: 'object',
      properties: {
        texto: { type: 'string', description: 'Filtra por texto en el nombre del CyP o del proyecto (opcional)' },
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  {
    name: 'leer_presupuesto',
    title: 'Leer cómputo y presupuesto',
    description:
      'Lee un cómputo y presupuesto completo: parámetros (tipo de cambio, cargas sociales, coeficiente de ajuste, superficies), totales (costo-costo, USD, por m², precio de venta) y los rubros con sus ítems (código, descripción, unidad, cantidad, precio unitario por materiales / mano de obra / equipos, subtotal e incidencia). Pasá id (de listar_presupuestos) o fila_id (la fila del proyecto). Con incluir_mediciones suma el cómputo métrico de cada ítem; con incluir_analisis, el análisis de precios (insumos que lleva cada unidad).',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Id del cómputo y presupuesto' },
        fila_id: { type: 'string', description: 'Id de la fila del proyecto vinculado (en lugar de id)' },
        rubro: { type: 'integer', description: 'Solo este número de rubro (opcional)' },
        incluir_mediciones: { type: 'boolean', description: 'Agrega las mediciones de cada ítem (sector, criterio, factores y parcial)' },
        incluir_analisis: { type: 'boolean', description: 'Agrega el análisis de precio unitario de cada ítem (insumos, cantidades y precios)' },
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
]

export const PRESUPUESTO_TOOL_NAMES = new Set(PRESUPUESTO_TOOLS.map((t) => t.name))

const json = (v: unknown) => text(JSON.stringify(v, null, 2))
const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined)
const plata = (v: number) => Math.round(v * 100) / 100
const fina = (v: number) => Math.round(v * 10_000) / 10_000
function agrupar<T extends { itemId: string }>(lista: T[]): Map<string, T[]> {
  const m = new Map<string, T[]>()
  for (const x of lista) m.set(x.itemId, [...(m.get(x.itemId) ?? []), x])
  return m
}
const plataONull = (v: number | null) => (v === null ? null : plata(v))

export function makePresupuestoRunner(userId: string, origin: string) {
  async function soloAdmin() {
    if (!(await esAdmin(userId))) throw new ToolError(SOLO_ADMIN)
  }

  async function listar(args: Record<string, unknown>): Promise<ToolResult> {
    const filtro = str(args.texto)?.toLowerCase()
    const lista = (await listarPresupuestos(userId)).filter(
      (p) => !filtro || p.nombre.toLowerCase().includes(filtro) || (p.proyecto?.titulo.toLowerCase().includes(filtro) ?? false)
    )
    return json({
      presupuestos: lista.map((p) => ({
        id: p.id,
        nombre: p.nombre,
        proyecto: p.proyecto ? { fila_id: p.proyecto.rowId, titulo: p.proyecto.titulo, pagina: p.proyecto.pagina } : null,
        total_costo_costo: plata(p.total),
        total_usd: p.tipoCambio ? plata(p.total / p.tipoCambio) : null,
        rubros: p.rubros,
        items: p.items,
        con_contrato: p.conContrato,
        creado_por: p.de,
        modificado: p.updatedAt,
      })),
    })
  }

  async function leer(args: Record<string, unknown>): Promise<ToolResult> {
    const id = str(args.id)
    const filaId = str(args.fila_id)
    let presupuestoId: string | undefined
    if (id) {
      presupuestoId = (await findAccessiblePresupuesto(userId, id))?.id
      if (!presupuestoId) throw new ToolError('No encontré ese cómputo y presupuesto. Buscalo con listar_presupuestos.')
    } else if (filaId) {
      if (!(await findAccessibleRow(userId, filaId))) throw new ToolError('No encontré esa fila de proyecto.')
      const vinculado = await db.presupuesto.findUnique({ where: { rowId: filaId }, select: { id: true } })
      presupuestoId = vinculado ? (await findAccessiblePresupuesto(userId, vinculado.id))?.id : undefined
      if (!presupuestoId) throw new ToolError('Ese proyecto no tiene un cómputo y presupuesto vinculado.')
    } else {
      throw new ToolError('Pasá id (de listar_presupuestos) o fila_id.')
    }

    const r = await calcularPresupuesto(presupuestoId)
    if (!r) throw new ToolError('No encontré ese cómputo y presupuesto.')
    const { info, calc } = r
    const soloRubro = typeof args.rubro === 'number' ? Math.trunc(args.rubro) : undefined
    const rubros = soloRubro === undefined ? calc.rubros : calc.rubros.filter((x) => x.numero === soloRubro)
    if (soloRubro !== undefined && !rubros.length) throw new ToolError(`No hay un rubro número ${soloRubro} en este presupuesto.`)

    const itemIds = rubros.flatMap((x) => x.items.map((i) => i.id))
    const [mediciones, apu, fila] = await Promise.all([
      args.incluir_mediciones === true
        ? db.presMedicion.findMany({ where: { itemId: { in: itemIds } }, orderBy: { position: 'asc' } })
        : Promise.resolve([]),
      args.incluir_analisis === true
        ? db.presApu.findMany({ where: { itemId: { in: itemIds } }, orderBy: { position: 'asc' }, include: { insumo: true } })
        : Promise.resolve([]),
      info.rowId ? db.dbRow.findUnique({ where: { id: info.rowId }, select: { title: true } }) : Promise.resolve(null),
    ])
    const medicionesPorItem = agrupar(mediciones)
    const apuPorItem = agrupar(apu)
    const venta = precioVenta(calc.total, info)

    return json({
      id: info.id,
      nombre: info.nombre,
      descripcion: info.descripcion,
      ubicacion: info.ubicacion,
      proyecto: info.rowId ? { fila_id: info.rowId, titulo: fila?.title || 'Sin título', enlace: `${origin}/?row=${encodeURIComponent(info.rowId)}` } : null,
      parametros: {
        tipo_cambio: info.tipoCambio,
        cargas_sociales: info.cargasSociales,
        coef_ajuste: info.coefAjuste,
        superficie_cubierta_m2: info.superficieCubierta,
        superficie_predio_m2: info.superficiePredio,
        gastos_generales: info.gastosGenerales,
        beneficio: info.beneficio,
        impuestos: info.impuestos,
      },
      totales: {
        costo_costo: plata(calc.total),
        costo_costo_usd: plataONull(calc.totalUsd),
        por_m2_cubierto: plataONull(calc.porM2Cubierto),
        por_m2_predio: plataONull(calc.porM2Predio),
        precio_venta: plata(venta.precio),
        coeficiente_pase: fina(venta.coeficiente),
        items: calc.cantidadItems,
      },
      nota: 'Importes en pesos. Incidencias y coeficientes como fracción (0,25 = 25 %). P.U. = precio unitario costo-costo.',
      rubros: rubros.map((rubro) => ({
        numero: rubro.numero,
        descripcion: rubro.descripcion,
        total: plata(rubro.total),
        total_usd: plataONull(rubro.totalUsd),
        incidencia: fina(rubro.incidencia),
        items: rubro.items.map((it) => ({
          codigo: it.codigo,
          descripcion: it.descripcion,
          unidad: it.unidad,
          cantidad: fina(it.cantidad),
          pu_materiales: plata(it.puMat),
          pu_mano_de_obra: plata(it.puMo),
          pu_equipos: plata(it.puEq),
          pu_total: plata(it.puTotal),
          subtotal: plata(it.subtotal),
          incidencia: fina(it.incidencia),
          ...(it.observaciones ? { observaciones: it.observaciones } : {}),
          ...(args.incluir_mediciones === true
            ? {
                mediciones: (medicionesPorItem.get(it.id) ?? []).map((m) => ({
                  sector: m.sector,
                  criterio: m.criterio,
                  cant: m.cant,
                  largo: m.largo,
                  ancho: m.ancho,
                  alto: m.alto,
                  coef: m.coef,
                  parcial: fina(parcialMedicion(m)),
                })),
              }
            : {}),
          ...(args.incluir_analisis === true
            ? {
                analisis: (apuPorItem.get(it.id) ?? []).map((l) => {
                  const precio = precioCalculo(l.insumo.tipo, l.insumo.precioBase, info.cargasSociales, info.coefAjuste)
                  return {
                    insumo: l.insumo.codigo,
                    descripcion: l.insumo.descripcion,
                    tipo: l.insumo.tipo,
                    unidad: l.insumo.unidad,
                    cantidad: l.cantidad,
                    precio: plata(precio),
                    parcial: plata(l.cantidad * precio),
                  }
                }),
              }
            : {}),
        })),
      })),
    })
  }

  return async function run(name: string, args: Record<string, unknown>): Promise<ToolResult> {
    await soloAdmin()
    switch (name) {
      case 'listar_presupuestos':
        return listar(args)
      case 'leer_presupuesto':
        return leer(args)
      default:
        throw new ToolError(`Herramienta desconocida: ${name}`)
    }
  }
}
