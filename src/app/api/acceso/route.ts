import { NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { getAuthUserId } from '@/lib/auth-helpers'
import { quitarAcceso } from '@/lib/acceso'

/**
 * Who can see each of my pages: every person I share at least one page with,
 * and which of my pages they can open.
 */
export async function GET() {
  const userId = await getAuthUserId()
  if (!userId) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }
  const paginas = await db.page.findMany({
    where: { userId },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      title: true,
      icon: true,
      members: { select: { user: { select: { id: true, name: true, email: true } } } },
    },
  })
  const personas = new Map<string, { id: string; name: string | null; email: string; paginas: string[]; cyp: boolean }>()
  for (const p of paginas) {
    for (const { user } of p.members) {
      const persona = personas.get(user.id) ?? { ...user, paginas: [], cyp: false }
      persona.paginas.push(p.id)
      personas.set(user.id, persona)
    }
  }
  // "Cómputo y presupuesto" section shared with them.
  const cyp = await db.cypCompartido.findMany({
    where: { ownerId: userId },
    select: { user: { select: { id: true, name: true, email: true } } },
  })
  for (const { user } of cyp) {
    const persona = personas.get(user.id) ?? { ...user, paginas: [], cyp: false }
    persona.cyp = true
    personas.set(user.id, persona)
  }
  return NextResponse.json({
    paginas: paginas.map(({ members: _m, ...p }) => p),
    personas: [...personas.values()].sort((a, b) => (a.name || a.email).localeCompare(b.name || b.email)),
  })
}

const cambioSchema = z.union([
  z.object({ userId: z.string().min(1).max(64), pageId: z.string().min(1).max(64), acceso: z.boolean() }),
  // The whole "Cómputo y presupuesto" section (every CyP I created).
  z.object({ userId: z.string().min(1).max(64), seccion: z.literal('cyp'), acceso: z.boolean() }),
])

/**
 * Gives or removes one person's access to one of my pages, or to my whole
 * "Cómputo y presupuesto" section. Only to someone I already share something
 * with (new people come in with an invitation link from "Compartir").
 */
export async function POST(req: Request) {
  const userId = await getAuthUserId()
  if (!userId) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }
  const parsed = cambioSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Pedido inválido' }, { status: 400 })
  }
  const { userId: persona, acceso } = parsed.data
  if (persona === userId) {
    return NextResponse.json({ error: 'Ya tenés acceso: es tuyo' }, { status: 400 })
  }

  if ('seccion' in parsed.data) {
    if (!acceso) {
      await db.cypCompartido.deleteMany({ where: { ownerId: userId, userId: persona } })
      return NextResponse.json({ ok: true })
    }
    if (!(await esConocida(userId, persona))) {
      return NextResponse.json({ error: 'Invitá a esta persona con un link desde «Compartir»' }, { status: 403 })
    }
    await db.cypCompartido.upsert({
      where: { ownerId_userId: { ownerId: userId, userId: persona } },
      create: { ownerId: userId, userId: persona },
      update: {},
    })
    return NextResponse.json({ ok: true })
  }

  const { pageId } = parsed.data
  const pagina = await db.page.findUnique({ where: { id: pageId }, select: { userId: true } })
  if (!pagina || pagina.userId !== userId) {
    return NextResponse.json({ error: 'Solo quien creó la página puede cambiar quién la ve' }, { status: 403 })
  }
  if (!acceso) {
    await quitarAcceso(pageId, persona)
    return NextResponse.json({ ok: true })
  }

  if (!(await esConocida(userId, persona))) {
    return NextResponse.json({ error: 'Invitá a esta persona con un link desde «Compartir»' }, { status: 403 })
  }
  await db.pageMember.upsert({
    where: { pageId_userId: { pageId, userId: persona } },
    create: { pageId, userId: persona },
    update: {},
  })
  return NextResponse.json({ ok: true })
}

/** Someone I already share something with (a page or the CyP section). */
async function esConocida(ownerId: string, persona: string) {
  const [pagina, cyp] = await Promise.all([
    db.pageMember.findFirst({ where: { userId: persona, page: { userId: ownerId } }, select: { id: true } }),
    db.cypCompartido.findFirst({ where: { ownerId, userId: persona }, select: { id: true } }),
  ])
  return !!(pagina || cyp)
}
