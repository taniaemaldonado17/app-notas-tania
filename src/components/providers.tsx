'use client'

import { SessionProvider } from 'next-auth/react'

export function Providers({ children }: { children: React.ReactNode }) {
  // No session re-check on tab focus: without connection that check fails and
  // next-auth treats it as logged out (the login screen would replace the
  // budget being edited offline). An expired session still shows up as a 401
  // on the next request.
  return <SessionProvider refetchOnWindowFocus={false}>{children}</SessionProvider>
}
