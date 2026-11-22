/**
 * Trabajo sin conexión en presupuestos: guarda en el dispositivo (IndexedDB)
 * la última copia del servidor de cada presupuesto abierto y la cola de
 * cambios sin subir. Los cambios se suben en lote apenas hay conexión, aunque
 * la vista del presupuesto esté cerrada (ver SincronizadorObra).
 *
 * Lo que se ve = copia del servidor + cambios pendientes aplicados encima
 * (con el mismo cálculo que el servidor, lib/presupuesto/local.ts).
 */
import type { Operacion } from './editar'
import { aplicarLocal, completarOperacion, conIds, type Snapshot } from './local'

const DB_NOMBRE = 'obra-offline'
const SNAPSHOTS = 'snapshots'
const COLA = 'cola'
/** Same limit as the server (MAX_LOTE in editar.ts). */
const LOTE = 200

type Pendiente = { key: number; presupuestoId: string; op: Operacion; at: number }

/* ------------------------------------------------------------------ */
/* IndexedDB                                                            */
/* ------------------------------------------------------------------ */

let dbPromesa: Promise<IDBDatabase> | null = null

function abrir(): Promise<IDBDatabase> {
  if (!dbPromesa) {
    dbPromesa = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NOMBRE, 1)
      req.onupgradeneeded = () => {
        const db = req.result
        if (!db.objectStoreNames.contains(SNAPSHOTS)) db.createObjectStore(SNAPSHOTS)
        if (!db.objectStoreNames.contains(COLA)) {
          db.createObjectStore(COLA, { keyPath: 'key', autoIncrement: true }).createIndex('presupuestoId', 'presupuestoId')
        }
      }
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => {
        dbPromesa = null
        reject(req.error)
      }
    })
  }
  return dbPromesa
}

function hecho<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function store(nombre: string, modo: IDBTransactionMode) {
  return (await abrir()).transaction(nombre, modo).objectStore(nombre)
}

export async function leerSnapshot(presupuestoId: string): Promise<Snapshot | null> {
  try {
    return ((await hecho((await store(SNAPSHOTS, 'readonly')).get(presupuestoId))) as Snapshot | undefined) ?? null
  } catch {
    return null
  }
}

async function guardarSnapshot(presupuestoId: string, s: Snapshot) {
  await hecho((await store(SNAPSHOTS, 'readwrite')).put(s, presupuestoId))
}

async function pendientes(presupuestoId: string): Promise<Pendiente[]> {
  const idx = (await store(COLA, 'readonly')).index('presupuestoId')
  const filas = (await hecho(idx.getAll(presupuestoId))) as Pendiente[]
  return filas.sort((a, b) => a.key - b.key)
}

async function encolar(presupuestoId: string, op: Operacion) {
  await hecho((await store(COLA, 'readwrite')).add({ presupuestoId, op, at: Date.now() }))
}

async function quitar(keys: number[]) {
  if (!keys.length) return
  const s = await store(COLA, 'readwrite')
  await Promise.all(keys.map((k) => hecho(s.delete(k))))
}

/** Budgets with changes still on the device. */
export async function presupuestosConPendientes(): Promise<string[]> {
  try {
    const filas = (await hecho((await store(COLA, 'readonly')).getAll())) as Pendiente[]
    return [...new Set(filas.map((f) => f.presupuestoId))]
  } catch {
    return []
  }
}

export async function cantidadPendientes(): Promise<number> {
  try {
    return await hecho((await store(COLA, 'readonly')).count())
  } catch {
    return 0
  }
}

/** Forget everything kept on the device (logout). */
export async function borrarTodo() {
  try {
    const db = await abrir()
    db.close()
  } catch {
    // nothing stored
  }
  dbPromesa = null
  await new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase(DB_NOMBRE)
    req.onsuccess = req.onerror = req.onblocked = () => resolve()
  })
}

/* ------------------------------------------------------------------ */
/* Estado observable por presupuesto                                    */
/* ------------------------------------------------------------------ */

export type EstadoSync = {
  /** Server copy + pending changes (what the screens show). */
  vista: Snapshot | null
  pendientes: number
  subiendo: boolean
  /** Last upload failed for lack of connection. */
  sinConexion: boolean
  /** The session expired: log in again to upload. */
  sinSesion: boolean
  /** The budget no longer exists on the server. */
  eliminado: boolean
}

