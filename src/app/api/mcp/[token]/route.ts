import { appOrigin } from '@/lib/mentions'
import { handleRpc, parseError } from '@/lib/mcp/protocol'
import { INSTRUCTIONS, makeRunner, TOOLS } from '@/lib/mcp/malta-tools'
import { userForSecret } from '@/lib/mcp/token'

/**
 * Claude connector: MCP server (Streamable HTTP, stateless, JSON replies).
 * The secret in the URL identifies the user; see /api/claude-connector.
 * Add it in Claude as a custom connector with the full link.
 */

const MAX_BODY = 1_000_000

const notFound = () => Response.json({ error: 'Enlace del conector inválido o revocado. Generá uno nuevo en Malta.' }, { status: 404 })

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const userId = await userForSecret(token)
  if (!userId) return notFound()

  const raw = await req.text()
  if (raw.length > MAX_BODY) return Response.json(parseError(), { status: 413 })
  let body: unknown
  try {
    body = JSON.parse(raw)
  } catch {
    return Response.json(parseError(), { status: 400 })
  }

  const reply = await handleRpc(body, {
    name: 'malta',
    title: 'Malta',
    version: '1.0.0',
    instructions: INSTRUCTIONS,
    tools: TOOLS,
    run: makeRunner(userId, appOrigin(req)),
  })
  if (reply === null) return new Response(null, { status: 202 })
  return Response.json(reply, { headers: { 'Cache-Control': 'no-store' } })
}

/** No server-initiated stream and no sessions: only POST is used. */
function methodNotAllowed() {
  return new Response('Method Not Allowed', { status: 405, headers: { Allow: 'POST' } })
}

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  if (!(await userForSecret(token))) return notFound()
  return methodNotAllowed()
}

export async function DELETE() {
  return methodNotAllowed()
}
