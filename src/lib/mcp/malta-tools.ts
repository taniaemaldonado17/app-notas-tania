/**
 * Tools of the Claude connector: what Claude can read and write in Malta,
 * always as the user who generated the connector link (same access as in the
 * app: their own pages plus pages shared with them).
 *
 * Documents are the page content of a database row or of a board card;
 * Claude reads and writes them as Markdown (see md-blocks.ts).
 */
import type { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { accessiblePageWhere } from '@/lib/auth-helpers'
import { databaseInclude, serializeDatabase, sanitizeValues } from '@/lib/db-server'
import { resolveValue } from '@/lib/db-resolve'
import { findOption, formatNumber, type DatabaseDef, type DbRow, type PropertyDef, type RowValue } from '@/lib/db-types'
import { saveVersionBeforeChange } from '@/lib/versions'
import { parseDoc, serializeDoc, type DocBlock } from '@/lib/blocks'
import { blocksToMarkdown, markdownToBlocks } from '@/lib/md-blocks'
import { editBlocks, EditError, replaceText, type BlockAction } from '@/lib/block-edit'
import { makeStructureRunner, STRUCTURE_TOOL_NAMES, STRUCTURE_TOOLS } from '@/lib/mcp/structure-tools'
import { text, ToolError, type ToolDef, type ToolResult } from '@/lib/mcp/protocol'
import { blockText, findSubPageBlocks, subPageBlock, SUBPAGE_BLOCK, type DocRef } from '@/lib/subpages'
import { createSubPage, findAccessibleDoc, findAccessibleSubPage, parentOf, subPageTrail, syncLinkBlock, writeContent } from '@/lib/subpages-server'

const MAX_MARKDOWN = 400_000
const MAX_STORED = 2_000_000

export const INSTRUCTIONS = `Malta es la app de notas y proyectos de la usuaria (estilo Notion), en español.
- Las páginas son de dos tipos: "bases de datos" (tablas con filas, por ejemplo ARQUITECTURA > Proyectos) o "tablero" (columnas con tarjetas).
- Cada fila o tarjeta tiene su propio documento, que se lee y se escribe en Markdown.
- Para guardar un documento nuevo: listar_paginas → elegí la base de datos o la columna adecuada → crear_documento.
- Para cambiar uno existente: buscar o listar_entradas → leer_documento → actualizar_documento.
- Un documento puede tener páginas adentro (como en Notion). En el Markdown aparecen como una línea "📄 [Título](subpagina:ID)": leelas con leer_documento usando ese ID. Para crear una, usá crear_documento con dentro_de; para pasar una parte de un documento a una página propia, convertir_en_subpagina.
- Para cambios puntuales (corregir un párrafo, cambiar unas palabras, agregar o borrar un bloque) usá editar_bloques o reemplazar_texto: dejan el resto del documento intacto, con su formato. actualizar_documento con modo "reemplazar" reescribe todo el documento y pierde colores y alineaciones.
- Para armar o cambiar la estructura de una página de bases de datos: ver_estructura → crear_base / agregar_propiedad / crear_vista → agregar_al_tablero (pantalla principal: vistas, títulos, botones de acción rápida con plantilla e indicadores).
- Antes de reemplazar el contenido de un documento existente, confirmá con la usuaria si no lo pidió explícitamente.`

/* --------------------------------- Schemas -------------------------------- */

const idProp = (description: string) => ({ type: 'string', description })

export const TOOLS: ToolDef[] = [
  {
    name: 'listar_paginas',
    title: 'Listar páginas',
    description:
      'Lista las páginas de Malta a las que hay acceso, con sus bases de datos (páginas de tipo "bases de datos") o sus columnas (páginas de tipo "tablero"), y cuántas entradas tiene cada una. Usalo primero para saber dónde leer o guardar documentos.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  {
    name: 'listar_entradas',
    title: 'Listar entradas',
    description:
      'Lista las filas de una base de datos (con sus propiedades: etapa, estado, fechas…) o las tarjetas de una columna de tablero. Pasá base_id o columna_id (salen de listar_paginas).',
    inputSchema: {
      type: 'object',
      properties: {
        base_id: idProp('Id de la base de datos'),
        columna_id: idProp('Id de la columna de un tablero'),
        texto: { type: 'string', description: 'Filtra por texto en el título (opcional)' },
        limite: { type: 'integer', minimum: 1, maximum: 200, description: 'Máximo de entradas (por defecto 50)' },
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  {
    name: 'buscar',
    title: 'Buscar',
    description: 'Busca filas y tarjetas por texto en el título o en el contenido, en todas las páginas accesibles.',
    inputSchema: {
      type: 'object',
      properties: {
        texto: { type: 'string', description: 'Texto a buscar' },
        limite: { type: 'integer', minimum: 1, maximum: 50, description: 'Máximo de resultados (por defecto 20)' },
      },
      required: ['texto'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  {
    name: 'leer_documento',
    title: 'Leer documento',
    description:
      'Lee una fila, una tarjeta o una página interna: título, dónde está, propiedades (filas) y el contenido en Markdown. Las páginas internas aparecen como "📄 [Título](subpagina:ID)".',
    inputSchema: {
      type: 'object',
      properties: { id: idProp('Id de la fila, tarjeta o página interna') },
      required: ['id'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  {
    name: 'crear_documento',
    title: 'Crear documento',
    description:
      'Crea una fila nueva en una base de datos (base_id), una tarjeta nueva en una columna (columna_id) o una página dentro de un documento (dentro_de: id de una fila, tarjeta o página; queda como bloque "Página" al final de ese documento). Lleva título, contenido en Markdown (títulos, negritas, listas, tablas, citas, código) y, para filas, valores de propiedades por nombre.',
    inputSchema: {
      type: 'object',
      properties: {
        base_id: idProp('Id de la base de datos donde crear la fila'),
        columna_id: idProp('Id de la columna donde crear la tarjeta'),
        dentro_de: idProp('Id de la fila, tarjeta o página dentro de la cual crear una página'),
        titulo: { type: 'string', description: 'Título de la fila o tarjeta' },
        contenido_markdown: { type: 'string', description: 'Contenido del documento en Markdown' },
        icono: { type: 'string', description: 'Un emoji (opcional)' },
        propiedades: {
          type: 'object',
          description:
            'Solo para filas: valores por nombre de propiedad, por ejemplo {"Etapa": "Anteproyecto", "Entrega": "2026-12-15"}. Selecciones por nombre de opción; fechas AAAA-MM-DD; null borra el valor.',
          additionalProperties: true,
        },
      },
      required: ['titulo'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  },
  {
    name: 'actualizar_documento',
    title: 'Actualizar documento',
    description:
      'Cambia una fila, tarjeta o página interna: título, ícono, propiedades (filas) y/o contenido. Con modo "reemplazar" (por defecto) el Markdown reemplaza todo el documento (las líneas "📄 [Título](subpagina:ID)" mantienen las páginas internas; las que falten se agregan al final); con "agregar_al_final" se suma después de lo que ya hay. Queda una versión anterior en el historial de la página.',
    inputSchema: {
      type: 'object',
      properties: {
        id: idProp('Id de la fila, tarjeta o página interna'),
        titulo: { type: 'string' },
        icono: { type: ['string', 'null'], description: 'Emoji, o null para quitarlo' },
        contenido_markdown: { type: 'string' },
        modo: { type: 'string', enum: ['reemplazar', 'agregar_al_final'] },
        propiedades: { type: 'object', description: 'Solo para filas; igual que en crear_documento', additionalProperties: true },
      },
      required: ['id'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
  },
  {
    name: 'editar_bloques',
    title: 'Editar bloques',
    description:
      'Cambia una parte puntual de un documento sin tocar el resto (formato, colores e imágenes quedan igual). Ubica el bloque (párrafo, título, ítem de lista…) cuyo texto contiene "buscar" y lo reemplaza por el Markdown nuevo, inserta Markdown antes o después, o lo elimina. Con "hasta" abarca desde ese bloque hasta el que contiene ese otro texto, al mismo nivel. Leé el documento antes para elegir un texto que identifique un solo bloque.',
    inputSchema: {
      type: 'object',
      properties: {
        id: idProp('Id de la fila, tarjeta o página interna'),
        accion: { type: 'string', enum: ['reemplazar', 'insertar_despues', 'insertar_antes', 'eliminar'] },
        buscar: { type: 'string', description: 'Parte del texto del bloque (sin importar mayúsculas ni acentos)' },
        hasta: { type: 'string', description: 'Opcional: texto del último bloque del rango' },
        markdown: { type: 'string', description: 'Contenido nuevo en Markdown (para reemplazar o insertar)' },
        ocurrencia: { type: 'integer', minimum: 1, description: 'Si varios bloques contienen el texto: cuál (1 = el primero)' },
      },
      required: ['id', 'accion', 'buscar'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
  },
  {
    name: 'reemplazar_texto',
    title: 'Reemplazar texto',
    description:
      'Cambia palabras exactas dentro de un documento conservando el formato de cada parte (negritas, colores, enlaces). El texto tiene que aparecer una sola vez, salvo que pases todas: true.',
    inputSchema: {
      type: 'object',
      properties: {
        id: idProp('Id de la fila, tarjeta o página interna'),
        buscar: { type: 'string', description: 'Texto exacto a cambiar (respeta mayúsculas y acentos)' },
        reemplazo: { type: 'string', description: 'Texto nuevo' },
        todas: { type: 'boolean', description: 'Cambiar todas las apariciones' },
      },
      required: ['id', 'buscar', 'reemplazo'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  },
  {
    name: 'convertir_en_subpagina',
    title: 'Convertir en página',
    description:
      'Pasa una parte de un documento a una página propia dentro de ese documento, como "Convertir en → Página" de Notion: los bloques desde el que empieza con desde_texto (hasta antes del que empieza con hasta_texto, o hasta el final) se mueven tal cual a la página nueva y en su lugar queda el bloque "Página". Si el primer bloque es un título y no pasás titulo, ese título pasa a ser el nombre de la página.',
    inputSchema: {
      type: 'object',
      properties: {
        id: idProp('Id de la fila, tarjeta o página que tiene el contenido'),
        desde_texto: { type: 'string', description: 'Comienzo del texto del primer bloque a mover (por ejemplo un título)' },
        hasta_texto: { type: 'string', description: 'Comienzo del texto del primer bloque que NO se mueve (opcional; por defecto hasta el final)' },
        titulo: { type: 'string', description: 'Título de la página (opcional)' },
        icono: { type: 'string', description: 'Emoji (opcional)' },
      },
      required: ['id', 'desde_texto'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  },
  ...STRUCTURE_TOOLS,
]

/* --------------------------------- Helpers -------------------------------- */

const str = (v: unknown) => (typeof v === 'string' ? v : undefined)
const json = (v: unknown) => text(JSON.stringify(v, null, 2))
const limit = (v: unknown, def: number, max: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(1, Math.trunc(v))) : def)

function cleanIcon(v: unknown): string | null | undefined {
  if (v === null) return null
  if (typeof v !== 'string') return undefined
  return v.trim().slice(0, 16) || null
}

/** Gives an id to every block (and nested block) that lacks one. */
function ensureIds(blocks: DocBlock[]): DocBlock[] {
  return blocks.map((b) => ({
    ...b,
    id: typeof b.id === 'string' && b.id ? b.id : globalThis.crypto.randomUUID(),
    ...(Array.isArray(b.children) ? { children: ensureIds(b.children) } : {}),
  }))
}

function readMarkdown(v: unknown): string | undefined {
  if (v === undefined) return undefined
  if (typeof v !== 'string') throw new ToolError('contenido_markdown tiene que ser texto')
  if (v.length > MAX_MARKDOWN) throw new ToolError(`El contenido es demasiado largo (máximo ${MAX_MARKDOWN.toLocaleString('es-AR')} caracteres)`)
  return v
}

/**
 * New stored content: the Markdown alone, or added after the current content.
 * When replacing, links to pages inside the document that the Markdown left
 * out are kept at the end (so those pages don't get lost).
 */
function buildContent(current: string | null, markdown: string, append: boolean, warnings: string[] = []): string | null {
  const added = markdownToBlocks(markdown)
  let blocks: DocBlock[]
  if (append) {
    blocks = [...parseDoc(current), ...added]
  } else {
    const kept = new Set(findSubPageBlocks(added).map((b) => b.props?.subpageId))
    const lost = findSubPageBlocks(parseDoc(current)).filter((b) => !kept.has(b.props?.subpageId))
    if (lost.length) warnings.push(`Se mantuvieron al final ${lost.length} página(s) interna(s) que no estaban en el Markdown`)
    blocks = [...added, ...lost.map((b) => ({ ...b, children: [] }))]
  }
  const stored = serializeDoc(ensureIds(blocks))
  if (stored && stored.length > MAX_STORED) throw new ToolError('El documento quedaría demasiado grande')
  return stored
}

const norm2 = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim().toLowerCase()

/* ------------------------------ Row properties ----------------------------- */

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase()

function optionId(prop: PropertyDef, name: unknown): string | null {
  if (typeof name !== 'string') return null
  const n = norm(name)
  // Options may carry an emoji ("🏗️ Obra"): also match the name without it.
  const plain = (s: string) => norm(s.replace(/[^\p{L}\p{N}\s]/gu, ''))
  const opt = prop.options?.find((o) => norm(o.name) === n) ?? prop.options?.find((o) => plain(o.name) === plain(name))
  return opt?.id ?? null
}

/** Converts {"Nombre de propiedad": valor} into stored row values. */
function valuesFromInput(properties: PropertyDef[], input: unknown): { values: Record<string, RowValue>; warnings: string[] } {
  const values: Record<string, RowValue> = {}
  const warnings: string[] = []
  if (input === undefined || input === null) return { values, warnings }
  if (typeof input !== 'object' || Array.isArray(input)) throw new ToolError('propiedades tiene que ser un objeto {"Nombre": valor}')

  for (const [key, raw] of Object.entries(input as Record<string, unknown>)) {
    const prop = properties.find((p) => p.id === key) ?? properties.find((p) => norm(p.name) === norm(key))
    if (!prop) {
      warnings.push(`No existe la propiedad "${key}". Propiedades: ${properties.map((p) => p.name).join(', ')}`)
      continue
    }
    if (prop.type === 'title') {
      warnings.push(`"${prop.name}" es el título: usá el campo titulo`)
      continue
    }
    if (raw === null) {
      values[prop.id] = null
      continue
    }
    switch (prop.type) {
      case 'text':
      case 'url':
      case 'email':
      case 'phone':
        values[prop.id] = String(raw).slice(0, 5000)
        break
      case 'number': {
        // "1.500,50" (Argentina) or "1500.5"
        const s = String(raw).trim().replace(/[$\s]/g, '')
        const n = typeof raw === 'number' ? raw : Number(s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s)
        if (Number.isFinite(n)) values[prop.id] = n
        else warnings.push(`"${prop.name}" espera un número`)
        break
      }
      case 'checkbox':
        values[prop.id] = raw === true || ['si', 'sí', 'true', '1', 'x'].includes(norm(String(raw)))
        break
      case 'date': {
        const s = String(raw).trim()
        if (/^\d{4}-\d{2}-\d{2}$/.test(s)) values[prop.id] = s
        else warnings.push(`"${prop.name}" espera una fecha AAAA-MM-DD`)
        break
      }
      case 'select':
      case 'status': {
        const id = optionId(prop, raw)
        if (id) values[prop.id] = id
        else warnings.push(`"${String(raw)}" no es una opción de "${prop.name}". Opciones: ${(prop.options ?? []).map((o) => o.name).join(', ')}`)
        break
      }
      case 'multi_select': {
        const names = Array.isArray(raw) ? raw : String(raw).split(',')
        const ids: string[] = []
        for (const name of names) {
          const id = optionId(prop, name)
          if (id) ids.push(id)
          else warnings.push(`"${String(name).trim()}" no es una opción de "${prop.name}"`)
        }
        values[prop.id] = ids
        break
      }
      default:
        warnings.push(`"${prop.name}" (${prop.type}) no se puede cambiar desde Claude; hacelo en Malta`)
    }
  }
  return { values, warnings }
}

/** Property values as a person reads them (option names, related titles…). */
function readableValues(all: DatabaseDef[], dbDef: DatabaseDef, row: DbRow, people: Map<string, string>) {
  const out: Record<string, unknown> = {}
  const titleOf = (id: string) => {
    for (const d of all) {
      const r = d.rows.find((x) => x.id === id)
      if (r) return r.title || 'Sin título'
    }
    return id
  }
  for (const prop of dbDef.properties) {
    if (prop.type === 'title' || prop.type === 'created_time' || prop.type === 'updated_time') continue
    const v = resolveValue({ databases: all }, dbDef, row, prop)
    if (v === null || v === undefined || v === '' || (Array.isArray(v) && !v.length)) continue
    switch (prop.type) {
      case 'select':
      case 'status':
        out[prop.name] = findOption(prop, v)?.name ?? null
        break
      case 'multi_select':
        out[prop.name] = Array.isArray(v) ? v.map((id) => findOption(prop, id)?.name).filter(Boolean) : null
        break
      case 'relation':
      case 'backlink':
        out[prop.name] = Array.isArray(v) ? v.map((id) => titleOf(String(id))) : null
        break
      case 'person':
        out[prop.name] = Array.isArray(v) ? v.map((id) => people.get(String(id)) ?? String(id)) : null
        break
      case 'number':
      case 'formula':
        out[prop.name] = typeof v === 'number' ? formatNumber(v, prop.numberFormat) : v
        break
      default:
        out[prop.name] = v
    }
    if (out[prop.name] === null) delete out[prop.name]
  }
  return out
}

async function pageDatabases(pageId: string): Promise<DatabaseDef[]> {
  const list = await db.database.findMany({
    where: { pageId },
    orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
    include: databaseInclude,
  })
  return list.map(serializeDatabase)
}

async function peopleNames(dbs: DatabaseDef[]): Promise<Map<string, string>> {
  const ids = new Set<string>()
  for (const d of dbs) {
    const personProps = d.properties.filter((p) => p.type === 'person').map((p) => p.id)
    for (const r of d.rows) for (const pid of personProps) {
      const v = r.values[pid]
      if (Array.isArray(v)) v.forEach((x) => ids.add(x))
    }
  }
  if (!ids.size) return new Map()
  const users = await db.user.findMany({ where: { id: { in: [...ids] } }, select: { id: true, name: true, email: true } })
  return new Map(users.map((u) => [u.id, u.name || u.email]))
}

/* ------------------------------- Lookups ----------------------------------- */

async function findRow(userId: string, id: string) {
  return db.dbRow.findFirst({
    where: { id, database: { page: accessiblePageWhere(userId) } },
    select: {
      id: true,
      title: true,
      icon: true,
      content: true,
      databaseId: true,
      database: { select: { id: true, title: true, pageId: true, page: { select: { title: true } } } },
    },
  })
}

async function findCard(userId: string, id: string) {
  return db.card.findFirst({
    where: { id, column: { page: accessiblePageWhere(userId) } },
    select: {
      id: true,
      title: true,
      icon: true,
      description: true,
      column: { select: { id: true, title: true, pageId: true, page: { select: { title: true } } } },
    },
  })
}

/* --------------------------------- Tools ----------------------------------- */

export function makeRunner(userId: string, origin: string) {
  const rowLink = (id: string) => `${origin}/?row=${encodeURIComponent(id)}`
  const cardLink = (id: string) => `${origin}/?card=${encodeURIComponent(id)}`
  const subLink = (id: string) => `${origin}/?subpage=${encodeURIComponent(id)}`
  const linkOf = (ref: DocRef) => (ref.kind === 'row' ? rowLink(ref.id) : ref.kind === 'card' ? cardLink(ref.id) : subLink(ref.id))

  /** Which kind of document an id is (row, card or page inside a document). */
  async function kindOf(id: string): Promise<DocRef | null> {
    if (await findRow(userId, id)) return { kind: 'row', id }
    if (await findCard(userId, id)) return { kind: 'card', id }
    if (await findAccessibleSubPage(userId, id)) return { kind: 'subpage', id }
    return null
  }

  async function listarPaginas(): Promise<ToolResult> {
    const pages = await db.page.findMany({
      where: accessiblePageWhere(userId),
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        title: true,
        icon: true,
        kind: true,
        userId: true,
        databases: { orderBy: [{ position: 'asc' }, { createdAt: 'asc' }], select: { id: true, title: true, icon: true, _count: { select: { rows: true } } } },
        columns: { orderBy: { position: 'asc' }, select: { id: true, title: true, _count: { select: { cards: true } } } },
      },
    })
    return json({
      paginas: pages.map((p) => ({
        id: p.id,
        titulo: p.title,
        icono: p.icon,
        tipo: p.kind === 'databases' ? 'bases de datos' : 'tablero',
        compartida_conmigo: p.userId !== userId,
        ...(p.kind === 'databases'
          ? { bases: p.databases.map((d) => ({ id: d.id, titulo: d.title, icono: d.icon, filas: d._count.rows })) }
          : { columnas: p.columns.map((c) => ({ id: c.id, titulo: c.title, tarjetas: c._count.cards })) }),
      })),
    })
  }

  async function listarEntradas(args: Record<string, unknown>): Promise<ToolResult> {
    const baseId = str(args.base_id)
    const columnaId = str(args.columna_id)
    const filtro = str(args.texto)?.trim()
    const max = limit(args.limite, 50, 200)
    if (!!baseId === !!columnaId) throw new ToolError('Pasá base_id o columna_id (uno de los dos)')

    if (baseId) {
      const found = await db.database.findFirst({ where: { id: baseId, page: accessiblePageWhere(userId) }, select: { pageId: true } })
      if (!found) throw new ToolError('No encontré esa base de datos (o no tenés acceso)')
      const all = await pageDatabases(found.pageId)
      const dbDef = all.find((d) => d.id === baseId)!
      const people = await peopleNames(all)
      let rows = dbDef.rows
      if (filtro) rows = rows.filter((r) => norm(r.title).includes(norm(filtro)))
      return json({
        base: dbDef.title,
        total: rows.length,
        filas: rows.slice(0, max).map((r) => ({
          id: r.id,
          titulo: r.title || 'Sin título',
          icono: r.icon,
          actualizado: r.updatedAt,
          propiedades: readableValues(all, dbDef, r, people),
        })),
      })
    }

    const column = await db.column.findFirst({ where: { id: columnaId, page: accessiblePageWhere(userId) }, select: { title: true } })
    if (!column) throw new ToolError('No encontré esa columna (o no tenés acceso)')
    const cards = await db.card.findMany({
      where: { columnId: columnaId, ...(filtro ? { title: { contains: filtro, mode: 'insensitive' } } : {}) },
      orderBy: { position: 'asc' },
      take: max,
      select: { id: true, title: true, icon: true, updatedAt: true, description: true },
    })
    return json({
      columna: column.title,
      tarjetas: cards.map((c) => ({ id: c.id, titulo: c.title, icono: c.icon, actualizado: c.updatedAt.toISOString(), tiene_contenido: !!c.description })),
    })
  }

  async function buscar(args: Record<string, unknown>): Promise<ToolResult> {
    const q = str(args.texto)?.trim()
    if (!q) throw new ToolError('Falta el texto a buscar')
    const max = limit(args.limite, 20, 50)
    const match = { contains: q, mode: 'insensitive' as const }
    const [rows, cards, subs] = await Promise.all([
      db.dbRow.findMany({
        where: { database: { page: accessiblePageWhere(userId) }, OR: [{ title: match }, { content: match }] },
        orderBy: { updatedAt: 'desc' },
        take: max,
        select: { id: true, title: true, icon: true, database: { select: { title: true, page: { select: { title: true } } } } },
      }),
      db.card.findMany({
        where: { column: { page: accessiblePageWhere(userId) }, OR: [{ title: match }, { description: match }] },
        orderBy: { updatedAt: 'desc' },
        take: max,
        select: { id: true, title: true, icon: true, column: { select: { title: true, page: { select: { title: true } } } } },
      }),
      db.subPage.findMany({
        where: { page: accessiblePageWhere(userId), OR: [{ title: match }, { content: match }] },
        orderBy: { updatedAt: 'desc' },
        take: max,
        select: { id: true, title: true, icon: true, page: { select: { title: true } } },
      }),
    ])
    return json({
      resultados: [
        ...rows.map((r) => ({ id: r.id, tipo: 'fila', titulo: r.title || 'Sin título', icono: r.icon, base: r.database.title, pagina: r.database.page.title })),
        ...cards.map((c) => ({ id: c.id, tipo: 'tarjeta', titulo: c.title, icono: c.icon, columna: c.column.title, pagina: c.column.page.title })),
        ...subs.map((sp) => ({ id: sp.id, tipo: 'página interna', titulo: sp.title || 'Sin título', icono: sp.icon, pagina: sp.page.title })),
      ].slice(0, max),
    })
  }

  async function leerDocumento(args: Record<string, unknown>): Promise<ToolResult> {
    const id = str(args.id)
    if (!id) throw new ToolError('Falta el id')
    const row = await findRow(userId, id)
    if (row) {
      const all = await pageDatabases(row.database.pageId)
      const dbDef = all.find((d) => d.id === row.databaseId)
      const r = dbDef?.rows.find((x) => x.id === row.id)
      const props = dbDef && r ? readableValues(all, dbDef, r, await peopleNames(all)) : {}
      const lines = [
        `# ${row.icon ? `${row.icon} ` : ''}${row.title || 'Sin título'}`,
        '',
        `Fila de la base "${row.database.title}" (página ${row.database.page.title}) · id ${row.id}`,
        `Enlace: ${rowLink(row.id)}`,
      ]
      const entries = Object.entries(props)
      if (entries.length) {
        lines.push('', 'Propiedades:', ...entries.map(([k, v]) => `- ${k}: ${Array.isArray(v) ? v.join(', ') : String(v)}`))
      }
      const body = blocksToMarkdown(parseDoc(row.content))
      lines.push('', '---', '', body || '(El documento está vacío)')
      return text(lines.join('\n'))
    }
    const card = await findCard(userId, id)
    if (card) {
      const body = blocksToMarkdown(parseDoc(card.description))
      return text(
        [
          `# ${card.icon ? `${card.icon} ` : ''}${card.title}`,
          '',
          `Tarjeta de la columna "${card.column.title}" (página ${card.column.page.title}) · id ${card.id}`,
          `Enlace: ${cardLink(card.id)}`,
          '',
          '---',
          '',
          body || '(El documento está vacío)',
        ].join('\n')
      )
    }
    const sub = await findAccessibleSubPage(userId, id)
    if (sub) {
      const trail = await subPageTrail(sub)
      const where = trail.map((t) => `${t.icon ? `${t.icon} ` : ''}${t.title || 'Sin título'}`).join(' › ')
      const parent = parentOf(sub)
      return text(
        [
          `# ${sub.icon ? `${sub.icon} ` : ''}${sub.title || 'Sin título'}`,
          '',
          `Página dentro de: ${where} (${parent.kind === 'row' ? 'fila' : parent.kind === 'card' ? 'tarjeta' : 'página'} ${parent.id}) · id ${sub.id}`,
          `Enlace: ${subLink(sub.id)}`,
          '',
          '---',
          '',
          blocksToMarkdown(parseDoc(sub.content)) || '(La página está vacía)',
        ].join('\n')
      )
    }
    throw new ToolError('No encontré una fila, tarjeta ni página con ese id (o no tenés acceso)')
  }

  async function crearDocumento(args: Record<string, unknown>): Promise<ToolResult> {
    const baseId = str(args.base_id)
    const columnaId = str(args.columna_id)
    const dentroDe = str(args.dentro_de)
    if ([baseId, columnaId, dentroDe].filter(Boolean).length !== 1) {
      throw new ToolError('Pasá uno solo: base_id (fila nueva), columna_id (tarjeta nueva) o dentro_de (página dentro de un documento)')
    }
    const titulo = str(args.titulo)?.trim().slice(0, 2000)
    if (!titulo) throw new ToolError('Falta el título')
    const markdown = readMarkdown(args.contenido_markdown)
    const content = markdown ? buildContent(null, markdown, false) : null
    const icon = cleanIcon(args.icono) ?? null

    if (dentroDe) {
      if (args.propiedades !== undefined) throw new ToolError('Las páginas internas no tienen propiedades')
      const ref = await kindOf(dentroDe)
      if (!ref) throw new ToolError('No encontré el documento de dentro_de (o no tenés acceso)')
      const doc = await findAccessibleDoc(userId, ref)
      if (!doc) throw new ToolError('No encontré el documento de dentro_de (o no tenés acceso)')
      await saveVersionBeforeChange(doc.pageId, userId)
      const sub = await createSubPage(userId, doc.pageId, ref, { title: titulo, icon, content })
      const parentBlocks = [...parseDoc(doc.content), subPageBlock(sub)]
      await writeContent(ref, serializeDoc(ensureIds(parentBlocks)))
      return json({ creado: 'página interna', id: sub.id, dentro_de: doc.title || 'Sin título', enlace: subLink(sub.id) })
    }

    if (baseId) {
      const dbRec = await db.database.findFirst({ where: { id: baseId, page: accessiblePageWhere(userId) }, select: { id: true, pageId: true, title: true, properties: true } })
      if (!dbRec) throw new ToolError('No encontré esa base de datos (o no tenés acceso)')
      const properties = (Array.isArray(dbRec.properties) ? dbRec.properties : []) as unknown as PropertyDef[]
      const { values, warnings } = valuesFromInput(properties, args.propiedades)
      const clean = sanitizeValues(Object.fromEntries(Object.entries(values).filter(([, v]) => v !== null))) ?? {}
      await saveVersionBeforeChange(dbRec.pageId, userId)
      const last = await db.dbRow.aggregate({ where: { databaseId: baseId }, _max: { position: true } })
      const row = await db.dbRow.create({
        data: {
          databaseId: baseId,
          title: titulo,
          icon,
          values: clean as Prisma.InputJsonValue,
          content,
          position: (last._max.position ?? -1) + 1,
          createdById: userId,
        },
        select: { id: true },
      })
      return json({ creado: 'fila', id: row.id, base: dbRec.title, enlace: rowLink(row.id), avisos: warnings.length ? warnings : undefined })
    }

    const column = await db.column.findFirst({ where: { id: columnaId, page: accessiblePageWhere(userId) }, select: { id: true, pageId: true, title: true } })
    if (!column) throw new ToolError('No encontré esa columna (o no tenés acceso)')
    if (args.propiedades !== undefined) throw new ToolError('Las tarjetas de tablero no tienen propiedades; sacá "propiedades" o usá una base de datos')
    await saveVersionBeforeChange(column.pageId, userId)
    const last = await db.card.aggregate({ where: { columnId: column.id }, _max: { position: true } })
    const card = await db.card.create({
      data: { columnId: column.id, title: titulo, icon, description: content, position: (last._max.position ?? -1) + 1 },
      select: { id: true },
    })
    return json({ creado: 'tarjeta', id: card.id, columna: column.title, enlace: cardLink(card.id) })
  }

  async function actualizarDocumento(args: Record<string, unknown>): Promise<ToolResult> {
    const id = str(args.id)
    if (!id) throw new ToolError('Falta el id')
    const markdown = readMarkdown(args.contenido_markdown)
    const modo = args.modo === undefined ? 'reemplazar' : args.modo
    if (modo !== 'reemplazar' && modo !== 'agregar_al_final') throw new ToolError('modo tiene que ser "reemplazar" o "agregar_al_final"')
    const append = modo === 'agregar_al_final'
    const titulo = str(args.titulo)?.trim().slice(0, 2000)
    const icon = cleanIcon(args.icono)
    if (markdown === undefined && !titulo && icon === undefined && args.propiedades === undefined) {
      throw new ToolError('No hay nada para cambiar: pasá titulo, icono, propiedades o contenido_markdown')
    }

    const row = await findRow(userId, id)
    if (row) {
      const data: Prisma.DbRowUpdateInput = {}
      if (titulo) data.title = titulo
      if (icon !== undefined) data.icon = icon
      const warnings: string[] = []
      if (markdown !== undefined) data.content = buildContent(row.content, markdown, append, warnings)
      let patch: Record<string, RowValue> | null = null
      if (args.propiedades !== undefined) {
        const dbRec = await db.database.findUnique({ where: { id: row.databaseId }, select: { properties: true } })
        const properties = (Array.isArray(dbRec?.properties) ? dbRec!.properties : []) as unknown as PropertyDef[]
        const res = valuesFromInput(properties, args.propiedades)
        warnings.push(...res.warnings)
        patch = res.values
      }
      await saveVersionBeforeChange(row.database.pageId, userId)
      await db.$transaction(async (tx) => {
        if (patch && Object.keys(patch).length) {
          const current = await tx.dbRow.findUnique({ where: { id }, select: { values: true } })
          const merged: Record<string, unknown> = {
            ...(current?.values && typeof current.values === 'object' && !Array.isArray(current.values) ? (current.values as Record<string, unknown>) : {}),
          }
          for (const [k, v] of Object.entries(patch)) {
            if (v === null) delete merged[k]
            else merged[k] = v
          }
          data.values = (sanitizeValues(merged) ?? {}) as Prisma.InputJsonValue
        }
        await tx.dbRow.update({ where: { id }, data })
      })
      return json({ actualizado: 'fila', id, enlace: rowLink(id), avisos: warnings.length ? warnings : undefined })
    }

    const card = await findCard(userId, id)
    if (card) {
      if (args.propiedades !== undefined) throw new ToolError('Las tarjetas de tablero no tienen propiedades')
      const data: Prisma.CardUpdateInput = {}
      if (titulo) data.title = titulo
      if (icon !== undefined) data.icon = icon
      const warnings: string[] = []
      if (markdown !== undefined) data.description = buildContent(card.description, markdown, append, warnings)
      await saveVersionBeforeChange(card.column.pageId, userId)
      await db.card.update({ where: { id }, data })
      return json({ actualizado: 'tarjeta', id, enlace: cardLink(id), avisos: warnings.length ? warnings : undefined })
    }

    const sub = await findAccessibleSubPage(userId, id)
    if (sub) {
      if (args.propiedades !== undefined) throw new ToolError('Las páginas internas no tienen propiedades')
      const data: Prisma.SubPageUpdateInput = {}
      const warnings: string[] = []
      if (titulo) data.title = titulo
      if (icon !== undefined) data.icon = icon
      if (markdown !== undefined) data.content = buildContent(sub.content, markdown, append, warnings)
      await saveVersionBeforeChange(sub.pageId, userId)
      await db.subPage.update({ where: { id }, data })
      if (titulo || icon !== undefined) await syncLinkBlock(sub, { ...(titulo ? { title: titulo } : {}), ...(icon !== undefined ? { icon } : {}) })
      return json({ actualizado: 'página interna', id, enlace: subLink(id), avisos: warnings.length ? warnings : undefined })
    }
    throw new ToolError('No encontré una fila, tarjeta ni página con ese id (o no tenés acceso)')
  }

  /** Loads a document for a targeted edit; saves a version first. */
  async function docForEdit(id: string | undefined) {
    if (!id) throw new ToolError('Falta el id')
    const ref = await kindOf(id)
    const doc = ref ? await findAccessibleDoc(userId, ref) : null
    if (!ref || !doc) throw new ToolError('No encontré una fila, tarjeta ni página con ese id (o no tenés acceso)')
    return { ref, doc, blocks: parseDoc(doc.content) }
  }

  async function saveEdited(ref: DocRef, pageId: string, blocks: DocBlock[]) {
    const stored = serializeDoc(ensureIds(blocks))
    if (stored && stored.length > MAX_STORED) throw new ToolError('El documento quedaría demasiado grande')
    await saveVersionBeforeChange(pageId, userId)
    await writeContent(ref, stored)
  }

  async function editarBloques(args: Record<string, unknown>): Promise<ToolResult> {
    const { ref, doc, blocks } = await docForEdit(str(args.id))
    const accion = str(args.accion) as BlockAction | undefined
    if (!accion || !['reemplazar', 'insertar_despues', 'insertar_antes', 'eliminar'].includes(accion)) {
      throw new ToolError('accion tiene que ser reemplazar, insertar_despues, insertar_antes o eliminar')
    }
    const markdown = readMarkdown(args.markdown)
    const fresh = markdown ? ensureIds(markdownToBlocks(markdown)) : []
    const occurrence = typeof args.ocurrencia === 'number' && args.ocurrencia >= 1 ? Math.trunc(args.ocurrencia) : undefined
    let result
    try {
      result = editBlocks(blocks, { action: accion, find: str(args.buscar) ?? '', until: str(args.hasta), blocks: fresh, occurrence })
    } catch (err) {
      if (err instanceof EditError) throw new ToolError(err.message)
      throw err
    }
    await saveEdited(ref, doc.pageId, result.blocks)
    return json({
      editado: doc.title || 'Sin título',
      bloques_quitados: result.removed,
      bloques_nuevos: result.inserted,
      avisos: result.keptPages ? [`Se mantuvieron ${result.keptPages} enlace(s) a páginas internas que estaban en esa parte`] : undefined,
      enlace: linkOf(ref),
    })
  }

  async function reemplazarTexto(args: Record<string, unknown>): Promise<ToolResult> {
    const { ref, doc, blocks } = await docForEdit(str(args.id))
    const buscarTxt = str(args.buscar)
    const reemplazo = typeof args.reemplazo === 'string' ? args.reemplazo : undefined
    if (!buscarTxt || reemplazo === undefined) throw new ToolError('Faltan buscar y reemplazo')
    let result
    try {
      result = replaceText(blocks, buscarTxt, reemplazo, args.todas === true)
    } catch (err) {
      if (err instanceof EditError) throw new ToolError(err.message)
      throw err
    }
    await saveEdited(ref, doc.pageId, result.blocks)
    return json({ editado: doc.title || 'Sin título', reemplazos: result.count, enlace: linkOf(ref) })
  }

  /** Moves a run of top-level blocks into a new page inside the same document. */
  async function convertirEnSubpagina(args: Record<string, unknown>): Promise<ToolResult> {
    const id = str(args.id)
    const desde = str(args.desde_texto)?.trim()
    const hasta = str(args.hasta_texto)?.trim()
    if (!id || !desde) throw new ToolError('Faltan id y desde_texto')
    const ref = await kindOf(id)
    const doc = ref ? await findAccessibleDoc(userId, ref) : null
    if (!ref || !doc) throw new ToolError('No encontré una fila, tarjeta ni página con ese id (o no tenés acceso)')

    const blocks = parseDoc(doc.content)
    const textOf = (b: DocBlock) => norm2(b.type === SUBPAGE_BLOCK ? String(b.props?.title ?? '') : blockText(b))
    const start = blocks.findIndex((b) => textOf(b).startsWith(norm2(desde)))
    if (start < 0) {
      const heads = blocks.filter((b) => b.type === 'heading').map((b) => blockText(b)).filter(Boolean)
      throw new ToolError(`No encontré un bloque que empiece con "${desde}".${heads.length ? ` Títulos del documento: ${heads.join(' · ')}` : ''}`)
    }
    let end = blocks.length
    if (hasta) {
      const rel = blocks.slice(start + 1).findIndex((b) => textOf(b).startsWith(norm2(hasta)))
      if (rel < 0) throw new ToolError(`No encontré, después del comienzo, un bloque que empiece con "${hasta}"`)
      end = start + 1 + rel
    }
    let moved = blocks.slice(start, end)
    let titulo = str(args.titulo)?.trim().slice(0, 2000)
    if (moved[0]?.type === 'heading' && (!titulo || norm2(titulo) === textOf(moved[0]))) {
      titulo = titulo || blockText(moved[0])
      moved = moved.slice(1) // the heading becomes the page's title
    }
    if (!titulo) titulo = blockText(moved[0]) || 'Sin título'
    const icon = cleanIcon(args.icono) ?? null

    await saveVersionBeforeChange(doc.pageId, userId)
    const sub = await createSubPage(userId, doc.pageId, ref, { title: titulo, icon, content: serializeDoc(ensureIds(moved)) })
    const next = [...blocks.slice(0, start), subPageBlock(sub), ...blocks.slice(end)]
    await writeContent(ref, serializeDoc(ensureIds(next)))
    return json({
      creado: 'página interna',
      id: sub.id,
      titulo,
      bloques_movidos: moved.length,
      dentro_de: doc.title || 'Sin título',
      enlace: subLink(sub.id),
      documento: linkOf(ref),
    })
  }

  const structure = makeStructureRunner(userId)

  return async function run(name: string, args: Record<string, unknown>): Promise<ToolResult> {
    switch (name) {
      case 'listar_paginas':
        return listarPaginas()
      case 'listar_entradas':
        return listarEntradas(args)
      case 'buscar':
        return buscar(args)
      case 'leer_documento':
        return leerDocumento(args)
      case 'crear_documento':
        return crearDocumento(args)
      case 'actualizar_documento':
        return actualizarDocumento(args)
      case 'convertir_en_subpagina':
        return convertirEnSubpagina(args)
      case 'editar_bloques':
        return editarBloques(args)
      case 'reemplazar_texto':
        return reemplazarTexto(args)
      default:
        if (STRUCTURE_TOOL_NAMES.has(name)) return structure(name, args)
        throw new ToolError(`Herramienta desconocida: ${name}`)
    }
  }
}
