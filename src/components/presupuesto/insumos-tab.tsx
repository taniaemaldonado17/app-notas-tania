'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Loader2, Plus, Search, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import * as api from '@/lib/api'
import { NOMBRES_TIPO, TIPOS_INSUMO, type TipoInsumo } from '@/lib/presupuesto/calculo'
import { fmtARS, fmtNumFino, fmtPct, parseNumeroAR } from '@/lib/presupuesto/format'
import type { InsumoFila } from '@/lib/presupuesto/types'
import { cn } from '@/lib/utils'
import { CampoNumero, CampoTexto, num, td, tdEdit, th, TipoBadge, useEditar } from './campos'

export function InsumosTab({
  presupuestoId,
  cargas,
  coef,
  onChanged,
}: {
  presupuestoId: string
  cargas: number
  coef: number
  onChanged: () => void
}) {
  const [insumos, setInsumos] = useState<InsumoFila[] | null>(null)
  const [q, setQ] = useState('')
  const [tipo, setTipo] = useState<TipoInsumo | null>(null)
  const [nuevoOpen, setNuevoOpen] = useState(false)

  const cargar = useCallback(async () => {
    try {
      setInsumos(await api.fetchPresupuestoInsumos(presupuestoId))
    } catch {
      toast.error('No se pudieron cargar los insumos')
    }
  }, [presupuestoId])

  useEffect(() => {
    void cargar()
  }, [cargar])

  const despues = useCallback(() => {
    void cargar()
    onChanged()
  }, [cargar, onChanged])
  const editar = useEditar(presupuestoId, despues)

  const visibles = useMemo(() => {
    const t = q.trim().toLowerCase()
    return (insumos ?? []).filter(
      (i) => (!tipo || i.tipo === tipo) && (!t || i.descripcion.toLowerCase().includes(t) || i.codigo.toLowerCase().includes(t))
    )
  }, [insumos, q, tipo])

  return (
    <div className="mx-auto max-w-7xl space-y-4 px-4 py-6 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Insumos y precios</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Cambiá un precio base y se recalcula todo el presupuesto. Precio de cálculo: mano de obra = base × (1 +{' '}
            {fmtPct(cargas)} de cargas sociales); materiales, equipos y subcontratos = base × {fmtNumFino(coef)}.
          </p>
        </div>
        <Button size="sm" onClick={() => setNuevoOpen(true)}>
          <Plus className="mr-1 h-4 w-4" />
          Nuevo insumo
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <label className="flex h-9 min-w-56 flex-1 items-center gap-2 rounded-lg border border-border bg-background px-3 text-sm sm:max-w-xs">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar insumo o código"
            className="min-w-0 flex-1 bg-transparent outline-none"
          />
        </label>
        {[null, ...TIPOS_INSUMO].map((t) => (
          <button
            key={t ?? 'todos'}
            type="button"
            onClick={() => setTipo(t)}
            className={cn(
              'h-8 rounded-full border px-3 text-xs font-medium transition',
              tipo === t ? 'border-primary bg-primary text-primary-foreground' : 'border-border hover:bg-accent'
            )}
          >
            {t ? NOMBRES_TIPO[t] : 'Todos'}
          </button>
        ))}
      </div>

      {!insumos ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full min-w-[860px] text-sm lg:min-w-[1080px]">
            <thead className="bg-muted/50">
              <tr>
                <th className={cn(th, 'w-28')}>Código</th>
                <th className={cn(th, 'min-w-52')}>Descripción</th>
                <th className={cn(th, 'w-20')}>Un.</th>
                <th className={cn(th, 'w-20 lg:w-24')}>Tipo</th>
                <th className={cn(th, 'w-32 text-right lg:w-36')}>Precio base</th>
                <th className={cn(th, 'text-right')}>Precio de cálculo</th>
                <th className={cn(th, 'text-right')}>Usado en</th>
                <th className={cn(th, 'hidden w-64 lg:table-cell')}>Fuente</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody>
              {visibles.map((i) => (
                <tr key={i.id} className="group border-t border-border/60 hover:bg-accent/20">
                  <td className={tdEdit}>
                    <CampoTexto
                      value={i.codigo}
                      requerido
                      ariaLabel="Código"
                      className="font-medium"
                      onSave={(v) => editar({ op: 'insumo.editar', id: i.id, data: { codigo: v! } })}
                    />
                  </td>
                  <td className={tdEdit}>
                    <CampoTexto
                      value={i.descripcion}
                      requerido
                      ariaLabel="Descripción"
                      onSave={(v) => editar({ op: 'insumo.editar', id: i.id, data: { descripcion: v! } })}
                    />
                  </td>
                  <td className={tdEdit}>
                    <CampoTexto
                      value={i.unidad}
                      ariaLabel="Unidad"
                      onSave={(v) => editar({ op: 'insumo.editar', id: i.id, data: { unidad: v } })}
                    />
                  </td>
                  <td className={tdEdit}>
                    <select
                      value={i.tipo}
                      aria-label="Tipo"
                      onChange={(e) => editar({ op: 'insumo.editar', id: i.id, data: { tipo: e.target.value as TipoInsumo } })}
                      className="h-8 rounded-md border border-transparent bg-transparent px-1 text-xs font-bold hover:border-border focus:border-primary"
                    >
                      {TIPOS_INSUMO.map((t) => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  </td>
                  <td className={tdEdit}>
                    <CampoNumero
                      value={i.precioBase}
                      vacioPermitido={false}
                      ariaLabel={`Precio base de ${i.descripcion}`}
                      onSave={(v) => editar({ op: 'insumo.editar', id: i.id, data: { precioBase: v! } })}
                    />
                  </td>
                  <td className={cn(td, num, 'font-medium')}>{fmtARS(i.precioCalculo)}</td>
                  <td className={cn(td, num, 'text-muted-foreground')}>
                    {i.usos} {i.usos === 1 ? 'ítem' : 'ítems'}
                  </td>
                  <td className={cn(tdEdit, 'hidden lg:table-cell')}>
                    <CampoTexto
                      value={i.fuente}
                      placeholder="Fuente / referencia"
                      className="text-xs text-muted-foreground"
                      onSave={(v) => editar({ op: 'insumo.editar', id: i.id, data: { fuente: v } })}
                    />
                  </td>
                  <td className="pr-1 text-right">
                    <button
                      type="button"
                      title={i.usos ? 'Se usa en análisis de precios: quitalo de ahí antes de eliminarlo' : 'Eliminar insumo'}
                      aria-label="Eliminar insumo"
                      disabled={i.usos > 0}
                      onClick={() => editar({ op: 'insumo.eliminar', id: i.id })}
                      className="rounded p-1.5 text-muted-foreground opacity-0 transition hover:bg-destructive/10 hover:text-destructive focus:opacity-100 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-muted-foreground group-hover:opacity-100 group-hover:disabled:opacity-30 [@media(hover:none)]:opacity-100 [@media(hover:none)]:disabled:opacity-30"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
              {visibles.length === 0 && (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-sm text-muted-foreground">Ningún insumo coincide.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <NuevoInsumoDialog
        open={nuevoOpen}
        onOpenChange={setNuevoOpen}
        onCrear={async (data) => {
          const r = await editar({ op: 'insumo.crear', data })
          if (r) {
            toast.success('Insumo creado')
            setNuevoOpen(false)
          }
        }}
      />
    </div>
  )
}

function NuevoInsumoDialog({
  open,
  onOpenChange,
  onCrear,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  onCrear: (data: { codigo: string; descripcion: string; unidad: string | null; tipo: TipoInsumo; precioBase: number; fuente: string | null }) => Promise<void>
}) {
  const vacio = { codigo: '', descripcion: '', unidad: '', tipo: 'MAT' as TipoInsumo, precio: '', fuente: '' }
  const [f, setF] = useState(vacio)
  const [guardando, setGuardando] = useState(false)
  useEffect(() => {
    if (open) setF(vacio)
  }, [open])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const precio = parseNumeroAR(f.precio)
    if (!f.codigo.trim() || !f.descripcion.trim()) return toast.error('Completá código y descripción')
    if (precio === null || Number.isNaN(precio) || precio < 0) return toast.error('El precio base no es válido')
    setGuardando(true)
    await onCrear({
      codigo: f.codigo.trim(),
      descripcion: f.descripcion.trim(),
      unidad: f.unidad.trim() || null,
      tipo: f.tipo,
      precioBase: precio,
      fuente: f.fuente.trim() || null,
    })
    setGuardando(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>Nuevo insumo</DialogTitle>
            <DialogDescription>Después lo podés usar en el análisis de precio de cualquier ítem.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-[1fr_2fr] gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="ins-codigo">Código</Label>
              <Input id="ins-codigo" value={f.codigo} onChange={(e) => setF({ ...f, codigo: e.target.value })} placeholder="CEM" autoFocus />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ins-desc">Descripción</Label>
              <Input id="ins-desc" value={f.descripcion} onChange={(e) => setF({ ...f, descripcion: e.target.value })} placeholder="Cemento Portland bolsa 50 kg" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ins-un">Unidad</Label>
              <Input id="ins-un" value={f.unidad} onChange={(e) => setF({ ...f, unidad: e.target.value })} placeholder="bolsa" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ins-tipo">Tipo</Label>
              <select
                id="ins-tipo"
                value={f.tipo}
                onChange={(e) => setF({ ...f, tipo: e.target.value as TipoInsumo })}
                className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm"
              >
                {TIPOS_INSUMO.map((t) => (
                  <option key={t} value={t}>{t} — {NOMBRES_TIPO[t]}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ins-precio">Precio base ($)</Label>
              <Input id="ins-precio" inputMode="decimal" value={f.precio} onChange={(e) => setF({ ...f, precio: e.target.value })} placeholder="13000" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ins-fuente">Fuente / referencia</Label>
              <Input id="ins-fuente" value={f.fuente} onChange={(e) => setF({ ...f, fuente: e.target.value })} placeholder="Corralón X, nov-2026" />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={guardando}>
              {guardando && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              Crear insumo
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
