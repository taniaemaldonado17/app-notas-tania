/**
 * Run with: npm run test:mcp
 * Covers the Claude connector's protocol handling and the Markdown <-> blocks
 * conversion (the database tools are thin Prisma queries on top of these).
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { handleRpc, text, ToolError, type ServerConfig } from './protocol.ts'
import { blocksToMarkdown, markdownToBlocks } from '../md-blocks.ts'

const cfg: ServerConfig = {
  name: 'malta',
  title: 'Malta',
  version: 'test',
  instructions: 'hola',
  tools: [
    { name: 'eco', description: 'devuelve el texto', inputSchema: { type: 'object', properties: { t: { type: 'string' } } } },
    { name: 'falla', description: 'error para Claude', inputSchema: { type: 'object' } },
    { name: 'rompe', description: 'error interno', inputSchema: { type: 'object' } },
  ],
  run: async (name, args) => {
    if (name === 'falla') throw new ToolError('No encontré esa base')
    if (name === 'rompe') throw new Error('db down')
    return text(String(args.t ?? ''))
  },
}

test('initialize negocia la versión y anuncia herramientas', async () => {
  const r = (await handleRpc({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'claude' } } }, cfg)) as any
  assert.equal(r.id, 1)
  assert.equal(r.result.protocolVersion, '2025-06-18')
  assert.deepEqual(r.result.capabilities, { tools: { listChanged: false } })
  assert.equal(r.result.serverInfo.name, 'malta')
  assert.equal(r.result.instructions, 'hola')

  const unknown = (await handleRpc({ jsonrpc: '2.0', id: 2, method: 'initialize', params: { protocolVersion: '1999-01-01' } }, cfg)) as any
  assert.equal(unknown.result.protocolVersion, '2025-11-25')
})

test('las notificaciones no tienen respuesta', async () => {
  assert.equal(await handleRpc({ jsonrpc: '2.0', method: 'notifications/initialized' }, cfg), null)
  assert.equal(await handleRpc([{ jsonrpc: '2.0', method: 'notifications/initialized' }], cfg), null)
})

test('tools/list y tools/call', async () => {
  const list = (await handleRpc({ jsonrpc: '2.0', id: 'a', method: 'tools/list' }, cfg)) as any
  assert.deepEqual(list.result.tools.map((t: any) => t.name), ['eco', 'falla', 'rompe'])

  const ok = (await handleRpc({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'eco', arguments: { t: 'hola' } } }, cfg)) as any
  assert.deepEqual(ok.result, { content: [{ type: 'text', text: 'hola' }] })

  const userErr = (await handleRpc({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'falla', arguments: {} } }, cfg)) as any
  assert.equal(userErr.result.isError, true)
  assert.equal(userErr.result.content[0].text, 'No encontré esa base')

  const internal = (await handleRpc({ jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'rompe' } }, cfg)) as any
  assert.equal(internal.result.isError, true)
  assert.doesNotMatch(internal.result.content[0].text, /db down/)

  const missing = (await handleRpc({ jsonrpc: '2.0', id: 6, method: 'tools/call', params: { name: 'nada' } }, cfg)) as any
  assert.equal(missing.error.code, -32602)
})

test('ping, métodos desconocidos y mensajes inválidos', async () => {
  assert.deepEqual(await handleRpc({ jsonrpc: '2.0', id: 7, method: 'ping' }, cfg), { jsonrpc: '2.0', id: 7, result: {} })
  assert.equal(((await handleRpc({ jsonrpc: '2.0', id: 8, method: 'sampling/x' }, cfg)) as any).error.code, -32601)
  assert.equal(((await handleRpc({ id: 9, method: 'ping' }, cfg)) as any).error.code, -32600)
  assert.equal(((await handleRpc('hola', cfg)) as any).error.code, -32600)
  const batch = (await handleRpc([{ jsonrpc: '2.0', id: 1, method: 'ping' }, { jsonrpc: '2.0', method: 'notifications/x' }], cfg)) as any[]
  assert.equal(batch.length, 1)
})

/* ---------------------------- Markdown <-> blocks ---------------------------- */

