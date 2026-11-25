import { createHash, randomBytes } from 'node:crypto'
import { db } from '@/lib/db'

/** Secret part of the connector link (256 random bits). */
export const newConnectorSecret = () => randomBytes(32).toString('base64url')

export const hashSecret = (secret: string) => createHash('sha256').update(secret).digest('hex')

export const connectorPath = (secret: string) => `/api/mcp/${secret}`

/** The user a connector link belongs to, or null if it's not valid (any more). */
export async function userForSecret(secret: string): Promise<string | null> {
  if (!/^[A-Za-z0-9_-]{40,64}$/.test(secret)) return null
  const user = await db.user.findFirst({ where: { mcpTokenHash: hashSecret(secret) }, select: { id: true } })
  return user?.id ?? null
}
