'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import type { Operacion } from '@/lib/presupuesto/editar'
import { derivarDetalle, type Snapshot } from '@/lib/presupuesto/local'
import * as offline from '@/lib/presupuesto/offline'
import type { PresupuestoDetalle } from '@/lib/presupuesto/types'

type Valor = {
  id: string
  estado: offline.EstadoSync
  /** Copy on the device with pending changes applied. */
  vista: Snapshot | null
  detalle: PresupuestoDetalle | null
  /** Applies a change (works offline); null if it can't be applied. */
  editar: (op: Operacion) => Promise<{ id?: string } | null>
  sincronizar: () => Promise<void>
}

const Ctx = createContext<Valor | null>(null)

/** Budget kept on the device: every screen of the budget reads and edits through this. */
export function PresupuestoProvider({
  id,
  onSubido,
  children,
}: {
  id: string
  /** Changes reached the server (the project row's total changed). */
  onSubido?: () => void
  children: React.ReactNode
}) {
  const [estado, setEstado] = useState(() => offline.leerEstado(id))

  useEffect(() => {
    setEstado(offline.leerEstado(id))
    const off = offline.suscribir(id, setEstado)
    void offline.cargar(id)
    // Refresh when coming back to the app or getting connection back.
    const refrescar = () => {
      if (document.visibilityState === 'visible') void offline.sincronizar(id)
    }
    window.addEventListener('online', refrescar)
    document.addEventListener('visibilitychange', refrescar)
    return () => {
      off()
      window.removeEventListener('online', refrescar)
      document.removeEventListener('visibilitychange', refrescar)
    }
  }, [id])

  useEffect(
    () => offline.suscribirAvisos((a) => a.presupuestoId === id && a.tipo === 'subido' && onSubido?.()),
    [id, onSubido]
  )

  const detalle = useMemo(() => (estado.vista ? derivarDetalle(estado.vista) : null), [estado.vista])

  const editar = useCallback(
    async (op: Operacion) => {
      try {
        return { id: await offline.editar(id, op) }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'No se pudo guardar el cambio')
        return null
      }
    },
    [id]
  )
  const sincronizar = useCallback(() => offline.sincronizar(id), [id])

  const valor = useMemo(
    () => ({ id, estado, vista: estado.vista, detalle, editar, sincronizar }),
    [id, estado, detalle, editar, sincronizar]
  )
  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>
}

export function usePresupuesto(): Valor {
  const v = useContext(Ctx)
  if (!v) throw new Error('usePresupuesto fuera de PresupuestoProvider')
  return v
}
