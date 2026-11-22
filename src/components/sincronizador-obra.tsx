'use client'

import { useEffect } from 'react'
import { toast } from 'sonner'
import * as offline from '@/lib/presupuesto/offline'

/** Clears everything kept on the device for offline work (on logout). */
export async function borrarDatosOffline() {
  await offline.borrarTodo()
  try {
    for (const k of await caches.keys()) await caches.delete(k)
  } catch {
    // Cache Storage unavailable
  }
}

/**
 * Runs once in the app: installs the service worker (opens the app without
 * connection) and uploads budget changes made offline as soon as there's
 * connection, even if the budget isn't open.
 */
export function SincronizadorObra() {
  useEffect(() => {
    if (process.env.NODE_ENV === 'production' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch((err) => console.warn('service worker', err))
    }

    const subir = () => {
      if (navigator.onLine) void offline.subirTodo()
    }
    subir()
    window.addEventListener('online', subir)
    // Signal in the field comes and goes without "online" events; retry every minute.
    const timer = window.setInterval(subir, 60_000)

    const off = offline.suscribirAvisos((a) => {
      if (a.tipo === 'rechazado') {
        toast.error(`No se pudo subir un cambio del presupuesto: ${a.mensaje}`, { duration: 10_000 })
      } else if (a.trasCorte && a.cantidad) {
        toast.success(
          a.cantidad === 1 ? 'Se subió el cambio hecho sin conexión' : `Se subieron ${a.cantidad} cambios hechos sin conexión`
        )
      }
    })
    return () => {
      window.removeEventListener('online', subir)
      window.clearInterval(timer)
      off()
    }
  }, [])
  return null
}
