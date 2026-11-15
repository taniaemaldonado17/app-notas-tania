'use client'

import { use, useEffect, useState } from 'react'
import { signOut, useSession } from 'next-auth/react'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import { AuthScreen } from '@/components/auth-screen'
import { Button } from '@/components/ui/button'
import * as api from '@/lib/api'
import type { InviteInfo } from '@/lib/types'

const LAST_PAGE_KEY = 'notas:lastPageId'

const REASONS: Record<string, string> = {
  not_found: 'Este enlace de invitación no existe.',
  used: 'Este enlace de invitación ya se usó.',
  expired: 'Este enlace de invitación venció.',
}

/** Landing page for an invitation link: sign in or sign up, then join. */
export default function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params)
  const { data: session, status } = useSession()
  const [invite, setInvite] = useState<InviteInfo | null>(null)
  const [joining, setJoining] = useState(false)

  useEffect(() => {
    api
      .fetchInvite(token)
      .then(setInvite)
      .catch(() => setInvite({ valid: false, reason: 'not_found' }))
  }, [token])

  async function join() {
    setJoining(true)
    try {
      const { pageId } = await api.acceptInvite(token)
      try {
        window.localStorage.setItem(LAST_PAGE_KEY, pageId)
      } catch {
        // not important
      }
      // Full reload on purpose: the app starts fresh with the new session.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.href = '/'
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo aceptar la invitación')
      setJoining(false)
    }
  }

  if (!invite || status === 'loading') {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!invite.valid) {
    return (
      <Centered>
        <h1 className="text-lg font-semibold">Invitación no disponible</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {REASONS[invite.reason]} Pedile a quien te invitó que te mande uno nuevo.
        </p>
        <Button asChild variant="secondary" className="mt-5">
          <a href="/">Ir al inicio</a>
        </Button>
      </Centered>
    )
  }

  const notice = (
    <div className="mb-5 rounded-md border border-border bg-muted/40 p-3 text-sm">
      <p>
        <span className="font-medium">{invite.invitedBy}</span> te invitó a colaborar en
      </p>
      <p className="mt-1 flex items-center gap-1.5 font-semibold">
        {invite.pageIcon && <span>{invite.pageIcon}</span>}
        {invite.pageTitle}
      </p>
    </div>
  )

  if (status !== 'authenticated') {
    return <AuthScreen inviteToken={token} notice={notice} onSignedIn={join} />
  }

  return (
    <Centered>
      {notice}
      <p className="text-sm text-muted-foreground">
        Vas a entrar como <span className="text-foreground">{session.user?.email}</span>.
      </p>
      <Button onClick={join} disabled={joining} className="mt-4 w-full">
        {joining && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        Unirme a la página
      </Button>
      <button
        type="button"
        onClick={() => signOut({ redirect: false }).then(() => window.location.reload())}
        className="mt-3 text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
      >
        No soy yo, usar otra cuenta
      </button>
    </Centered>
  )
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-background p-4">
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-8 text-center shadow-xl">
        {children}
      </div>
    </div>
  )
}