type Interno = EstadoSync & { base: Snapshot | null; cola: Pendiente[] }
type Oyente = (e: EstadoSync) => void
export type Aviso = {
  tipo: 'rechazado' | 'subido'
  presupuestoId: string
  mensaje: string
  cantidad?: number
  /** Uploaded after a stretch without connection (or session). */
  trasCorte?: boolean
}

const estados = new Map<string, Interno>()
const oyentes = new Map<string, Set<Oyente>>()
const oyentesAviso = new Set<(a: Aviso) => void>()
const enCurso = new Map<string, Promise<void>>()

function estado(id: string): Interno {
  let e = estados.get(id)
  if (!e) {
    e = { vista: null, base: null, cola: [], pendientes: 0, subiendo: false, sinConexion: false, sinSesion: false, eliminado: false }
    estados.set(id, e)
  }
  return e
}

function emitir(id: string) {
  const { base: _base, cola: _cola, ...publico } = estado(id)
  oyentes.get(id)?.forEach((f) => f(publico))
}

function avisar(a: Aviso) {
  oyentesAviso.forEach((f) => f(a))
}

/** Server copy with the pending changes applied (a change that no longer applies is skipped). */
function recomponer(e: Interno) {
  if (!e.base) {
    e.vista = null
    return
  }
  let v = e.base
  for (const p of e.cola) {
    try {
      v = aplicarLocal(v, p.op)
    } catch {
      // The server will reject it too; it's reported then.
    }
  }
  e.vista = v
  e.pendientes = e.cola.length
}

export function suscribir(id: string, f: Oyente): () => void {
  let s = oyentes.get(id)
  if (!s) oyentes.set(id, (s = new Set()))
  s.add(f)
  return () => s!.delete(f)
}

export function suscribirAvisos(f: (a: Aviso) => void): () => void {
  oyentesAviso.add(f)
  return () => oyentesAviso.delete(f)
}

export function leerEstado(id: string): EstadoSync {
  const { base: _base, cola: _cola, ...publico } = estado(id)
  return publico
}

/* ------------------------------------------------------------------ */
/* Carga y edición                                                      */
/* ------------------------------------------------------------------ */

async function traerDelServidor(id: string): Promise<Snapshot | 'sin-conexion' | 'sin-sesion' | 'no-existe'> {
  let res: Response
  try {
    res = await fetch(`/api/presupuestos/${id}/snapshot`, { credentials: 'same-origin', cache: 'no-store' })
  } catch {
    return 'sin-conexion'
  }
  if (res.status === 401) return 'sin-sesion'
  if (res.status === 404) return 'no-existe'
  if (!res.ok) return 'sin-conexion'
  return (await res.json()) as Snapshot
}

/**
 * Shows the copy on the device right away, then uploads pending changes and
 * refreshes from the server when there's connection.
 */
export async function cargar(id: string): Promise<void> {
  const e = estado(id)
  if (!e.base) {
    const [local, cola] = await Promise.all([leerSnapshot(id), pendientes(id).catch(() => [])])
    if (local && !e.base) {
      e.base = local
      e.cola = cola
      recomponer(e)
      emitir(id)
    }
  }
  await sincronizar(id)
}

/**
 * Applies a change on the device and queues it for upload; returns the id of
 * the row it creates, if any. Throws ErrorLocal (same rules as the server)
 * when it can't be applied.
 */
export async function editar(id: string, cambio: Operacion): Promise<string | undefined> {
  const e = estado(id)
  if (!e.vista) throw new Error('El presupuesto todavía no se cargó')
  // New ids, item codes and rubro numbers are decided here so the server stores the same.
  const op = completarOperacion(e.vista, conIds(cambio))
  const vista = aplicarLocal(e.vista, op)
  await encolar(id, op)
  e.cola = await pendientes(id)
  e.vista = vista
  e.pendientes = e.cola.length
  emitir(id)
  programarSubida(id)
  return 'nuevoId' in op ? op.nuevoId : undefined
}

const timers = new Map<string, ReturnType<typeof setTimeout>>()

/** Uploads shortly after the last change, so quick edits go in one batch. */
function programarSubida(id: string) {
  clearTimeout(timers.get(id))
  timers.set(id, setTimeout(() => void subir(id), 600))
}

/** Uploads the pending changes, then refreshes the copy from the server. */
export function sincronizar(id: string): Promise<void> {
  return subir(id, true)
}

