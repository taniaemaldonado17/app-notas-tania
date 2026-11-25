import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getAuthUserId } from '@/lib/auth-helpers'
import { appOrigin } from '@/lib/mentions'
import { connectorPath, hashSecret, newConnectorSecret } from '@/lib/mcp/token'

/** Whether the user has a Claude connector link, and since when. */
export async function GET() {
  const userId = await getAuthUserId()
  if (!userId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const user = await db.user.findUnique({ where: { id: userId }, select: { mcpTokenHash: true, mcpTokenCreatedAt: true } })
  return NextResponse.json({
    connected: !!user?.mcpTokenHash,
    createdAt: user?.mcpTokenCreatedAt?.toISOString() ?? null,
  })
}

/**
 * Creates the connector link (or a new one: the previous stops working).
 * The full link is returned only here, once; only its hash is stored.
 */
export async function POST(req: Request) {
  const userId = await getAuthUserId()
  if (!userId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const secret = newConnectorSecret()
  const now = new Date()
  await db.user.update({ where: { id: userId }, data: { mcpTokenHash: hashSecret(secret), mcpTokenCreatedAt: now } })
  return NextResponse.json({ url: `${appOrigin(req)}${connectorPath(secret)}`, createdAt: now.toISOString() })
}

/** Disconnects Claude: the link stops working. */
export async function DELETE() {
  const userId = await getAuthUserId()
  if (!userId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  await db.user.update({ where: { id: userId }, data: { mcpTokenHash: null, mcpTokenCreatedAt: null } })
  return NextResponse.json({ ok: true })
}
