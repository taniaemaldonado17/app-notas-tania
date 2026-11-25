/** Run with: npm run test:mcp */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { editBlocks, EditError, replaceText } from './block-edit.ts'
import { markdownToBlocks } from './md-blocks.ts'

const t = (text: string, styles = {}) => ({ type: 'text', text, styles })
const doc = () => [
  { id: 'h', type: 'paragraph', props: {}, content: [t('2. Evolución del Sector Deportivo', { bold: true })], children: [] },
  { id: 'f9', type: 'paragraph', props: { textColor: 'blue' }, content: [t('Cancha de Fútbol 9: '), t('La cancha principal', { italic: true }), t(' dejará de ser solo un espacio de juego.')], children: [] },
  { id: 'pd', type: 'paragraph', props: {}, content: [t('Nuevas Canchas de Pádel: Incorporamos el pádel.')], children: [] },
  { id: 'sp', type: 'subpage', props: { subpageId: 'S1', title: 'Anexo', icon: '' }, children: [] },
  { id: 'h3', type: 'paragraph', props: {}, content: [t('3. Equipamiento del Paseo Ecológico', { bold: true })], children: [] },
]

test('reemplazar un bloque deja el resto intacto', () => {
  const nuevo = markdownToBlocks('**Cancha de fútbol 9:** campo de juego de 45 x 70 m.')
  const r = editBlocks(doc(), { action: 'reemplazar', find: 'cancha de futbol 9', blocks: nuevo })
  assert.deepEqual(r.blocks.map((b) => b.id), ['h', nuevo[0].id, 'pd', 'sp', 'h3'])
  assert.deepEqual(r.blocks[0], doc()[0])
  assert.equal(r.removed, 1)
})

test('un rango con una página interna la conserva', () => {
  const nuevo = markdownToBlocks('Texto nuevo')
  const r = editBlocks(doc(), { action: 'reemplazar', find: 'Cancha de Fútbol 9', until: 'Anexo', blocks: nuevo })
  assert.deepEqual(r.blocks.map((b) => b.type), ['paragraph', 'paragraph', 'subpage', 'paragraph'])
  assert.equal(r.keptPages, 1)
  const del = editBlocks(doc(), { action: 'eliminar', find: 'Pádel' })
  assert.deepEqual(del.blocks.map((b) => b.id), ['h', 'f9', 'sp', 'h3'])
})

test('insertar antes y después', () => {
  const nuevo = markdownToBlocks('- Fútbol 5')
  assert.deepEqual(editBlocks(doc(), { action: 'insertar_despues', find: 'Pádel', blocks: nuevo }).blocks.map((b) => b.id).slice(2, 4), ['pd', nuevo[0].id])
  assert.equal(editBlocks(doc(), { action: 'insertar_antes', find: '2. Evolución', blocks: nuevo }).blocks[0].id, nuevo[0].id)
})

test('errores claros: no está, ambiguo, falta contenido', () => {
  assert.throws(() => editBlocks(doc(), { action: 'eliminar', find: 'piscina' }), EditError)
  assert.throws(() => editBlocks(doc(), { action: 'eliminar', find: 'cancha' }), /Hay 2 bloques/)
  assert.equal(editBlocks(doc(), { action: 'eliminar', find: 'cancha', occurrence: 2 }).blocks.length, 4)
  assert.throws(() => editBlocks(doc(), { action: 'reemplazar', find: 'Pádel' }), /Falta el contenido/)
})

test('reemplazar texto conserva el formato de cada parte', () => {
  const r = replaceText(doc(), 'solo un espacio', 'únicamente un espacio')
  assert.equal(r.count, 1)
  assert.equal(r.blocks[1].content[2].text, ' dejará de ser únicamente un espacio de juego.')
  assert.deepEqual(r.blocks[1].props, { textColor: 'blue' })
  assert.deepEqual(r.blocks[1].content[1], t('La cancha principal', { italic: true }))
  assert.throws(() => replaceText(doc(), 'Fútbol 9: La cancha', 'x'), /distinto formato/)
  assert.throws(() => replaceText(doc(), 'ancha', 'x'), /aparece 3 veces/)
  assert.equal(replaceText(doc(), 'ancha', 'ANCHA', true).count, 3)
  assert.throws(() => replaceText(doc(), 'inexistente', 'x'), /No encontré/)
})
