import { randomBytes } from 'node:crypto'
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getAuthUserId } from '@/lib/auth-helpers'

const newToken = () => randomBytes(24).toString('base64url')

function feedPath(token: string) {
  return `/api/calendar/ics/${token}`
}

/** Returns the user's calendar feed path, creating the secret on first use. */
export async function GET() {
  const userId = await getAuthUserId()
  if (!userId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const user = await db.user.findUnique({ where: { id: userId }, select: { calendarToken: true } })
  let token = user?.calendarToken
  if (!token) {
    token = newToken()
    await db.user.update({ where: { id: userId }, data: { calendarToken: token } })
  }
  return NextResponse.json({ path: feedPath(token) })
}

/** Regenerates the secret: the old subscription link stops working. */
export async function POST() {
  const userId = await getAuthUserId()
  if (!userId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const token = newToken()
  await db.user.update({ where: { id: userId }, data: { calendarToken: token } })
  return NextResponse.json({ path: feedPath(token) })
}
