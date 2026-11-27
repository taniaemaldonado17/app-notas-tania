import { db } from '@/lib/db'

/**
 * Administradoras de la app (Tania y Lucas): las únicas cuentas que pueden
 * compartir (invitar gente, dar acceso, crear links públicos) y usar la
 * sección «Cómputo y presupuesto».
 *
 * Se configuran con la variable de entorno ADMIN_EMAILS (emails separados
 * por coma). Si no está puesta, la única administradora es la primera
 * cuenta que se creó en la app, para que nadie quede afuera sin querer.
 */
function emailsAdmin(): string[] {
  return (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
}

let primeraCuenta: string | null = null

async function idPrimeraCuenta(): Promise<string | null> {
  if (primeraCuenta) return primeraCuenta
  const u = await db.user.findFirst({ orderBy: { createdAt: 'asc' }, select: { id: true } })
  primeraCuenta = u?.id ?? null
  return primeraCuenta
}

/** True si la cuenta es administradora. */
export async function esAdmin(userId: string | null | undefined): Promise<boolean> {
  if (!userId) return false
  const emails = emailsAdmin()
  if (emails.length === 0) return (await idPrimeraCuenta()) === userId
  const u = await db.user.findUnique({ where: { id: userId }, select: { email: true } })
  return !!u && emails.includes(u.email.toLowerCase())
}

export const SOLO_ADMIN = 'Solo las administradoras de la app pueden hacer esto'
