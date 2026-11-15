/**
 * "Seguimiento de proyectos de arquitectura": two linked databases
 * (Proyectos + Elementos), their views, a dashboard layout and a few
 * example rows. Modelled on Notion's "Architectural Project Tracker".
 */
import {
  newId,
  TITLE_PROPERTY_ID,
  type DatabaseDef,
  type OptionColor,
  type PageLayout,
  type PropertyDef,
  type RowValue,
  type SelectOption,
  type ViewDef,
} from '@/lib/db-types'

export type TemplateDatabase = Omit<DatabaseDef, 'pageId' | 'rows'> & {
  rows: { id: string; title: string; icon: string | null; values: Record<string, RowValue>; position: number; content?: string | null }[]
}

export type BuiltTemplate = {
  title: string
  icon: string
  subtitle: string
  databases: TemplateDatabase[]
  layout: PageLayout
}

const opt = (name: string, color: OptionColor): SelectOption => ({ id: newId('opt'), name, color })

/** 'YYYY-MM-DD' offset from today, so the examples always look current. */
function day(offset: number): string {
  const d = new Date()
  d.setDate(d.getDate() + offset)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function buildArquitecturaTemplate(withExamples = true): BuiltTemplate {
  const proyectosId = newId('db')
  const elementosId = newId('db')

  /* ------------------------------ Shared options ------------------------------ */
  const etapa = {
    relevamiento: opt('🔍 Relevamiento', 'gray'),
    anteproyecto: opt('💡 Anteproyecto', 'purple'),
    ejecutivo: opt('✏️ Proyecto ejecutivo', 'orange'),
    aprobacion: opt('📬 Aprobación municipal', 'blue'),
    licitacion: opt('📋 Licitación', 'yellow'),
    obra: opt('🏗️ Obra', 'red'),
    finalizado: opt('✅ Finalizado', 'green'),
  }
  const etapaOptions = Object.values(etapa)
  // Same stages on Elementos, with their own option ids.
  const etapaEl = Object.fromEntries(
    Object.entries(etapa).map(([k, o]) => [k, { ...o, id: newId('opt') }])
  ) as typeof etapa

  /* -------------------------------- Proyectos -------------------------------- */
  const P = {
    numero: newId('prop'),
    etapa: newId('prop'),
    estado: newId('prop'),
    prioridad: newId('prop'),
    tipo: newId('prop'),
    cliente: newId('prop'),
    email: newId('prop'),
    telefono: newId('prop'),
    direccion: newId('prop'),
    consultores: newId('prop'),
    responsable: newId('prop'),
    inicio: newId('prop'),
    entrega: newId('prop'),
    finReal: newId('prop'),
    avance: newId('prop'),
    contrato: newId('prop'),
    facturado: newId('prop'),
    pendiente: newId('prop'),
    cobrado: newId('prop'),
    portada: newId('prop'),
    notas: newId('prop'),
    elementos: newId('prop'),
  }
  const estado = {
    activo: opt('🟢 Activo', 'green'),
    pausa: opt('⏸️ En pausa', 'yellow'),
    terminado: opt('✅ Terminado', 'blue'),
    cancelado: opt('❌ Cancelado', 'gray'),
  }
  const prioridad = { alta: opt('🔴 Alta', 'red'), media: opt('🟠 Media', 'orange'), baja: opt('🟢 Baja', 'green') }
  const tipo = {
    vivienda: opt('Vivienda', 'blue'),
    comercial: opt('Comercial', 'orange'),
    interiorismo: opt('Interiorismo', 'purple'),
    institucional: opt('Institucional', 'green'),
    industrial: opt('Industrial', 'gray'),
    urbano: opt('Urbano', 'brown'),
  }
  const consultores = {
    estructural: opt('Ing. estructural', 'brown'),
    civil: opt('Ing. civil', 'gray'),
    instalaciones: opt('Instalaciones', 'green'),
    computo: opt('Cómputo y presupuesto', 'yellow'),
    paisajismo: opt('Paisajismo', 'pink'),
  }

  /* -------------------------------- Elementos -------------------------------- */
  const E = {
    tipo: newId('prop'),
    proyecto: newId('prop'),
    estado: newId('prop'),
    prioridad: newId('prop'),
    responsable: newId('prop'),
    fecha: newId('prop'),
    etapa: newId('prop'),
    plano: newId('prop'),
    revision: newId('prop'),
    archivo: newId('prop'),
    notas: newId('prop'),
  }
  const tipoEl = {
    tarea: opt('✅ Tarea', 'blue'),
    plano: opt('📐 Plano', 'purple'),
    documento: opt('📄 Documento', 'gray'),
    reunion: opt('🤝 Reunión', 'yellow'),
    tramite: opt('📬 Trámite', 'orange'),
  }
  const estadoEl = {
    pendiente: opt('🔲 Pendiente', 'gray'),
    curso: opt('🔄 En curso', 'blue'),
    revision: opt('👁️ En revisión', 'yellow'),
    emitido: opt('📤 Emitido', 'purple'),
    aprobado: opt('✅ Aprobado', 'green'),
  }
  const prioridadEl = { urgente: opt('🔴 Urgente', 'red'), normal: opt('🟠 Normal', 'orange'), baja: opt('🟢 Baja', 'green') }

  const proyectosProps: PropertyDef[] = [
    { id: TITLE_PROPERTY_ID, name: 'Nombre del proyecto', type: 'title' },
    { id: P.numero, name: 'N° de proyecto', type: 'text' },
    { id: P.etapa, name: 'Etapa', type: 'status', options: etapaOptions },
    { id: P.estado, name: 'Estado', type: 'select', options: Object.values(estado) },
    { id: P.prioridad, name: 'Prioridad', type: 'select', options: Object.values(prioridad) },
    { id: P.tipo, name: 'Tipo de proyecto', type: 'select', options: Object.values(tipo) },
    { id: P.avance, name: 'Avance de etapa', type: 'number', numberFormat: 'percent', showAs: 'bar' },
    { id: P.cliente, name: 'Cliente', type: 'text' },
    { id: P.email, name: 'Email del cliente', type: 'email' },
    { id: P.telefono, name: 'Teléfono del cliente', type: 'phone' },
    { id: P.direccion, name: 'Dirección de la obra', type: 'text' },
    { id: P.consultores, name: 'Consultores', type: 'multi_select', options: Object.values(consultores) },
    { id: P.responsable, name: 'Responsable', type: 'person' },
    { id: P.inicio, name: 'Fecha de inicio', type: 'date' },
    { id: P.entrega, name: 'Entrega prevista', type: 'date' },
    { id: P.finReal, name: 'Finalización real', type: 'date' },
    { id: P.contrato, name: 'Valor del contrato', type: 'number', numberFormat: 'ars' },
    { id: P.facturado, name: 'Honorarios facturados', type: 'number', numberFormat: 'ars' },
    {
      id: P.pendiente,
      name: 'Honorarios pendientes',
      type: 'formula',
      numberFormat: 'ars',
      formula: 'prop("Valor del contrato") - prop("Honorarios facturados")',
    },
    {
      id: P.cobrado,
      name: '% cobrado',
      type: 'formula',
      numberFormat: 'percent',
      showAs: 'bar',
      formula: 'if(prop("Valor del contrato") > 0, prop("Honorarios facturados") / prop("Valor del contrato"), 0)',
    },
    { id: P.portada, name: 'Imagen de portada', type: 'url' },
    { id: P.notas, name: 'Notas', type: 'text' },
    {
      id: P.elementos,
      name: 'Tareas y entregables',
      type: 'backlink',
      backlinkDatabaseId: elementosId,
      backlinkPropertyId: E.proyecto,
    },
  ]

  const elementosProps: PropertyDef[] = [
    { id: TITLE_PROPERTY_ID, name: 'Nombre', type: 'title' },
    { id: E.tipo, name: 'Tipo', type: 'select', options: Object.values(tipoEl) },
    { id: E.proyecto, name: 'Proyecto', type: 'relation', relationDatabaseId: proyectosId },
    { id: E.estado, name: 'Estado', type: 'status', options: Object.values(estadoEl) },
    { id: E.prioridad, name: 'Prioridad', type: 'select', options: Object.values(prioridadEl) },
    { id: E.responsable, name: 'Responsable', type: 'person' },
    { id: E.fecha, name: 'Fecha límite', type: 'date' },
    { id: E.etapa, name: 'Etapa', type: 'select', options: Object.values(etapaEl) },
    { id: E.plano, name: 'N° de plano', type: 'text' },
    { id: E.revision, name: 'Revisión', type: 'text' },
    { id: E.archivo, name: 'Archivo / enlace', type: 'url' },
    { id: E.notas, name: 'Notas', type: 'text' },
  ]

  /* ---------------------------------- Views ---------------------------------- */
  const pv = {
    todos: newId('view'),
    activos: newId('view'),
    etapas: newId('view'),
    galeria: newId('view'),
    honorarios: newId('view'),
    calendario: newId('view'),
  }
  const proyectosViews: ViewDef[] = [
    {
      id: pv.activos,
      name: 'Proyectos activos',
      type: 'table',
      icon: '🟢',
      filters: [{ id: newId('f'), propertyId: P.estado, op: 'is', value: estado.activo.id }],
      sorts: [{ propertyId: P.entrega, direction: 'asc' }],
      visibleProperties: [P.numero, P.etapa, P.avance, P.entrega, P.prioridad, P.cliente],
    },
    {
      id: pv.etapas,
      name: 'Por etapa',
      type: 'board',
      icon: '🟦',
      filters: [],
      sorts: [],
      groupBy: P.etapa,
      visibleProperties: [P.tipo, P.cliente, P.avance, P.prioridad],
    },
    {
      id: pv.galeria,
      name: 'Galería',
      type: 'gallery',
      icon: '🖼️',
      filters: [],
      sorts: [],
      coverProperty: P.portada,
      visibleProperties: [P.numero, P.etapa, P.cliente, P.avance, P.prioridad],
    },
    {
      id: pv.honorarios,
      name: 'Honorarios',
      type: 'table',
      icon: '💰',
      filters: [],
      sorts: [{ propertyId: P.pendiente, direction: 'desc' }],
      visibleProperties: [P.numero, P.cliente, P.contrato, P.facturado, P.pendiente, P.cobrado],
    },
    {
      id: pv.calendario,
      name: 'Entregas',
      type: 'calendar',
      icon: '📅',
      filters: [],
      sorts: [],
      dateProperty: P.entrega,
      visibleProperties: [P.etapa],
    },
    {
      id: pv.todos,
      name: 'Todos',
      type: 'table',
      icon: '📁',
      filters: [],
      sorts: [],
      visibleProperties: proyectosProps.filter((p) => p.type !== 'title').map((p) => p.id),
    },
  ]

  const ev = {
    vencimientos: newId('view'),
    planos: newId('view'),
    tareas: newId('view'),
    todos: newId('view'),
    lista: newId('view'),
  }
  const elementosViews: ViewDef[] = [
    {
      id: ev.vencimientos,
      name: 'Próximos vencimientos',
      type: 'calendar',
      icon: '📅',
      filters: [],
      sorts: [],
      dateProperty: E.fecha,
      visibleProperties: [E.tipo],
    },
    {
      id: ev.planos,
      name: 'Registro de planos',
      type: 'table',
      icon: '📐',
      filters: [{ id: newId('f'), propertyId: E.tipo, op: 'is', value: tipoEl.plano.id }],
      sorts: [{ propertyId: E.plano, direction: 'asc' }],
      visibleProperties: [E.plano, E.revision, E.proyecto, E.etapa, E.estado, E.responsable, E.archivo, E.fecha],
    },
    {
      id: ev.tareas,
      name: 'Tablero de tareas',
      type: 'board',
      icon: '✅',
      filters: [{ id: newId('f'), propertyId: E.tipo, op: 'is', value: tipoEl.tarea.id }],
      sorts: [{ propertyId: E.fecha, direction: 'asc' }],
      groupBy: E.estado,
      visibleProperties: [E.proyecto, E.fecha, E.responsable, E.prioridad],
    },
    {
      id: ev.lista,
      name: 'Pendientes por fecha',
      type: 'list',
      icon: '⏰',
      filters: [{ id: newId('f'), propertyId: E.estado, op: 'is_not', value: estadoEl.aprobado.id }],
      sorts: [{ propertyId: E.fecha, direction: 'asc' }],
      visibleProperties: [E.tipo, E.proyecto, E.fecha, E.estado],
    },
    {
      id: ev.todos,
      name: 'Todos',
      type: 'table',
      icon: '📋',
      filters: [],
      sorts: [{ propertyId: E.fecha, direction: 'asc' }],
      visibleProperties: elementosProps.filter((p) => p.type !== 'title').map((p) => p.id),
    },
  ]

  /* -------------------------------- Examples --------------------------------- */
  const r = { casa: newId('row'), centro: newId('row'), loft: newId('row') }
  const proyectosRows: TemplateDatabase['rows'] = withExamples
    ? [
        {
          id: r.casa,
          title: 'Casa Costanera Sur',
          icon: '🏡',
          position: 0,
          values: {
            [P.numero]: '2026-001',
            [P.etapa]: etapa.obra.id,
            [P.estado]: estado.activo.id,
            [P.prioridad]: prioridad.alta.id,
            [P.tipo]: tipo.vivienda.id,
            [P.avance]: 0.75,
            [P.cliente]: 'Familia Romero',
            [P.direccion]: 'Av. Costanera 1200, Corrientes',
            [P.consultores]: [consultores.civil.id, consultores.estructural.id],
            [P.inicio]: day(-300),
            [P.entrega]: day(120),
            [P.contrato]: 85_000_000,
            [P.facturado]: 63_750_000,
          },
        },
        {
          id: r.centro,
          title: 'Centro comercial Paseo Junín',
          icon: '🏬',
          position: 1,
          values: {
            [P.numero]: '2026-002',
            [P.etapa]: etapa.ejecutivo.id,
            [P.estado]: estado.activo.id,
            [P.prioridad]: prioridad.media.id,
            [P.tipo]: tipo.comercial.id,
            [P.avance]: 0.45,
            [P.cliente]: 'Desarrollos del Litoral S.A.',
            [P.direccion]: 'Junín 1500, Corrientes',
            [P.consultores]: [consultores.instalaciones.id, consultores.computo.id, consultores.estructural.id],
            [P.inicio]: day(-200),
            [P.entrega]: day(300),
            [P.contrato]: 210_000_000,
            [P.facturado]: 73_500_000,
          },
        },
        {
          id: r.loft,
          title: 'Reforma loft San Martín',
          icon: '🛋️',
          position: 2,
          values: {
            [P.numero]: '2025-008',
            [P.etapa]: etapa.licitacion.id,
            [P.estado]: estado.activo.id,
            [P.prioridad]: prioridad.baja.id,
            [P.tipo]: tipo.interiorismo.id,
            [P.avance]: 0.6,
            [P.cliente]: 'Lucía y Martín Gómez',
            [P.consultores]: [consultores.estructural.id],
            [P.inicio]: day(-420),
            [P.entrega]: day(45),
            [P.contrato]: 38_000_000,
            [P.facturado]: 22_800_000,
          },
        },
      ]
    : []

  const el = (
    title: string,
    t: SelectOption,
    proyecto: string | null,
    st: SelectOption,
    pr: SelectOption,
    fecha: number,
    et: SelectOption,
    extra: Record<string, RowValue> = {}
  ) => ({
    id: newId('row'),
    title,
    icon: null,
    position: 0,
    values: {
      [E.tipo]: t.id,
      [E.proyecto]: proyecto ? [proyecto] : [],
      [E.estado]: st.id,
      [E.prioridad]: pr.id,
      [E.fecha]: day(fecha),
      [E.etapa]: et.id,
      ...extra,
    } as Record<string, RowValue>,
  })

  const elementosRows: TemplateDatabase['rows'] = withExamples
    ? [
        el('Planta baja', tipoEl.plano, r.casa, estadoEl.emitido, prioridadEl.urgente, -10, etapaEl.obra, { [E.plano]: 'A-001', [E.revision]: 'C' }),
        el('Implantación general', tipoEl.plano, r.centro, estadoEl.curso, prioridadEl.normal, 20, etapaEl.ejecutivo, { [E.plano]: 'A-002', [E.revision]: 'A' }),
        el('Cortes estructurales', tipoEl.plano, r.casa, estadoEl.revision, prioridadEl.normal, 8, etapaEl.obra, { [E.plano]: 'E-001', [E.revision]: 'B' }),
        el('Preparar pliego para cómputo y presupuesto', tipoEl.tarea, r.loft, estadoEl.curso, prioridadEl.normal, 5, etapaEl.licitacion),
        el('Confirmar revestimiento con proveedor', tipoEl.tarea, r.casa, estadoEl.pendiente, prioridadEl.urgente, 3, etapaEl.obra),
        el('Reunión de revisión con el cliente', tipoEl.reunion, r.loft, estadoEl.pendiente, prioridadEl.baja, 12, etapaEl.licitacion, { [E.notas]: 'Definir terminaciones y cronograma de licitación.' }),
        el('Presentación de planos en la municipalidad', tipoEl.tramite, r.centro, estadoEl.revision, prioridadEl.urgente, 30, etapaEl.aprobacion, { [E.notas]: 'Esperando pedido de documentación adicional. Plazo de respuesta: 30 días.' }),
        el('Certificado de seguridad contra incendios', tipoEl.documento, r.casa, estadoEl.aprobado, prioridadEl.normal, -20, etapaEl.obra),
      ].map((row, i) => ({ ...row, position: i }))
    : []

  /* -------------------------------- Dashboard -------------------------------- */
  const layout: PageLayout = {
    showSources: true,
    sections: [
      {
        id: newId('sec'),
        type: 'actions',
        items: [
          { id: newId('qa'), label: 'Nuevo proyecto', databaseId: proyectosId, values: { [P.estado]: estado.activo.id } },
          { id: newId('qa'), label: 'Nueva tarea', databaseId: elementosId, values: { [E.tipo]: tipoEl.tarea.id, [E.estado]: estadoEl.pendiente.id } },
          { id: newId('qa'), label: 'Nuevo plano', databaseId: elementosId, values: { [E.tipo]: tipoEl.plano.id, [E.estado]: estadoEl.curso.id } },
        ],
      },
      {
        id: newId('sec'),
        type: 'stats',
        items: [
          {
            id: newId('stat'),
            label: 'Proyectos activos',
            icon: '📁',
            color: 'blue',
            databaseId: proyectosId,
            aggregate: 'count',
            filters: [{ id: newId('f'), propertyId: P.estado, op: 'is', value: estado.activo.id }],
          },
          {
            id: newId('stat'),
            label: 'En licitación',
            icon: '⏳',
            color: 'yellow',
            databaseId: proyectosId,
            aggregate: 'count',
            filters: [{ id: newId('f'), propertyId: P.etapa, op: 'is', value: etapa.licitacion.id }],
          },
          {
            id: newId('stat'),
            label: 'En obra',
            icon: '🚧',
            color: 'orange',
            databaseId: proyectosId,
            aggregate: 'count',
            filters: [{ id: newId('f'), propertyId: P.etapa, op: 'is', value: etapa.obra.id }],
          },
          {
            id: newId('stat'),
            label: 'Honorarios pendientes',
            icon: '💰',
            color: 'green',
            databaseId: proyectosId,
            aggregate: 'sum',
            propertyId: P.pendiente,
            filters: [{ id: newId('f'), propertyId: P.estado, op: 'is', value: estado.activo.id }],
          },
        ],
      },
      { id: newId('sec'), type: 'view', title: 'Proyectos activos', icon: '🟢', databaseId: proyectosId, viewId: pv.activos },
      { id: newId('sec'), type: 'view', title: 'Proyectos por etapa', icon: '🟦', databaseId: proyectosId, viewId: pv.etapas },
      { id: newId('sec'), type: 'view', title: 'Próximos vencimientos', icon: '📅', databaseId: elementosId, viewId: ev.vencimientos },
      { id: newId('sec'), type: 'view', title: 'Honorarios', icon: '💰', databaseId: proyectosId, viewId: pv.honorarios },
      { id: newId('sec'), type: 'view', title: 'Registro de planos', icon: '📐', databaseId: elementosId, viewId: ev.planos },
      { id: newId('sec'), type: 'view', title: 'Tablero de tareas', icon: '✅', databaseId: elementosId, viewId: ev.tareas },
      { id: newId('sec'), type: 'view', title: 'Todos los proyectos', icon: '🖼️', databaseId: proyectosId, viewId: pv.galeria },
    ],
  }

  return {
    title: 'Seguimiento de proyectos',
    icon: '🏛️',
    subtitle: 'Todo el estudio en una página.',
    layout,
    databases: [
      { id: proyectosId, title: 'Proyectos', icon: '🏛️', position: 0, properties: proyectosProps, views: proyectosViews, rows: proyectosRows },
      { id: elementosId, title: 'Tareas y entregables', icon: '🗂️', position: 1, properties: elementosProps, views: elementosViews, rows: elementosRows },
    ],
  }
}
