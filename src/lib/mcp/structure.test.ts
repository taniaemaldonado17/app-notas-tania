/** Run with: npm run test:mcp */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  actionValues,
  addToGroup,
  buildFilter,
  buildProperty,
  buildView,
  describeStructure,
  insertSection,
  StructureError,
  titleProperty,
} from './structure.ts'
import { matchesFilter, quickActionValues, resolveDateToken, todayISO, type DatabaseDef, type PageLayout } from '../db-types.ts'

const proyectos: DatabaseDef = {
  id: 'dbP', pageId: 'pg', title: 'Proyectos', icon: null, position: 0, views: [],
  properties: [titleProperty('Proyecto')],
  rows: [{ id: 'r1', databaseId: 'dbP', title: 'Predio Prefectura', icon: null, values: {}, position: 0, createdById: null, createdAt: '', updatedAt: '' }],
}
const tareas: DatabaseDef = {
  id: 'dbT', pageId: 'pg', title: 'Tareas y entregables', icon: null, position: 1, rows: [],
  views: [{ id: 'v1', name: 'Todos', type: 'table', filters: [], sorts: [], visibleProperties: [] }],
  properties: [
    titleProperty(),
    { id: 'fecha', name: 'Fecha límite', type: 'date' },
    { id: 'estado', name: 'Estado', type: 'status', options: [{ id: 'o1', name: '⏳ Pendiente', color: 'gray' }, { id: 'o2', name: '✅ Aprobado', color: 'green' }] },
    { id: 'resp', name: 'Responsable', type: 'person' },
  ],
}
const people = [{ id: 'u1', name: 'Tania Maldonado' }, { id: 'u2', name: 'Lucas Leonczyk' }]
const all = [proyectos, tareas]

test('fechas relativas en filtros', () => {
  assert.equal(resolveDateToken('today'), todayISO())
  assert.ok(resolveDateToken('today+7') > todayISO() && resolveDateToken('today-1') < todayISO())
  const f = buildFilter(tareas, { propiedad: 'fecha límite', op: 'hasta', valor: 'hoy + 7' }, all, people)
  assert.deepEqual([f.op, f.value], ['on_or_before', 'today+7'])
  const prop = tareas.properties[1]
  assert.equal(matchesFilter(prop, resolveDateToken('today+3'), f), true)
  assert.equal(matchesFilter(prop, resolveDateToken('today+9'), f), false)
})

test('filtros por opción y persona, con errores claros', () => {
  assert.equal(buildFilter(tareas, { propiedad: 'Estado', op: 'no_es', valor: 'aprobado' }, all, people).value, 'o2')
  assert.equal(buildFilter(tareas, { propiedad: 'Responsable', op: 'contiene', valor: 'lucas' }, all, people).value, 'u2')
  assert.throws(() => buildFilter(tareas, { propiedad: 'Estado', op: 'es', valor: 'Entregado' }, all, people), /Opciones: ⏳ Pendiente, ✅ Aprobado/)
  assert.throws(() => buildFilter(tareas, { propiedad: 'Color', op: 'es', valor: 'x' }, all, people), StructureError)
  assert.throws(() => buildFilter(tareas, { propiedad: 'Fecha límite', op: 'contiene', valor: 'x' }, all, people), /no sirve/)
})

test('relación con lista inversa en la otra base', () => {
  const minutas = { id: 'dbM', title: 'Minutas', properties: [titleProperty('Reunión')] }
  const r = buildProperty(minutas, { nombre: 'Proyecto', tipo: 'relación', relacion_con: 'proyectos' }, [...all, minutas as DatabaseDef])
  assert.equal(r.property.relationDatabaseId, 'dbP')
  assert.deepEqual(r.backlink && [r.backlink.databaseId, r.backlink.property.name, r.backlink.property.type, r.backlink.property.backlinkPropertyId], ['dbP', 'Minutas', 'backlink', r.property.id])
  const sel = buildProperty(minutas, { nombre: 'Tipo', tipo: 'seleccion', opciones: ['Reunión con cliente', 'Visita de obra'] }, all).property
  assert.deepEqual(sel.options?.map((o) => o.name), ['Reunión con cliente', 'Visita de obra'])
  assert.throws(() => buildProperty(minutas, { nombre: 'X', tipo: 'color' }, all), /Tipo de propiedad desconocido/)
})

test('vistas: tablero por persona, calendario con la primera fecha', () => {
  const board = buildView(tareas, { nombre: 'Carga por responsable', tipo: 'tablero', agrupar_por: 'Responsable', filtros: [{ propiedad: 'Estado', op: 'no_es', valor: 'Aprobado' }] }, all, people)
  assert.deepEqual([board.type, board.groupBy, board.filters.length], ['board', 'resp', 1])
  assert.equal(buildView(tareas, { nombre: 'X', tipo: 'calendario' }, all, people).dateProperty, 'fecha')
  assert.throws(() => buildView(proyectos, { nombre: 'X', tipo: 'calendario' }, all, people), /necesitan "fecha"/)
  assert.throws(() => buildView(tareas, { nombre: 'X', tipo: 'tablero', agrupar_por: 'Fecha límite' }, all, people), /Solo se puede agrupar/)
  const list = buildView(tareas, { nombre: 'Vencidas', tipo: 'lista', filtros: [{ propiedad: 'Fecha límite', op: 'antes', valor: 'hoy' }], orden: [{ propiedad: 'Fecha límite' }] }, all, people)
  const d = describeStructure([{ ...tareas, views: [list] }], null, people)
  assert.deepEqual(d.bases[0].vistas[0].filtros, ['Fecha límite antes de hoy'])
})

test('pantalla principal: posiciones, acciones con fecha relativa, indicadores', () => {
  let layout: PageLayout = { showSources: true, sections: [{ id: 's1', type: 'view', title: 'Proyectos activos', databaseId: 'dbP', viewId: 'x' }] }
  layout = insertSection(layout, { id: 'h', type: 'heading', text: 'Esta semana' }, 'despues_de:proyectos activos')
  layout = insertSection(layout, { id: 'v', type: 'view', title: 'Próximos 7 días', databaseId: 'dbT', viewId: 'v1' }, 'despues_de:Esta semana')
  assert.deepEqual(layout.sections.map((s) => s.id), ['s1', 'h', 'v'])
  assert.throws(() => insertSection(layout, { id: 'z', type: 'heading', text: 'z' }, 'despues_de:no existe'), /No encontré la sección/)
  const values = actionValues(tareas, { 'Fecha límite': 'hoy', Estado: 'pendiente', Responsable: 'Tania' }, people, all)
  assert.deepEqual(values, { fecha: 'today', estado: 'o1', resp: ['u1'] })
  assert.deepEqual(quickActionValues({ id: 'a', label: 'x', databaseId: 'dbT', values }, tareas), { fecha: todayISO(), estado: 'o1', resp: ['u1'] })
  layout = addToGroup(layout, 'actions', { id: 'a', label: 'Nueva minuta', databaseId: 'dbT', values: {} })
  layout = addToGroup(layout, 'stats', { id: 'st', label: 'Vencidas', color: 'red', databaseId: 'dbT', aggregate: 'count', filters: [] })
  layout = addToGroup(layout, 'actions', { id: 'b', label: 'Otra', databaseId: 'dbT', values: {} })
  assert.deepEqual(layout.sections.map((s) => s.type), ['actions', 'stats', 'view', 'heading', 'view'])
  assert.equal((layout.sections[0] as { items: unknown[] }).items.length, 2)
})
