'use client'

import { useSession } from 'next-auth/react'

/**
 * True for the app admins (Tania and Lucas): they can share and use
 * «Cómputo y presupuesto». Only hides things on screen; the server checks
 * it again on every request.
 */
export function useEsAdmin(): boolean {
  const { data } = useSession()
  return data?.user?.esAdmin === true
}
