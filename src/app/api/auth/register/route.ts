import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { hashPassword } from '@/lib/bcrypt'
import { ensureTemplatePage } from '@/lib/template'

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const email = (body?.email ?? '').toString().trim().toLowerCase()
    const password = (body?.password ?? '').toString()
    const name = (body?.name ?? '').toString().trim()

    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email y contraseña son obligatorios' },
        { status: 400 }
      )
    }
    if (password.length < 6) {
      return NextResponse.json(
        { error: 'La contraseña debe tener al menos 6 caracteres' },
        { status: 400 }
      )
    }

    const existing = await db.user.findUnique({ where: { email } })
    if (existing) {
      return NextResponse.json(
        { error: 'Ya existe una cuenta con ese email' },
        { status: 409 }
      )
    }

    const passwordHash = await hashPassword(password)
    const user = await db.user.create({
      data: {
        email,
        name: name || null,
        passwordHash,
      },
    })

    // Auto-seed the default Notion template page for new users
    await ensureTemplatePage(user.id)

    return NextResponse.json({ ok: true, userId: user.id })
  } catch (err) {
    console.error('[register] error', err)
    return NextResponse.json(
      { error: 'No se pudo crear la cuenta' },
      { status: 500 }
    )
  }
}