function subir(id: string, refrescar = false): Promise<void> {
  const previa = enCurso.get(id)
  if (previa) return previa.then(() => (refrescar || estado(id).cola.length ? subir(id, refrescar) : undefined))
  const p = subirAhora(id, refrescar).finally(() => enCurso.delete(id))
  enCurso.set(id, p)
  return p
}

async function subirAhora(id: string, refrescar: boolean) {
  const e = estado(id)
  const trasCorte = e.sinConexion || e.sinSesion || !e.base
  e.subiendo = true
  emitir(id)
  let subidos = 0
  let necesitaRefresco = refrescar
  try {
    for (;;) {
      e.cola = await pendientes(id).catch(() => [])
      if (!e.cola.length) break
      // One by one after a batch was refused as a whole, to find the bad change.
      const lote = e.cola.slice(0, LOTE)
      const r = await enviar(id, lote)
      if (r === 'sin-conexion') {
        e.sinConexion = true
        return
      }
      if (r === 'sin-sesion') {
        e.sinSesion = true
        return
      }
      e.sinConexion = false
      e.sinSesion = false
      if (r === 'no-existe') {
        e.eliminado = true
        await quitar(e.cola.map((p) => p.key))
        avisar({ tipo: 'rechazado', presupuestoId: id, mensaje: 'El presupuesto ya no existe: no se pudieron subir los cambios.' })
        return
      }
      await quitar(r.quitar)
      subidos += r.quitar.length
      if (r.rechazos.length) necesitaRefresco = true
      for (const m of r.rechazos) avisar({ tipo: 'rechazado', presupuestoId: id, mensaje: m })
      // Applied as sent: the server now matches base + these changes.
      if (e.base && !r.rechazos.length) {
        let b = e.base
        for (const p of lote) {
          if (!r.quitar.includes(p.key)) continue
          try {
            b = aplicarLocal(b, p.op)
          } catch {
            necesitaRefresco = true
          }
        }
        e.base = b
        await guardarSnapshot(id, b).catch(() => {})
      }
    }

    if (necesitaRefresco || !e.base) {
      const s = await traerDelServidor(id)
      if (s === 'sin-conexion') e.sinConexion = true
      else if (s === 'sin-sesion') e.sinSesion = true
      else if (s === 'no-existe') e.eliminado = true
      else {
        e.sinConexion = false
        e.sinSesion = false
        e.base = s
        await guardarSnapshot(id, s).catch(() => {})
      }
    }
    if (subidos) avisar({ tipo: 'subido', presupuestoId: id, mensaje: 'Cambios subidos', cantidad: subidos, trasCorte })
  } finally {
    e.cola = await pendientes(id).catch(() => e.cola)
    recomponer(e)
    e.subiendo = false
    emitir(id)
  }
}

type Envio = 'sin-conexion' | 'sin-sesion' | 'no-existe' | { quitar: number[]; rechazos: string[] }

async function post(id: string, body: unknown): Promise<Response | null> {
  try {
    return await fetch(`/api/presupuestos/${id}/editar`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  } catch {
    return null
  }
}

async function enviar(id: string, lote: Pendiente[]): Promise<Envio> {
  const res = await post(id, { lote: lote.map((p) => p.op) })
  if (!res) return 'sin-conexion'
  if (res.status === 401) return 'sin-sesion'
  if (res.status === 404) return 'no-existe'
  if (res.ok) {
    const data = (await res.json()) as { rechazadas: { indice: number; error: string }[] }
    return { quitar: lote.map((p) => p.key), rechazos: data.rechazadas.map((r) => r.error) }
  }
  if (res.status !== 400) return 'sin-conexion' // server trouble: try again later

  // The batch didn't validate as a whole: send one by one and drop only the bad ones.
  const quitarKeys: number[] = []
  const rechazos: string[] = []
  for (const p of lote) {
    const r = await post(id, p.op)
    if (!r) return quitarKeys.length ? { quitar: quitarKeys, rechazos } : 'sin-conexion'
    if (r.ok) quitarKeys.push(p.key)
    else if (r.status === 400) {
      quitarKeys.push(p.key)
      const body = (await r.json().catch(() => null)) as { error?: string } | null
      rechazos.push(body?.error ?? 'Un cambio no se pudo guardar')
    } else return quitarKeys.length ? { quitar: quitarKeys, rechazos } : 'sin-conexion'
  }
  return { quitar: quitarKeys, rechazos }
}

/** Uploads every budget with pending changes (on load and when the connection comes back). */
export async function subirTodo(): Promise<void> {
  for (const id of await presupuestosConPendientes()) await subir(id)
}
