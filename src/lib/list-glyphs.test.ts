import { test } from 'node:test'
import assert from 'node:assert/strict'
import { bulletsToLists, listPrefix } from './list-glyphs.ts'
import { pageContentFor } from './subpages.ts'

const p = (id: string, text: string, extra: Record<string, unknown> = {}) => ({
  id,
  type: 'paragraph',
  props: {},
  content: [{ type: 'text', text, styles: {} }],
  children: [],
  ...extra,
})
const h = (id: string, level: number, text: string) => ({ ...p(id, text), type: 'heading', props: { level } })

test('bullets pasted as characters become list items', () => {
  const out = bulletsToLists([
    p('a', '• Primero'),
    p('b', '·\tSegundo'),
    p('c', ' Word'),
    p('d', '1. Uno'),
    p('e', 'Texto normal'),
    p('f', '-3 grados'),
    p('g', '•'),
  ])
  assert.deepEqual(
    out.map((b) => b.type),
    ['bulletListItem', 'bulletListItem', 'bulletListItem', 'numberedListItem', 'paragraph', 'paragraph', 'paragraph']
  )
  assert.equal(out[0].content[0].text, 'Primero')
  assert.equal(out[1].content[0].text, 'Segundo')
  assert.equal(out[3].content[0].text, 'Uno')
})

test('bullet split across styled runs keeps the styles of the text', () => {
  const [b] = bulletsToLists([
    { ...p('a', ''), content: [{ type: 'text', text: '• ', styles: {} }, { type: 'text', text: 'Negrita', styles: { bold: true } }] },
  ])
  assert.equal(b.type, 'bulletListItem')
  assert.deepEqual(b.content, [{ type: 'text', text: 'Negrita', styles: { bold: true } }])
})

test('listPrefix ignores years and plain dashes in text', () => {
  assert.equal(listPrefix('2024. Año'), null)
  assert.equal(listPrefix('Hola - chau'), null)
})

test('page from a selection: first block is the title, the rest moves in', () => {
  const doc = [p('t', 'Archivo adjunto para correo:'), p('x', 'Para actualizar'), p('y', '• Uno'), p('z', 'Fuera')]
  const r = pageContentFor(doc[0], doc.slice(0, 3), doc)
  assert.equal(r.title.id, 't')
  assert.deepEqual(r.content.map((b) => b.id), ['x', 'y'])
  assert.deepEqual(r.taken.map((b) => b.id), ['x', 'y'])
})

test('page from a heading takes its section; links to pages stay', () => {
  const doc = [h('t', 2, 'Sección'), p('a', 'uno'), h('s', 3, 'Sub'), p('b', 'dos'), h('n', 2, 'Otra'), p('c', 'tres')]
  assert.deepEqual(pageContentFor(doc[0], [doc[0]], doc).taken.map((b) => b.id), ['a', 's', 'b'])
  const withLink = [h('t', 1, 'S'), p('a', 'uno'), { id: 'l', type: 'subpage', props: {}, children: [] }, p('b', 'dos')]
  assert.deepEqual(pageContentFor(withLink[0], [withLink[0]], withLink).taken.map((b) => b.id), ['a'])
})

test('page from a block with nested blocks takes only those (as in Notion)', () => {
  const doc = [p('t', 'Título', { children: [p('k', 'hijo')] }), p('a', 'hermano')]
  const r = pageContentFor(doc[0], [doc[0]], doc)
  assert.deepEqual(r.content.map((b) => b.id), ['k'])
  assert.equal(r.taken.length, 0)
  assert.equal(pageContentFor(doc[1], [doc[1]], doc).content.length, 0)
})
