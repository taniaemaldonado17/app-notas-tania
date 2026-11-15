 
/**
 * Standalone seed script. Run with:
 *   bun run prisma/seed.ts
 *
 * Creates the demo user (demo@notas.local / demo1234) and ensures
 * their default "Registro de tareas diarias" template page exists.
 */
import { db } from '../src/lib/db'
import { hashPassword } from '../src/lib/bcrypt'
import { ensureTemplatePage } from '../src/lib/template'

async function main() {
  const email = 'demo@notas.local'
  const password = 'demo1234'

  let user = await db.user.findUnique({ where: { email } })
  if (!user) {
    const passwordHash = await hashPassword(password)
    user = await db.user.create({
      data: { email, name: 'Demo', passwordHash },
    })
    console.log(`[seed] created demo user ${email}`)
  } else {
    console.log(`[seed] demo user already exists: ${email}`)
  }

  await ensureTemplatePage(user.id)
  console.log(`[seed] template page ensured for ${email}`)
  await db.$disconnect()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
