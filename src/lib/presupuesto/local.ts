/**
 * Presupuesto en el dispositivo: una copia completa ("snapshot") sobre la que
 * se aplican las mismas operaciones que en el servidor, para trabajar sin
 * conexión. Las vistas (resumen, ficha del ítem, insumos) se derivan de acá.
 *
 * Puro a propósito (sin base de datos ni red): lo usa el navegador y se
 * testea con `node --test`.
 */
import { calcular, parcialMedicion, precioCalculo, TIPOS_INSUMO, type TipoInsumo } from './calculo.ts'
import type { Operacion } from './editar.ts'
import type { InsumoFila, ItemDetalle, PresupuestoDetalle, PresupuestoInfo } from './types.ts'

export type SnapInsumo = {
  id: string
  codigo: string
  descripcion: string
  unidad: string | null
  tipo: TipoInsumo
  precioBase: number
  fuente: string | null
  position: number
}
export type SnapRubro = { id: string; numero: number; descripcion: string; position: number }
export type SnapItem = {
  id: string
  rubroId: string
  codigo: string
  descripcion: string
  unidad: string | null
  observaciones: string | null
  position: number
}
export type SnapApu = { id: string; itemId: string; insumoId: string; cantidad: number; position: number }
export type SnapMedicion = {
  id: string
  itemId: string
  sector: string | null
  criterio: string | null
  cant: number | null
  largo: number | null
  ancho: number | null
  alto: number | null
  coef: number | null
  position: number
}

export type Snapshot = {
  info: PresupuestoInfo
  insumos: SnapInsumo[]
  rubros: SnapRubro[]
  items: SnapItem[]
  apu: SnapApu[]
  mediciones: SnapMedicion[]
}

/** A change that can't be applied (same rules and messages as the server). */
export class ErrorLocal extends Error {}

