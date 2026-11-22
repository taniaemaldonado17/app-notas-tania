'use client'

import { useEffect, useState } from 'react'
import { CloudCheck, CloudOff, CloudUpload, Loader2, LogIn } from 'lucide-react'
import { cn } from '@/lib/utils'
import { usePresupuesto } from './presupuesto-context'

function useEnLinea() {
  const [enLinea, setEnLinea] = useState(true)
  useEffect(() => {
    setEnLinea(navigator.onLine)
    const on = () => setEnLinea(true)
    const off = () => setEnLinea(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])
  return enLinea
}

/** Header pill: whether the budget's changes are on the server or still on the device. */
export function EstadoSincro() {
  const { estado, sincronizar } = usePresupuesto()
  const enLinea = useEnLinea()
  const n = estado.pendientes
  const sinSubir = `${n} ${n === 1 ? 'cambio' : 'cambios'} sin subir`

  let icono = <CloudCheck className="h-4 w-4" />
  let texto = 'Guardado'
  let detalle = 'Todos los cambios están guardados en el servidor.'
  let tono = 'text-muted-foreground'

  if (estado.subiendo && n) {
    icono = <Loader2 className="h-4 w-4 animate-spin" />
    texto = 'Subiendo…'
    detalle = `Subiendo ${sinSubir.replace(' sin subir', '')}.`
  } else if (!enLinea || estado.sinConexion) {
    icono = <CloudOff className="h-4 w-4" />
    texto = n ? `Sin conexión · ${n}` : 'Sin conexión'
    detalle = n
      ? `Sin conexión. ${sinSubir}: quedan guardados en este dispositivo y se suben solos cuando vuelva la señal.`
      : 'Sin conexión. Podés seguir trabajando: los cambios se guardan en este dispositivo y se suben solos cuando vuelva la señal.'
    tono = 'text-amber-600 dark:text-amber-400'
  } else if (estado.sinSesion && n) {
    icono = <LogIn className="h-4 w-4" />
    texto = `Iniciá sesión · ${n}`
    detalle = `Tu sesión venció. ${sinSubir}: volvé a iniciar sesión para subirlos (no se pierden).`
    tono = 'text-amber-600 dark:text-amber-400'
  } else if (n) {
    icono = <CloudUpload className="h-4 w-4" />
    texto = `${n} sin subir`
    detalle = `${sinSubir}. Tocá para subirlos ahora.`
    tono = 'text-amber-600 dark:text-amber-400'
  }

  return (
    <button
      type="button"
      onClick={() => void sincronizar()}
      title={detalle}
      aria-label={detalle}
      className={cn('flex h-8 shrink-0 items-center gap-1.5 rounded-full px-2 text-xs font-medium transition hover:bg-accent', tono)}
    >
      {icono}
      <span className="hidden whitespace-nowrap md:inline">{texto}</span>
    </button>
  )
}
