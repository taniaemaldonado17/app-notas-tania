/**
 * Minimal MCP (Model Context Protocol) server over Streamable HTTP, stateless:
 * every POST carries one JSON-RPC message (or a batch) and gets a JSON reply.
 * Only tools are offered. Kept free of server imports so it can be tested
 * with `npm run test:mcp`.
 */

export type JsonSchema = Record<string, unknown>

export type ToolDef = {
  name: string
  title?: string
  description: string
  inputSchema: JsonSchema
  annotations?: {
    title?: string
    readOnlyHint?: boolean
    destructiveHint?: boolean
    idempotentHint?: boolean
    openWorldHint?: boolean
  }
}

export type ToolResult = {
  content: { type: 'text'; text: string }[]
  isError?: boolean
}

export type ToolRunner = (name: string, args: Record<string, unknown>) => Promise<ToolResult>

/** An error meant for Claude to read (bad id, missing field…), not a crash. */
export class ToolError extends Error {}

export const SUPPORTED_VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05']
const LATEST = SUPPORTED_VERSIONS[0]

export type ServerConfig = {
  name: string
  title: string
  version: string
  instructions?: string
  tools: ToolDef[]
  run: ToolRunner
}

type RpcId = string | number | null
type RpcMessage = { jsonrpc?: unknown; id?: RpcId; method?: unknown; params?: unknown }

const rpcError = (id: RpcId, code: number, message: string) => ({ jsonrpc: '2.0', id, error: { code, message } })
const rpcResult = (id: RpcId, result: unknown) => ({ jsonrpc: '2.0', id, result })

export const text = (value: string): ToolResult => ({ content: [{ type: 'text', text: value }] })

async function handleOne(msg: unknown, cfg: ServerConfig): Promise<object | null> {
  if (!msg || typeof msg !== 'object' || Array.isArray(msg)) return rpcError(null, -32600, 'Invalid Request')
  const m = msg as RpcMessage
  const isRequest = m.id !== undefined && m.id !== null
  if (m.jsonrpc !== '2.0' || typeof m.method !== 'string') {
    // Responses from the client (we never send requests) are ignored.
    if (m.jsonrpc === '2.0' && m.method === undefined) return null
    return rpcError(isRequest ? (m.id as RpcId) : null, -32600, 'Invalid Request')
  }
  if (!isRequest) return null // notification (initialized, cancelled…): nothing to answer
  const id = m.id as RpcId
  const params = (m.params && typeof m.params === 'object' ? m.params : {}) as Record<string, unknown>

  switch (m.method) {
    case 'initialize': {
      const asked = typeof params.protocolVersion === 'string' ? params.protocolVersion : ''
      return rpcResult(id, {
        protocolVersion: SUPPORTED_VERSIONS.includes(asked) ? asked : LATEST,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: cfg.name, title: cfg.title, version: cfg.version },
        ...(cfg.instructions ? { instructions: cfg.instructions } : {}),
      })
    }
    case 'ping':
      return rpcResult(id, {})
    case 'tools/list':
      return rpcResult(id, { tools: cfg.tools })
    case 'tools/call': {
      const name = params.name
      if (typeof name !== 'string' || !cfg.tools.some((t) => t.name === name)) {
        return rpcError(id, -32602, `Herramienta desconocida: ${String(name)}`)
      }
      const args = params.arguments && typeof params.arguments === 'object' && !Array.isArray(params.arguments) ? (params.arguments as Record<string, unknown>) : {}
      try {
        return rpcResult(id, await cfg.run(name, args))
      } catch (err) {
        if (err instanceof ToolError) return rpcResult(id, { ...text(err.message), isError: true })
        console.error('[mcp] tool failed', name, err)
        return rpcResult(id, { ...text('Error interno de Malta al ejecutar la herramienta. Probá de nuevo en un momento.'), isError: true })
      }
    }
    case 'resources/list':
      return rpcResult(id, { resources: [] })
    case 'resources/templates/list':
      return rpcResult(id, { resourceTemplates: [] })
    case 'prompts/list':
      return rpcResult(id, { prompts: [] })
    default:
      return rpcError(id, -32601, `Método no soportado: ${m.method}`)
  }
}

/**
 * Handles a parsed JSON-RPC body. Returns the reply to send, or null when the
 * message only had notifications (answer 202 with no body).
 */
export async function handleRpc(body: unknown, cfg: ServerConfig): Promise<object | object[] | null> {
  if (Array.isArray(body)) {
    if (!body.length) return rpcError(null, -32600, 'Invalid Request')
    const replies = (await Promise.all(body.map((m) => handleOne(m, cfg)))).filter((r): r is object => r !== null)
    return replies.length ? replies : null
  }
  return handleOne(body, cfg)
}

export const parseError = () => rpcError(null, -32700, 'Parse error')