/** Ids for rows created on the device; the server accepts them as-is. */
export function nuevoIdLocal(): string {
  const bytes = new Uint8Array(12)
  globalThis.crypto.getRandomValues(bytes)
  return 'l' + Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

/** Operations that create a row carry the new row's id. */
export function conIds(op: Operacion): Operacion {
  switch (op.op) {
    case 'insumo.crear':
    case 'rubro.crear':
    case 'item.crear':
    case 'apu.crear':
    case 'medicion.crear':
      return op.nuevoId ? op : { ...op, nuevoId: nuevoIdLocal() }
    default:
      return op
  }
}

const siguiente = (filas: { position: number }[]) => filas.reduce((m, f) => Math.max(m, f.position), -1) + 1

/** Fills in what the server would compute (new rubro number, item code) so both sides agree. */
export function completarOperacion(s: Snapshot, op: Operacion): Operacion {
  if (op.op === 'rubro.crear' && op.data.numero === undefined) {
    return { ...op, data: { ...op.data, numero: s.rubros.reduce((m, r) => Math.max(m, r.numero), 0) + 1 } }
  }
  if (op.op === 'item.crear' && !op.data.codigo) {
    const rubro = s.rubros.find((r) => r.id === op.data.rubroId)
    if (rubro) {
      const max = s.items
        .filter((i) => i.rubroId === rubro.id)
        .reduce((m, i) => Math.max(m, Number(i.codigo.split('.')[1]) || 0), 0)
      return { ...op, data: { ...op.data, codigo: `${rubro.numero}.${String(max + 1).padStart(2, '0')}` } }
    }
  }
  return op
}

function existe<T>(fila: T | undefined, que: string): T {
  if (!fila) throw new ErrorLocal(`No se encontró ${que} en este presupuesto.`)
  return fila
}

/** Applies one operation; returns a new snapshot (the input isn't modified). */
export function aplicarLocal(s: Snapshot, op: Operacion): Snapshot {
  const n: Snapshot = {
    info: s.info,
    insumos: s.insumos,
    rubros: s.rubros,
    items: s.items,
    apu: s.apu,
    mediciones: s.mediciones,
  }
  const nuevoId = 'nuevoId' in op && op.nuevoId ? op.nuevoId : nuevoIdLocal()

  switch (op.op) {
    case 'parametros':
      n.info = { ...s.info, ...op.data }
      break

    case 'insumo.crear':
      if (s.insumos.some((i) => i.codigo === op.data.codigo)) {
        throw new ErrorLocal(`Ya existe un insumo con el código «${op.data.codigo}».`)
      }
      n.insumos = [
        ...s.insumos,
        {
          id: nuevoId,
          codigo: op.data.codigo,
          descripcion: op.data.descripcion,
          unidad: op.data.unidad ?? null,
          tipo: op.data.tipo,
          precioBase: op.data.precioBase,
          fuente: op.data.fuente ?? null,
          position: siguiente(s.insumos),
        },
      ]
      break
    case 'insumo.editar':
      existe(s.insumos.find((i) => i.id === op.id), 'el insumo')
      if (op.data.codigo && s.insumos.some((i) => i.codigo === op.data.codigo && i.id !== op.id)) {
        throw new ErrorLocal(`Ya existe un insumo con el código «${op.data.codigo}».`)
      }
      n.insumos = s.insumos.map((i) => (i.id === op.id ? { ...i, ...op.data } : i))
      break
    case 'insumo.eliminar': {
      const usos = s.apu.filter((a) => a.insumoId === op.id)
      if (usos.length) {
        const codigos = [...new Set(usos.map((u) => s.items.find((i) => i.id === u.itemId)?.codigo ?? '?'))]
        throw new ErrorLocal(
          `Este insumo se usa en ${codigos.length === 1 ? 'el ítem' : 'los ítems'} ${codigos.slice(0, 8).join(', ')}${codigos.length > 8 ? '…' : ''}. Quitalo de esos análisis antes de eliminarlo.`
        )
      }
      n.insumos = s.insumos.filter((i) => i.id !== op.id)
      break
    }

    case 'rubro.crear': {
      const c = completarOperacion(s, op) as typeof op
      n.rubros = [...s.rubros, { id: nuevoId, descripcion: c.data.descripcion, numero: c.data.numero!, position: siguiente(s.rubros) }]
      break
    }
    case 'rubro.editar':
      existe(s.rubros.find((r) => r.id === op.id), 'el rubro')
      n.rubros = s.rubros.map((r) => (r.id === op.id ? { ...r, ...op.data } : r))
      break
    case 'rubro.eliminar': {
      const items = new Set(s.items.filter((i) => i.rubroId === op.id).map((i) => i.id))
      n.rubros = s.rubros.filter((r) => r.id !== op.id)
      n.items = s.items.filter((i) => !items.has(i.id))
      n.apu = s.apu.filter((a) => !items.has(a.itemId))
      n.mediciones = s.mediciones.filter((m) => !items.has(m.itemId))
      break
    }

    case 'item.crear': {
      existe(s.rubros.find((r) => r.id === op.data.rubroId), 'el rubro')
      const c = completarOperacion(s, op) as typeof op
      // Right after the rubro's last item (items are ordered globally).
      const delRubro = s.items.filter((i) => i.rubroId === op.data.rubroId)
      const position = delRubro.length ? Math.max(...delRubro.map((i) => i.position)) + 1 : siguiente(s.items)
      n.items = [
        ...s.items.map((i) => (delRubro.length && i.position >= position ? { ...i, position: i.position + 1 } : i)),
        {
          id: nuevoId,
          rubroId: op.data.rubroId,
          codigo: c.data.codigo!,
          descripcion: op.data.descripcion,
          unidad: op.data.unidad ?? null,
          observaciones: null,
          position,
        },
      ]
      break
    }
    case 'item.editar':
      existe(s.items.find((i) => i.id === op.id), 'el ítem')
      n.items = s.items.map((i) => (i.id === op.id ? { ...i, ...op.data } : i))
      break
    case 'item.eliminar':
      n.items = s.items.filter((i) => i.id !== op.id)
      n.apu = s.apu.filter((a) => a.itemId !== op.id)
      n.mediciones = s.mediciones.filter((m) => m.itemId !== op.id)
      break

    case 'apu.crear':
      existe(s.items.find((i) => i.id === op.data.itemId), 'el ítem')
      existe(s.insumos.find((i) => i.id === op.data.insumoId), 'el insumo')
      n.apu = [
        ...s.apu,
        { id: nuevoId, ...op.data, position: siguiente(s.apu.filter((a) => a.itemId === op.data.itemId)) },
      ]
      break
    case 'apu.editar':
      existe(s.apu.find((a) => a.id === op.id), 'la línea de análisis')
      n.apu = s.apu.map((a) => (a.id === op.id ? { ...a, ...op.data } : a))
      break
    case 'apu.eliminar':
      n.apu = s.apu.filter((a) => a.id !== op.id)
      break

    case 'medicion.crear':
      existe(s.items.find((i) => i.id === op.data.itemId), 'el ítem')
      n.mediciones = [
        ...s.mediciones,
        {
          id: nuevoId,
          itemId: op.data.itemId,
          sector: op.data.sector ?? null,
          criterio: op.data.criterio ?? null,
          cant: op.data.cant ?? null,
          largo: op.data.largo ?? null,
          ancho: op.data.ancho ?? null,
          alto: op.data.alto ?? null,
          coef: op.data.coef ?? null,
          position: siguiente(s.mediciones.filter((m) => m.itemId === op.data.itemId)),
        },
      ]
      break
    case 'medicion.editar':
      existe(s.mediciones.find((m) => m.id === op.id), 'la medición')
      n.mediciones = s.mediciones.map((m) => (m.id === op.id ? { ...m, ...op.data } : m))
      break
    case 'medicion.eliminar':
      n.mediciones = s.mediciones.filter((m) => m.id !== op.id)
      break
  }
  return n
}

/* ------------------------------------------------------------------ */
/* Vistas derivadas (mismas formas que devolvía la API)                 */
/* ------------------------------------------------------------------ */

export function derivarDetalle(s: Snapshot): PresupuestoDetalle {
  const calc = calcular(s.info, s.insumos, s.rubros, s.items, s.apu, s.mediciones)
  return { info: { ...s.info, totalCache: calc.total }, calc }
}

export function derivarItem(s: Snapshot, itemId: string): ItemDetalle | null {
  const item = s.items.find((i) => i.id === itemId)
  if (!item) return null
  const rubro = s.rubros.find((r) => r.id === item.rubroId)
  const insumos = new Map(s.insumos.map((i) => [i.id, i]))
  const porPos = <T extends { position: number }>(a: T, b: T) => a.position - b.position

  const apu = s.apu
    .filter((l) => l.itemId === itemId && insumos.has(l.insumoId))
    .sort(porPos)
    .map((l) => {
      const ins = insumos.get(l.insumoId)!
      const precio = precioCalculo(ins.tipo, ins.precioBase, s.info.cargasSociales, s.info.coefAjuste)
      return {
        id: l.id, cantidad: l.cantidad, insumoId: l.insumoId, codigo: ins.codigo, descripcion: ins.descripcion,
        unidad: ins.unidad, tipo: ins.tipo, precioBase: ins.precioBase, precioCalculo: precio, parcial: l.cantidad * precio,
      }
    })
  const puPorTipo = Object.fromEntries(
    TIPOS_INSUMO.map((t) => [t, apu.filter((l) => l.tipo === t).reduce((sum, l) => sum + l.parcial, 0)])
  ) as Record<TipoInsumo, number>
  const mediciones = s.mediciones
    .filter((m) => m.itemId === itemId)
    .sort(porPos)
    .map((m) => ({
      id: m.id, sector: m.sector, criterio: m.criterio, cant: m.cant, largo: m.largo, ancho: m.ancho, alto: m.alto, coef: m.coef,
      parcial: parcialMedicion(m),
    }))
  const cantidad = mediciones.reduce((sum, m) => sum + m.parcial, 0)
  const puTotal = apu.reduce((sum, l) => sum + l.parcial, 0)
  return {
    item: {
      id: item.id, codigo: item.codigo, descripcion: item.descripcion, unidad: item.unidad, observaciones: item.observaciones,
      rubroNumero: rubro?.numero ?? 0, rubroDescripcion: rubro?.descripcion ?? '',
    },
    apu,
    puPorTipo,
    puTotal,
    mediciones,
    cantidad,
    subtotal: cantidad * puTotal,
  }
}

export function derivarInsumos(s: Snapshot): InsumoFila[] {
  return [...s.insumos]
    .sort((a, b) => a.position - b.position)
    .map(({ position: _position, ...ins }) => ({
      ...ins,
      precioCalculo: precioCalculo(ins.tipo, ins.precioBase, s.info.cargasSociales, s.info.coefAjuste),
      usos: new Set(s.apu.filter((a) => a.insumoId === ins.id).map((a) => a.itemId)).size,
    }))
}