const MD = `# Proyecto

Texto con **negrita**, *cursiva*, ~~tachado~~, \`código\` y un [enlace](https://example.com).

## 5. Estudios técnicos

- Primer punto
- Segundo punto
    - Anidado
1. Uno
2. Dos

- [ ] Pendiente
- [x] Hecho

> Una cita

\`\`\`ts
const a = 1
\`\`\`

| Ítem | Precio |
| --- | --- |
| Planos | $ 100 |

---

![Plano](https://example.com/plano.png)
`

test('Markdown a bloques: tipos, estilos y ids', () => {
  const blocks = markdownToBlocks(MD)
  const types = blocks.map((b) => b.type)
  assert.deepEqual(types, [
    'heading', 'paragraph', 'heading',
    'bulletListItem', 'bulletListItem', 'numberedListItem', 'numberedListItem',
    'checkListItem', 'checkListItem', 'quote', 'codeBlock', 'table', 'divider', 'image',
  ])
  assert.equal(blocks[2].props.level, 2)
  const para = blocks[1].content
  assert.ok(para.some((n: any) => n.text === 'negrita' && n.styles.bold))
  assert.ok(para.some((n: any) => n.text === 'cursiva' && n.styles.italic))
  assert.ok(para.some((n: any) => n.text === 'tachado' && n.styles.strike))
  assert.ok(para.some((n: any) => n.text === 'código' && n.styles.code))
  assert.ok(para.some((n: any) => n.type === 'link' && n.href === 'https://example.com'))
  assert.equal(blocks[4].children[0].type, 'bulletListItem')
  assert.equal(blocks[7].props.checked, false)
  assert.equal(blocks[8].props.checked, true)
  assert.equal(blocks[10].props.language, 'ts')
  assert.equal(blocks[11].content.rows.length, 2)
  assert.equal(blocks[13].props.url, 'https://example.com/plano.png')
  // Every block (nested too) has a unique id.
  const ids: string[] = []
  const walk = (list: any[]) => list.forEach((b) => (ids.push(b.id), walk(b.children ?? [])))
  walk(blocks)
  assert.equal(new Set(ids).size, ids.length)
  assert.ok(ids.every((id) => typeof id === 'string' && id.length > 10))
})

test('bloques a Markdown y vuelta es estable', () => {
  const md = blocksToMarkdown(markdownToBlocks(MD))
  assert.match(md, /^# Proyecto/)
  assert.match(md, /\*\*negrita\*\*/)
  assert.match(md, /- \[x\] Hecho/)
  assert.match(md, /\| Ítem \| Precio \|/)
  assert.match(md, /```ts\nconst a = 1\n```/)
  assert.equal(blocksToMarkdown(markdownToBlocks(md)), md)
})

test('bloques propios de Malta se leen como texto', () => {
  const md = blocksToMarkdown([
    { type: 'callout', props: { emoji: '⚠️' }, content: [{ type: 'text', text: 'Ojo', styles: {} }], children: [] },
    { type: 'paragraph', content: [{ type: 'mention', props: { name: 'Tania' } }, { type: 'text', text: ' revisá', styles: {} }], children: [] },
    { type: 'timeline', props: { items: JSON.stringify([{ id: 'a', name: 'Planos', start: '2026-12-01', end: '2026-12-10', done: false }]) }, children: [] },
  ])
  assert.match(md, /> ⚠️ Ojo/)
  assert.match(md, /@Tania revisá/)
  assert.match(md, /\| Planos \| 2026-12-01 \| 2026-12-10 \|/)
})

test('texto vacío no crea bloques', () => {
  assert.deepEqual(markdownToBlocks('  \n\n'), [])
})

test('páginas internas: bloque <-> línea de Markdown', () => {
  const md = 'Intro\n\n📄 [Presupuesto ampliación](subpagina:cmabc123)\n\n[Sin ícono](subpagina:x_1-2)\n\n[normal](https://example.com)'
  const blocks = markdownToBlocks(md)
  assert.deepEqual(blocks.map((b) => b.type), ['paragraph', 'subpage', 'subpage', 'paragraph'])
  assert.deepEqual(blocks[1].props, { subpageId: 'cmabc123', title: 'Presupuesto ampliación', icon: '📄' })
  assert.deepEqual(blocks[2].props, { subpageId: 'x_1-2', title: 'Sin ícono', icon: '' })
  assert.equal(blocksToMarkdown(blocks), md)
})
