'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Check, Copy, Link2, Loader2, LogOut, X } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import * as api from '@/lib/api'
import type { ShareInfo, SharePerson } from '@/lib/types'
import { formatDateAR } from '@/lib/utils'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  pageId: string
  pageTitle: string
  currentUserId: string | undefined
  /** Called after access changes (member removed, user left). */
  onChanged: () => void
  onLeft: () => void
}

function displayName(p: SharePerson) {
  return p.name || p.email
}

function Avatar({ person }: { person: SharePerson }) {
  return (
    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold">
      {displayName(person).charAt(0).toUpperCase()}
    </span>
  )
}

export function ShareDialog({
  open,
  onOpenChange,
  pageId,
  pageTitle,
  currentUserId,
  onChanged,
  onLeft,
}: Props) {
  const [info, setInfo] = useState<ShareInfo | null>(null)
  const [loading, setLoading] = useState(false)
  const [creating, setCreating] = useState(false)
  const [newLink, setNewLink] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setInfo(await api.fetchShare(pageId))
    } catch {
      toast.error('No se pudo cargar quién tiene acceso')
    } finally {
      setLoading(false)
    }
  }, [pageId])

  useEffect(() => {
    if (open) {
      setNewLink(null)
      load()
    }
  }, [open, load])

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(text)
      setTimeout(() => setCopied((c) => (c === text ? null : c)), 2000)
    } catch {
      toast.error('No se pudo copiar; seleccioná el enlace y copialo a mano')
    }
  }

  async function handleCreateInvite() {
    setCreating(true)
    try {
      const invite = await api.createInvite(pageId)
      const url = api.inviteUrl(invite.token)
      setNewLink(url)
      setInfo((i) => (i ? { ...i, invites: [invite, ...i.invites] } : i))
      await copy(url)
      toast.success('Enlace creado y copiado')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo crear el enlace')
    } finally {
      setCreating(false)
    }
  }

  async function handleRevoke(token: string) {
    try {
      await api.revokeInvite(token)
      setInfo((i) => (i ? { ...i, invites: i.invites.filter((x) => x.token !== token) } : i))
      if (newLink?.endsWith(token)) setNewLink(null)
      toast.success('Invitación anulada')
    } catch {
      toast.error('No se pudo anular la invitación')
    }
  }

  async function handleRemove(member: SharePerson) {
    const ok = window.confirm(`¿Quitarle el acceso a ${displayName(member)}?`)
    if (!ok) return
    try {
      await api.removeMember(pageId, member.id)
      setInfo((i) => (i ? { ...i, members: i.members.filter((m) => m.id !== member.id) } : i))
      onChanged()
      toast.success('Acceso quitado')
    } catch {
      toast.error('No se pudo quitar el acceso')
    }
  }

  async function handleLeave() {
    const ok = window.confirm(
      `¿Salir de "${pageTitle}"?\n\nDejás de verla. Para volver, te tienen que invitar de nuevo.`
    )
    if (!ok) return
    try {
      await api.removeMember(pageId, 'me')
      onOpenChange(false)
      onLeft()
      toast.success('Saliste de la página')
    } catch {
      toast.error('No se pudo salir de la página')
    }
  }

  const isOwner = info?.isOwner ?? false
  const canInvite = info?.canInvite ?? false

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-0 p-0 sm:max-w-md">
        <div className="border-b border-border px-5 py-4">
          <DialogTitle className="text-base">Compartir</DialogTitle>
          <DialogDescription className="mt-0.5 truncate text-xs">
            {pageTitle}
          </DialogDescription>
        </div>

        {loading && !info ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : info ? (
          <div className="max-h-[70vh] space-y-5 overflow-y-auto px-5 py-4">
            {/* Invite (owner and app admin only) */}
            {isOwner && !canInvite && (
              <p className="rounded-md bg-muted/50 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
                Solo las administradoras de la app pueden invitar a otras personas.
              </p>
            )}
            {canInvite && (
              <section className="space-y-2">
                <Button
                  onClick={handleCreateInvite}
                  disabled={creating}
                  className="w-full gap-2"
                >
                  {creating ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Link2 className="h-4 w-4" />
                  )}
                  Crear enlace de invitación
                </Button>
                {newLink && (
                  <div className="flex items-center gap-1 rounded-md border border-border bg-muted/40 p-1 pl-2">
                    <input
                      readOnly
                      value={newLink}
                      onFocus={(e) => e.currentTarget.select()}
                      className="min-w-0 flex-1 bg-transparent text-xs outline-none"
                      aria-label="Enlace de invitación"
                    />
                    <Button
                      size="sm"
                      variant="secondary"
                      className="h-7 gap-1 px-2 text-xs"
                      onClick={() => copy(newLink)}
                    >
                      {copied === newLink ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                      {copied === newLink ? 'Copiado' : 'Copiar'}
                    </Button>
                  </div>
                )}
                <p className="text-xs leading-relaxed text-muted-foreground">
                  Mandale el enlace a la persona que quieras invitar. Sirve para una sola
                  persona y vence en 7 días. Con él puede crear su cuenta o entrar con la que
                  ya tiene, y va a poder ver y editar esta página.
                </p>
              </section>
            )}

            {/* People with access */}
            <section className="space-y-2">
              <h3 className="text-xs font-medium text-muted-foreground">
                Personas con acceso
              </h3>
              <ul className="space-y-2">
                <li className="flex items-center gap-2.5">
                  <Avatar person={info.owner} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm">
                      {displayName(info.owner)}
                      {info.owner.id === currentUserId && (
                        <span className="text-muted-foreground"> (vos)</span>
                      )}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">{info.owner.email}</p>
                  </div>
                  <span className="shrink-0 text-xs text-muted-foreground">Creó la página</span>
                </li>
                {info.members.map((m) => (
                  <li key={m.id} className="flex items-center gap-2.5">
                    <Avatar person={m} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm">
                        {displayName(m)}
                        {m.id === currentUserId && (
                          <span className="text-muted-foreground"> (vos)</span>
                        )}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">{m.email}</p>
                    </div>
                    {isOwner ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 shrink-0 px-2 text-xs text-muted-foreground hover:text-destructive"
                        onClick={() => handleRemove(m)}
                      >
                        Quitar
                      </Button>
                    ) : (
                      <span className="shrink-0 text-xs text-muted-foreground">Puede editar</span>
                    )}
                  </li>
                ))}
              </ul>
            </section>

            {/* Pending invitations (owner only) */}
            {isOwner && info.invites.length > 0 && (
              <section className="space-y-2">
                <h3 className="text-xs font-medium text-muted-foreground">
                  Invitaciones sin usar
                </h3>
                <ul className="space-y-1">
                  {info.invites.map((inv) => {
                    const url = api.inviteUrl(inv.token)
                    return (
                      <li
                        key={inv.token}
                        className="flex items-center gap-2 rounded-md px-1 py-1 text-xs hover:bg-accent/40"
                      >
                        <Link2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        <span className="min-w-0 flex-1 truncate text-muted-foreground">
                          Creada {formatDateAR(inv.createdAt)} · vence {formatDateAR(inv.expiresAt)}
                        </span>
                        <button
                          type="button"
                          onClick={() => copy(url)}
                          className="shrink-0 rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                          aria-label="Copiar enlace"
                          title="Copiar enlace"
                        >
                          {copied === url ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRevoke(inv.token)}
                          className="shrink-0 rounded p-1 text-muted-foreground hover:bg-accent hover:text-destructive"
                          aria-label="Anular invitación"
                          title="Anular invitación"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </section>
            )}

            {!isOwner && (
              <Button
                variant="ghost"
                onClick={handleLeave}
                className="w-full gap-2 text-destructive hover:text-destructive"
              >
                <LogOut className="h-4 w-4" />
                Salir de esta página
              </Button>
            )}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
