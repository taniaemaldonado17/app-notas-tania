import { db } from '@/lib/db'

export const TEMPLATE_SUBTITLE =
  '10.x.x.x · Capital · Goya · Santo Tomé · Paso de la Patria · Empedrado · Santa Ana · San Cosme · Corrientes capital · Ctes.'

export const TEMPLATE_COLUMNS: {
  title: string
  accentColor?: string
  cards: string[]
}[] = [
  {
    title: 'Recursos',
    cards: [
      'Actualizar tablas (primeros días de cada mes)',
      'Atajos prácticos de AutoCAD',
      'Plantilla de informe mensual',
      'Lista de contactos municipales',
      'Mapa de red — leyenda',
      'Procedimiento de backup CAD',
      'Catálogo de materiales',
      'Directorio de proveedores',
      'Manual de ArcGIS (resumen)',
      'Notas de reuniones de equipo',
      'Formato de planilla de avance',
      'Recordatorios generales',
    ],
  },
  {
    title: 'Sin empezar',
    cards: [
      'Actualizar manzanas / secciones / código de manzana',
      'Ciudad del Este — falta cota',
      'Revisar errores de importación SHAPE',
      'Indexar planos nuevos al servidor',
      'Contactar topógrafo de Santo Tomé',
    ],
  },
  {
    title: 'PRIORIDAD',
    accentColor: '#E0584C',
    cards: [
      'Relevamiento de hidrantes (viernes)',
      'Marcar pileta',
      'Dibujar red Sto Tomé',
      'Validar cotas Capital — manzana 1423',
    ],
  },
  {
    title: 'En progreso',
    cards: ['Calles', 'Arreglar interferencia de proyección CAD'],
  },
]

/**
 * Creates the default template Page (with 4 columns and seed cards)
 * for a freshly registered user. Idempotent: if the user already has
 * at least one page, does nothing.
 */
export async function ensureTemplatePage(userId: string): Promise<void> {
  const existing = await db.page.findFirst({
    where: { userId },
    select: { id: true },
  })
  if (existing) return

  await db.page.create({
    data: {
      title: 'Registro de tareas diarias',
      subtitle: TEMPLATE_SUBTITLE,
      icon: '📓',
      userId,
      columns: {
        create: TEMPLATE_COLUMNS.map((col, colIdx) => ({
          title: col.title,
          position: colIdx,
          accentColor: col.accentColor ?? null,
          cards: {
            create: col.cards.map((title, cardIdx) => ({
              title,
              position: cardIdx,
              accentColor: col.accentColor ?? null,
            })),
          },
        })),
      },
    },
  })
}
