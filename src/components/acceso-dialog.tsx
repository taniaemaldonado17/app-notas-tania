'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Calculator, Loader2 } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Switch } from '@/components/ui/switch'
import * as api from '@/lib/api'

/**
 * Per person, which of my pages they can open. Turning one off removes their
 * access (same as "Quitar" in Compartir); turning it on gives it back.
 */
export function AccesoDialog({
  open,
  onOpenChange,
  onChanged,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  onChanged: () => void
}) {
  const [data, setData] = useState<api.AccesoData | null>(null)
  const [guardando, setGuardando] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    try {
      setData(await api.fetchAcceso())
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo cargar quién tiene acceso')
    }
  }, [])

  useEffect(() => {
    if (open) void cargar()
  }, [open, cargar])

  /** Turning off the last thing they see: they'd drop off this list. */
  const esLoUltimo = (p: api.AccesoData['personas'][number]) => p.paginas.length + (p.cyp ? 1 : 0) === 1

  async function cambiar(userId: string, pageId: string, acceso: boolean) {
    const persona = data?.personas.find((p) => p.id === userId)
    if (
      !acceso &&
      persona &&
      esLoUltimo(persona) &&
      !window.confirm(
        `Es lo último tuyo que ve ${persona.name || persona.email}. Si se lo quitás deja de aparecer acá, y para volver a compartirle algo vas a tener que invitarlo con un link desde «Compartir».\n\n¿Quitar igual?`
      )
    ) {
      return
    }
    const clave = `${userId}:${pageId}`
    setGuardando(clave)
    // Optimistic: the switch moves right away.
    setData((d) =>
      d && {
        ...d,
        personas: d.personas.map((p) =>
          p.id !== userId ? p : { ...p, paginas: acceso ? [...p.paginas, pageId] : p.paginas.filter((x) => x !== pageId) }
        ),
      }
    )
    try {
      await api.cambiarAcceso(userId, pageId, acceso)
      onChanged()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo cambiar el acceso')
      void cargar()
    } finally {
      setGuardando(null)
    }
  }

  async function cambiarCyp(userId: string, acceso: boolean) {
    const persona = data?.personas.find((p) => p.id === userId)
    if (
      !acceso &&
      persona &&
      esLoUltimo(persona) &&
      !window.confirm(
        `Es lo último tuyo que ve ${persona.name || persona.email}. Si se lo quitás deja de aparecer acá, y para volver a compartirle algo vas a tener que invitarlo con un link desde «Compartir».\n\n¿Quitar igual?`
      )
    ) {
      return
    }
    const clave = `${userId}:cyp`
    setGuardando(clave)
    setData((d) => d && { ...d, personas: d.personas.map((p) => (p.id !== userId ? p : { ...p, cyp: acceso })) })
    try {
      await api.cambiarAccesoCyp(userId, acceso)
      onChanged()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo cambiar el acceso')
      void cargar()
    } finally {
      setGuardando(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Personas con acceso</DialogTitle>
          <DialogDescription>
            Cada persona ve solo lo tuyo que tenga activado acá: páginas y la sección Cómputo y presupuesto. Lo que crea cada uno es
            privado hasta que lo comparta. Para sumar a alguien nuevo, invitalo desde «Compartir» en una página.
          </DialogDescription>
        </DialogHeader>

        {!data ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : data.personas.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Todavía no compartiste ninguna página.</p>
        ) : (
          <div className="space-y-5">
            {data.personas.map((persona) => (
              <section key={persona.id} className="rounded-xl border border-border">
                <header className="flex items-baseline justify-between gap-3 border-b border-border px-4 py-3">
                  <div className="min-w-0">
                    <div className="truncate font-medium">{persona.name || persona.email}</div>
                    {persona.name && <div className="truncate text-xs text-muted-foreground">{persona.email}</div>}
                  </div>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    ve {persona.paginas.length} de {data.paginas.length} páginas{persona.cyp ? ' y tus CyP' : ''}
                  </span>
                </header>
                <ul className="divide-y divide-border">
                  <li className="bg-muted/30">
                    <label className="flex cursor-pointer items-center gap-3 px-4 py-2.5">
                      <Calculator className="h-4 w-6 shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-1 text-sm">
                        Cómputo y presupuesto
                        <span className="block text-xs text-muted-foreground">Todos tus CyP, con o sin proyecto</span>
                      </span>
                      {guardando === `${persona.id}:cyp` && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
                      <Switch
                        checked={persona.cyp}
                        disabled={guardando === `${persona.id}:cyp`}
                        onCheckedChange={(v) => void cambiarCyp(persona.id, v)}
                        aria-label={`${persona.name || persona.email} ve tu sección Cómputo y presupuesto`}
                      />
                    </label>
                  </li>
                  {data.paginas.map((pagina) => {
                    const tiene = persona.paginas.includes(pagina.id)
                    const clave = `${persona.id}:${pagina.id}`
                    return (
                      <li key={pagina.id}>
                        <label className="flex cursor-pointer items-center gap-3 px-4 py-2.5">
                          <span className="w-6 shrink-0 text-center">{pagina.icon || '📄'}</span>
                          <span className="min-w-0 flex-1 truncate text-sm">{pagina.title}</span>
                          {guardando === clave && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
                          <Switch
                            checked={tiene}
                            disabled={guardando === clave}
                            onCheckedChange={(v) => void cambiar(persona.id, pagina.id, v)}
                            aria-label={`${persona.name || persona.email} ve «${pagina.title}»`}
                          />
                        </label>
                      </li>
                    )
                  })}
                </ul>
              </section>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
