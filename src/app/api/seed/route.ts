import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { hashPassword } from '@/lib/bcrypt'
import { ensureTemplatePage } from '@/lib/template'

/**
 * Idempotent seed endpoint (also callable via `bun run prisma/seed.ts`).
 * Creates the demo user if missing, then ensures their template page exists.
 *
 * Demo credentials:
 *   email: demo@notas.local
 *   password: demo1234
 */
async function seed() {
  const email = 'demo@notas.local'
  const password = 'demo1234'

  let user = await db.user.findUnique({ where: { email } })
  if (!user) {
    const passwordHash = await hashPassword(password)
    user = await db.user.create({
      data: {
        email,
        name: 'Demo',
        passwordHash,
      },
    })
    console.log(`[seed] created demo user ${email}`)
  } else {
    console.log(`[seed] demo user already exists: ${email}`)
  }

  await ensureTemplatePage(user.id)
  console.log(`[seed] template page ensured for ${email}`)
}

export async function GET() {
  try {
    await seed()
    return NextResponse.json({
      ok: true,
      message: 'Seed completado. demo@notas.local / demo1234',
    })
  } catch (err) {
    console.error('[seed]', err)
    return NextResponse.json(
      { error: 'Seed falló', detail: String(err) },
      { status: 500 }
    )
  }
}
