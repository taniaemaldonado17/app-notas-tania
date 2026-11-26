/**
 * Connector tools that change the structure of a "bases de datos" page:
 * new databases and properties, views, and the dashboard (sections, quick
 * actions, indicators). Every change saves a version of the page first.
 */
import type { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { accessiblePageWhere } from '@/lib/auth-helpers'
import { databaseInclude, serializeDatabase, validLayout, validProperties, validViews } from '@/lib/db-server'
import { makeView, newId, type DatabaseDef, type OptionColor, type PageLayout, type QuickAction, type StatItem } from '@/lib/db-types'
import { saveVersionBeforeChange } from '@/lib/versions'
import { serializeDoc } from '@/lib/blocks'
import { markdownToBlocks } from '@/lib/md-blocks'
import { text, ToolError, type ToolDef, type ToolResult } from '@/lib/mcp/protocol'
import {
  actionValues,
  addToGroup,
  buildFilter,
  buildProperty,
  buildView,
  colorOf,
  describeStructure,
  findProperty,
  findView,
  insertSection,
  StructureError,
  titleProperty,
  type FilterSpec,
  type Person,
  type PropertySpec,
  type ViewSpec,
} from '@/lib/mcp/structure'

const json = (v: unknown) => text(JSON.stringify(v, null, 2))
const str = (v: unknown) => (typeof v === 'string' ? v : undefined)

const propertySchema = {
  type: 'object',
  properties: {
    nombre: { type: 'string' },
    tipo: {
      type: 'string',
      description: 'texto, numero, seleccion, estado, seleccion_multiple, fecha, persona, casilla, url, email, telefono, relacion, formula, fecha_de_creacion, ultima_edicion',
    },
    opciones: { type: 'array', items: { type: 'string' }, description: 'Para selección, estado y selección múltiple' },
    relacion_con: { type: 'string', description: 'Para relaciones: id o nombre de otra base de la misma página' },
    inversa: { type: 'string', description: 'Para relaciones: nombre de la propiedad que las lista en la otra base (por defecto, el nombre de esta base)' },
    formato: { type: 'string', description: 'Números y fórmulas: numero, porcentaje, pesos, dolares, euros' },
    formula: { type: 'string', description: 'Para fórmulas, por ejemplo prop("Valor") - prop("Facturado")' },
  },
  required: ['nombre', 'tipo'],
}

const filterSchema = {
  type: 'object',
  properties: {
    propiedad: { type: 'string' },
    op: {
      type: 'string',
      description:
        'es, no_es, contiene, no_contiene, vacio, no_vacio, =, !=, >, <, >=, <=, antes, despues, hasta (en o antes), desde (en o después), marcada, sin_marcar',
    },
    valor: { description: 'Opción por nombre, persona por nombre, fila por título, número, o fecha: AAAA-MM-DD, "hoy", "hoy+7", "hoy-7"' },
  },
  required: ['propiedad', 'op'],
}

export const STRUCTURE_TOOLS: ToolDef[] = [
  {
    name: 'ver_estructura',
    title: 'Ver estructura de una página',
    description:
      'Muestra cómo está armada una página de tipo "bases de datos": sus bases con propiedades (y opciones), sus vistas con filtros, y las secciones de la pantalla principal (vistas, acciones rápidas, indicadores). Usalo antes de crear bases, vistas o secciones.',
    inputSchema: { type: 'object', properties: { pagina_id: { type: 'string' } }, required: ['pagina_id'], additionalProperties: false },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  {
    name: 'crear_base',
    title: 'Crear base de datos',
    description:
      'Crea una base de datos nueva en una página de tipo "bases de datos", con sus propiedades (incluidas relaciones con otras bases de la página, que agregan la lista inversa en la otra base) y una vista de tabla "Todas".',
    inputSchema: {
      type: 'object',
      properties: {
        pagina_id: { type: 'string' },
        titulo: { type: 'string' },
        icono: { type: 'string' },
        nombre_titulo: { type: 'string', description: 'Nombre de la columna de título (por defecto "Nombre")' },
        propiedades: { type: 'array', items: propertySchema },
      },
      required: ['pagina_id', 'titulo'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  },
  {
    name: 'agregar_propiedad',
    title: 'Agregar propiedad',
    description: 'Agrega una propiedad (columna) a una base de datos existente.',
    inputSchema: {
      type: 'object',
      properties: { base_id: { type: 'string' }, ...propertySchema.properties },
      required: ['base_id', 'nombre', 'tipo'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  },
  {
    name: 'crear_vista',
    title: 'Crear vista',
    description:
      'Crea una vista en una base de datos: tabla, tablero (agrupado por una propiedad), galería, calendario, cronograma o lista, con filtros (todos se cumplen a la vez), orden y propiedades visibles. Las fechas de los filtros pueden ser relativas: "hoy", "hoy+7", "hoy-7".',
    inputSchema: {
      type: 'object',
      properties: {
        base_id: { type: 'string' },
        nombre: { type: 'string' },
        tipo: { type: 'string', enum: ['tabla', 'tablero', 'galeria', 'calendario', 'cronograma', 'lista'] },
        icono: { type: 'string' },
        filtros: { type: 'array', items: filterSchema },
        orden: {
          type: 'array',
          items: { type: 'object', properties: { propiedad: { type: 'string' }, direccion: { type: 'string', enum: ['asc', 'desc'] } }, required: ['propiedad'] },
        },
        agrupar_por: { type: 'string', description: 'Tablero: selección, estado, selección múltiple, persona o casilla' },
        fecha: { type: 'string', description: 'Calendario y cronograma: propiedad de fecha' },
        fecha_fin: { type: 'string', description: 'Cronograma: fecha de fin (opcional)' },
        propiedades_visibles: { type: 'array', items: { type: 'string' } },
      },
      required: ['base_id', 'nombre', 'tipo'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  },
  {
    name: 'agregar_al_tablero',
    title: 'Agregar a la pantalla principal',
    description:
      'Agrega algo a la pantalla principal de una página de bases de datos. tipo "vista": muestra una vista de una base (base_id + vista) con un título. tipo "titulo": un título de sección (texto). tipo "accion": un botón que crea una fila (etiqueta, base_id, valores por nombre de propiedad, y opcionalmente plantilla_markdown con el contenido inicial de la página de la fila; las fechas pueden ser "hoy"). tipo "indicador": un número destacado (etiqueta, base_id, calculo contar o sumar, propiedad para sumar, filtros, icono, color). posicion: "inicio", "final" (por defecto), "despues_de:<título de sección>" o "antes_de:<título>".',
    inputSchema: {
      type: 'object',
      properties: {
        pagina_id: { type: 'string' },
        tipo: { type: 'string', enum: ['vista', 'titulo', 'accion', 'indicador'] },
        posicion: { type: 'string' },
        base_id: { type: 'string' },
        vista: { type: 'string', description: 'Id o nombre de la vista' },
        titulo: { type: 'string' },
        icono: { type: 'string' },
        texto: { type: 'string' },
        etiqueta: { type: 'string' },
        valores: { type: 'object', additionalProperties: true },
        plantilla_markdown: { type: 'string' },
        calculo: { type: 'string', enum: ['contar', 'sumar'] },
        propiedad: { type: 'string' },
        filtros: { type: 'array', items: filterSchema },
        color: { type: 'string', description: 'gris, marron, naranja, amarillo, verde, azul, violeta, rosa, rojo' },
      },
      required: ['pagina_id', 'tipo'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  },
]

export const STRUCTURE_TOOL_NAMES = new Set(STRUCTURE_TOOLS.map((t) => t.name))

export function makeStructureRunner(userId: string) {
  /** A "bases de datos" page the user can open, with its databases, dashboard and people. */
  async function loadPage(pageId: string | undefined) {
    if (!pageId) throw new ToolError('Falta pagina_id (sale de listar_paginas)')
    const page = await db.page.findFirst({
      where: { id: pageId, ...accessiblePageWhere(userId) },
      select: {
        id: true,
        title: true,
        kind: true,
        layout: true,
        user: { select: { id: true, name: true, email: true } },
        members: { select: { user: { select: { id: true, name: true, email: true } } } },
      },
    })
    if (!page) throw new ToolError('No encontré esa página (o no tenés acceso)')
    if (page.kind !== 'databases') throw new ToolError(`"${page.title}" es un tablero de tarjetas, no una página de bases de datos`)
    const list = await db.database.findMany({ where: { pageId }, orderBy: [{ position: 'asc' }, { createdAt: 'asc' }], include: databaseInclude })
    const databases = list.map(serializeDatabase)
    const people: Person[] = [page.user, ...page.members.map((m) => m.user)].map((u) => ({ id: u.id, name: u.name || u.email }))
    const raw = page.layout as unknown as PageLayout | null
    const layout: PageLayout = raw && Array.isArray(raw.sections) ? raw : { sections: [], showSources: true }
    return { page, databases, people, layout }
  }

  async function pageOfDatabase(databaseId: string | undefined) {
    if (!databaseId) throw new ToolError('Falta base_id')
    const found = await db.database.findFirst({ where: { id: databaseId, page: accessiblePageWhere(userId) }, select: { pageId: true } })
    if (!found) throw new ToolError('No encontré esa base de datos (o no tenés acceso)')
    const loaded = await loadPage(found.pageId)
    return { ...loaded, database: loaded.databases.find((d) => d.id === databaseId)! }
  }

  async function saveSchema(d: Pick<DatabaseDef, 'id' | 'properties' | 'views'>) {
    if (!validProperties(d.properties) || !validViews(d.views)) throw new ToolError('La base quedaría demasiado grande')
    await db.database.update({
      where: { id: d.id },
      data: { properties: d.properties as unknown as Prisma.InputJsonValue, views: d.views as unknown as Prisma.InputJsonValue },
    })
  }

  async function saveLayout(pageId: string, layout: PageLayout) {
    if (!validLayout(layout)) throw new ToolError('La pantalla principal quedaría demasiado grande')
    await db.page.update({ where: { id: pageId }, data: { layout: layout as unknown as Prisma.InputJsonValue } })
  }

  async function verEstructura(args: Record<string, unknown>): Promise<ToolResult> {
    const { page, databases, people, layout } = await loadPage(str(args.pagina_id))
    return json({ pagina: page.title, ...describeStructure(databases, layout, people) })
  }

  async function crearBase(args: Record<string, unknown>): Promise<ToolResult> {
    const { page, databases } = await loadPage(str(args.pagina_id))
    const title = str(args.titulo)?.trim().slice(0, 200)
    if (!title) throw new ToolError('Falta el título de la base')
    if (databases.some((d) => d.title.trim().toLowerCase() === title.toLowerCase())) throw new ToolError(`Ya hay una base "${title}" en esta página`)
    const draft: DatabaseDef = { id: newId('db'), pageId: page.id, title, icon: str(args.icono)?.slice(0, 16) || '🗃️', position: 0, properties: [titleProperty(str(args.nombre_titulo))], views: [], rows: [] }
    const backlinks: { databaseId: string; property: DatabaseDef['properties'][number] }[] = []
    const specs = Array.isArray(args.propiedades) ? (args.propiedades as PropertySpec[]) : []
    for (const spec of specs) {
      const built = buildProperty(draft, spec, [...databases, draft])
      draft.properties.push(built.property)
      if (built.backlink) backlinks.push(built.backlink)
    }
    draft.views = [makeView('table', draft, 'Todas')]

    await saveVersionBeforeChange(page.id, userId)
    const last = await db.database.aggregate({ where: { pageId: page.id }, _max: { position: true } })
    await db.database.create({
      data: {
        id: draft.id,
        pageId: page.id,
        title: draft.title,
        icon: draft.icon,
        position: (last._max.position ?? -1) + 1,
        properties: draft.properties as unknown as Prisma.InputJsonValue,
        views: draft.views as unknown as Prisma.InputJsonValue,
      },
    })
    for (const b of backlinks) {
      const target = databases.find((d) => d.id === b.databaseId)!
      await saveSchema({ id: target.id, properties: [...target.properties, b.property], views: target.views })
    }
    return json({
      creada: title,
      base_id: draft.id,
      propiedades: draft.properties.map((p) => p.name),
      en_otras_bases: backlinks.length ? backlinks.map((b) => `${databases.find((d) => d.id === b.databaseId)?.title} → ${b.property.name}`) : undefined,
      vistas: ['Todas'],
    })
  }

  async function agregarPropiedad(args: Record<string, unknown>): Promise<ToolResult> {
    const { page, databases, database } = await pageOfDatabase(str(args.base_id))
    const built = buildProperty(database, args as unknown as PropertySpec, databases)
    await saveVersionBeforeChange(page.id, userId)
    await saveSchema({ ...database, properties: [...database.properties, built.property] })
    if (built.backlink) {
      const target = databases.find((d) => d.id === built.backlink!.databaseId)!
      await saveSchema({ ...target, properties: [...target.properties, built.backlink.property] })
    }
    return json({ agregada: built.property.name, base: database.title, en_otra_base: built.backlink ? built.backlink.property.name : undefined })
  }

  async function crearVista(args: Record<string, unknown>): Promise<ToolResult> {
    const { page, databases, people, database } = await pageOfDatabase(str(args.base_id))
    const view = buildView(database, args as unknown as ViewSpec, databases, people)
    if (database.views.some((v) => v.name.trim().toLowerCase() === view.name.trim().toLowerCase())) {
      throw new ToolError(`"${database.title}" ya tiene una vista "${view.name}"`)
    }
    await saveVersionBeforeChange(page.id, userId)
    await saveSchema({ ...database, views: [...database.views, view] })
    return json({ creada: view.name, vista_id: view.id, base: database.title, ...describeStructure([{ ...database, views: [view] }], null, people).bases[0].vistas[0] })
  }

  async function agregarAlTablero(args: Record<string, unknown>): Promise<ToolResult> {
    const { page, databases, people, layout } = await loadPage(str(args.pagina_id))
    const tipo = str(args.tipo)
    const baseOf = () => {
      const id = str(args.base_id)
      const d = databases.find((x) => x.id === id) ?? databases.find((x) => x.title.trim().toLowerCase() === id?.trim().toLowerCase())
      if (!d) throw new ToolError(`Falta base_id o no es de esta página. Bases: ${databases.map((x) => `${x.title} (${x.id})`).join(', ')}`)
      return d
    }
    let next: PageLayout
    let added: string
    switch (tipo) {
      case 'vista': {
        const d = baseOf()
        const view = findView(d, str(args.vista) ?? '')
        const title = str(args.titulo)?.trim() || view.name
        next = insertSection(layout, { id: newId('sec'), type: 'view', title, icon: str(args.icono) || view.icon, databaseId: d.id, viewId: view.id }, str(args.posicion))
        added = `vista "${title}"`
        break
      }
      case 'titulo': {
        const t = str(args.texto)?.trim() || str(args.titulo)?.trim()
        if (!t) throw new ToolError('Falta el texto del título')
        next = insertSection(layout, { id: newId('sec'), type: 'heading', text: t.slice(0, 200) }, str(args.posicion))
        added = `título "${t}"`
        break
      }
      case 'accion': {
        const d = baseOf()
        const label = str(args.etiqueta)?.trim() || str(args.titulo)?.trim()
        if (!label) throw new ToolError('Falta la etiqueta del botón')
        const tpl = str(args.plantilla_markdown)
        const action: QuickAction = {
          id: newId('qa'),
          label: label.slice(0, 100),
          databaseId: d.id,
          values: actionValues(d, args.valores as Record<string, unknown> | undefined, people, databases),
          ...(tpl ? { content: serializeDoc(markdownToBlocks(tpl)) } : {}),
        }
        next = addToGroup(layout, 'actions', action)
        added = `botón "${label}"${tpl ? ' con plantilla' : ''}`
        break
      }
      case 'indicador': {
        const d = baseOf()
        const label = str(args.etiqueta)?.trim() || str(args.titulo)?.trim()
        if (!label) throw new ToolError('Falta la etiqueta del indicador')
        const sum = str(args.calculo) === 'sumar'
        const prop = sum ? findProperty(d, str(args.propiedad) ?? '') : undefined
        if (sum && prop && prop.type !== 'number' && prop.type !== 'formula') throw new ToolError(`Solo se pueden sumar números o fórmulas ("${prop.name}" es ${prop.type})`)
        const stat: StatItem = {
          id: newId('stat'),
          label: label.slice(0, 100),
          icon: str(args.icono)?.slice(0, 16),
          color: colorOf(args.color, layout.sections.flatMap((s) => (s.type === 'stats' ? s.items : [])).length) as OptionColor,
          databaseId: d.id,
          aggregate: sum ? 'sum' : 'count',
          ...(prop ? { propertyId: prop.id } : {}),
          filters: (Array.isArray(args.filtros) ? (args.filtros as FilterSpec[]) : []).map((f) => buildFilter(d, f, databases, people)),
        }
        next = addToGroup(layout, 'stats', stat)
        added = `indicador "${label}"`
        break
      }
      default:
        throw new ToolError('tipo tiene que ser vista, titulo, accion o indicador')
    }
    await saveVersionBeforeChange(page.id, userId)
    await saveLayout(page.id, next)
    return json({ agregado: added, pagina: page.title, tablero: describeStructure(databases, next, people).tablero })
  }

  return async function run(name: string, args: Record<string, unknown>): Promise<ToolResult> {
    try {
      switch (name) {
        case 'ver_estructura':
          return await verEstructura(args)
        case 'crear_base':
          return await crearBase(args)
        case 'agregar_propiedad':
          return await agregarPropiedad(args)
        case 'crear_vista':
          return await crearVista(args)
        case 'agregar_al_tablero':
          return await agregarAlTablero(args)
        default:
          throw new ToolError(`Herramienta desconocida: ${name}`)
      }
    } catch (err) {
      if (err instanceof StructureError) throw new ToolError(err.message)
      throw err
    }
  }
}
