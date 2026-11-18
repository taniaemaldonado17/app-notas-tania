'use client'

import { useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { ArrowLeft, FileUp, Loader2, Upload } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { useDb } from '@/components/db/db-context'
import {
  buildImport,
  decodeText,
  guessColumn,
  guessTitleColumn,
  IMPORTABLE_TYPES,
  MAX_IMPORT_ROWS,
  parseTable,
  titleFromFileName,
  type ColumnGuess,
  type ColumnTarget,
  type ParsedTable,
} from '@/lib/db-import'
import {
  isComputed,
  NUMBER_FORMAT_LABELS,
  PROPERTY_TYPE_LABELS,
  type DatabaseDef,
  type NumberFormat,
  type PropertyType,
} from '@/lib/db-types'
import { cn } from '@/lib/utils'

type ColumnState = {
  /** 'skip' | 'new' | an existing property id (append mode) */
  target: string
  name: string
  type: PropertyType
  numberFormat?: NumberFormat
}

type Loaded = {
  source: string
  table: ParsedTable
  guesses: ColumnGuess[]
}

/**
 * Import a CSV / TSV file (Notion, Excel, Google Sheets) or a table pasted
 * from a spreadsheet. Without `target` it creates a new database on the
 * page; with `target` it appends the rows to that database.
 */
export function ImportDialog({
  open,
  onOpenChange,
  target,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  target?: DatabaseDef
}) {
  const { ws } = useDb()
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [pasted, setPasted] = useState('')
  const [dragging, setDragging] = useState(false)
  const [title, setTitle] = useState('')
  const [titleCol, setTitleCol] = useState(0)
  const [columns, setColumns] = useState<ColumnState[]>([])
  const [busy, setBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const existingProps = useMemo(
    () => (target ? target.properties.filter((p) => p.type !== 'title' && !isComputed(p.type) && p.type !== 'relation' && p.type !== 'person') : []),
    [target]
  )

  function reset() {
    setLoaded(null)
    setPasted('')
    setColumns([])
    setTitle('')
    setBusy(false)
  }

  function close(v: boolean) {
    if (busy) return
    onOpenChange(v)
    if (!v) reset()
  }

  function load(text: string, source: string) {
    const table = parseTable(text)
    if (!table || table.headers.length === 0) {
      toast.error('No se encontraron datos en la tabla')
      return
    }
    if (table.rows.length === 0) {
      toast.error('La tabla solo tiene encabezados, no hay filas para importar')
      return
    }
    const guesses = table.headers.map((h, i) => guessColumn(h, table.rows.map((r) => r[i])))
    const tCol = guessTitleColumn(table.headers, guesses)
    setTitleCol(tCol)
    setTitle(titleFromFileName(source))
    setColumns(
      table.headers.map((h, i) => {
        const g = guesses[i]
        const match = existingProps.find((p) => p.name.trim().toLowerCase() === h.trim().toLowerCase())
        return {
          target: match ? match.id : 'new',
          name: h,
          type: g.type,
          numberFormat: g.numberFormat,
        }
      })
    )
    setLoaded({ source, table, guesses })
  }

  async function readFile(file: File) {
    if (/\.(xlsx|xls|numbers|ods)$/i.test(file.name)) {
      toast.error('Guardá la planilla como CSV (Archivo → Guardar como → CSV UTF-8) o copiá las celdas y pegalas acá.', {
        duration: 8000,
      })
      return
    }
    if (file.size > 20 * 1024 * 1024) {
      toast.error('El archivo es demasiado grande (máximo 20 MB)')
      return
    }
    const text = decodeText(await file.arrayBuffer())
    load(text, file.name)
  }

  function patchColumn(i: number, patch: Partial<ColumnState>) {
    setColumns((cols) => cols.map((c, j) => (j === i ? { ...c, ...patch } : c)))
  }

  const rowCount = loaded ? Math.min(loaded.table.rows.length, MAX_IMPORT_ROWS) : 0

  async function runImport() {
    if (!loaded) return
    const targets: ColumnTarget[] = columns.map((c, i) => {
      if (i === titleCol) return { kind: 'title' }
      if (c.target === 'skip') return { kind: 'skip' }
      if (c.target === 'new') return { kind: 'new', name: c.name, type: c.type, numberFormat: c.type === 'number' ? c.numberFormat : undefined }
      return { kind: 'existing', propertyId: c.target }
    })
    // Guesses drive cell parsing; keep each column's parsing hints.
    const result = buildImport(loaded.table, targets, loaded.guesses, target?.properties ?? [])
    setBusy(true)
    try {
      if (target) {
        await ws.importDatabase({
          databaseId: target.id,
          properties: result.properties,
          rows: result.rows,
          addToViews: result.createdPropertyIds,
        })
      } else {
        await ws.importDatabase({ title: title.trim() || 'Base importada', properties: result.properties, rows: result.rows })
      }
      toast.success(`${result.rows.length} ${result.rows.length === 1 ? 'fila importada' : 'filas importadas'}`)
      onOpenChange(false)
      reset()
    } catch (err) {
      setBusy(false)
      toast.error(err instanceof Error ? err.message : 'No se pudo importar la tabla')
    }
  }

  const field = 'h-8 rounded-md bg-muted/60 px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring'

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="flex max-h-[90vh] min-w-0 flex-col sm:max-w-3xl [&>*]:min-w-0">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileUp className="h-5 w-5 text-primary" />
            {target ? `Importar filas a «${target.title}»` : 'Importar tabla'}
          </DialogTitle>
          <DialogDescription>
            {loaded
              ? `${loaded.table.rows.length} filas y ${loaded.table.headers.length} columnas en ${loaded.source}. Revisá el tipo de cada columna.`
              : 'Subí un CSV exportado de Notion, Excel o Google Sheets, o pegá las celdas copiadas de una planilla.'}
          </DialogDescription>
        </DialogHeader>

        {!loaded ? (
          <div className="space-y-4">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault()
                setDragging(true)
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault()
                setDragging(false)
                const f = e.dataTransfer.files[0]
                if (f) readFile(f)
              }}
              className={cn(
                'flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border px-4 py-10 text-sm text-muted-foreground transition hover:bg-accent/40 hover:text-foreground',
                dragging && 'border-primary bg-primary/5 text-foreground'
              )}
            >
              <Upload className="h-6 w-6" />
              <span className="font-medium text-foreground">Elegí un archivo CSV o arrastralo acá</span>
              <span className="text-xs">.csv · .tsv · .txt — en Notion: ··· → Exportar → Markdown y CSV</span>
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values,text/plain"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                e.target.value = ''
                if (f) readFile(f)
              }}
            />
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">O pegá la tabla (con la fila de encabezados)</p>
              <textarea
                value={pasted}
                onChange={(e) => setPasted(e.target.value)}
                rows={5}
                placeholder={'Nombre\tFecha\tMonto\nCompra materiales\t15/03/2026\t$ 1.500'}
                className="w-full resize-y rounded-md bg-muted/60 p-2 font-mono text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              <div className="flex justify-end">
                <Button size="sm" variant="secondary" disabled={!pasted.trim()} onClick={() => load(pasted, 'el texto pegado')}>
                  Usar texto pegado
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
            <div className="grid gap-3 sm:grid-cols-2">
              {!target && (
                <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                  Nombre de la base
                  <input value={title} onChange={(e) => setTitle(e.target.value)} className={cn(field, 'text-foreground')} />
                </label>
              )}
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                Columna de título (nombre de cada fila)
                <select value={titleCol} onChange={(e) => setTitleCol(Number(e.target.value))} className={cn(field, 'text-foreground')}>
                  {loaded.table.headers.map((h, i) => (
                    <option key={i} value={i}>
                      {h}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="overflow-hidden rounded-lg border border-border">
              <div className="grid grid-cols-[minmax(0,1.2fr)_minmax(0,1.4fr)_minmax(0,1fr)] gap-2 border-b border-border bg-muted/40 px-3 py-1.5 text-[11px] font-medium text-muted-foreground">
                <span>Columna</span>
                <span>{target ? 'Va a' : 'Tipo'}</span>
                <span>Ejemplo</span>
              </div>
              <ul className="divide-y divide-border">
                {loaded.table.headers.map((h, i) => {
                  const c = columns[i]
                  if (!c) return null
                  const isTitle = i === titleCol
                  const sample = loaded.table.rows.map((r) => r[i]).filter(Boolean).slice(0, 2).join(' · ')
                  const skipped = !isTitle && c.target === 'skip'
                  return (
                    <li
                      key={i}
                      className={cn(
                        'grid grid-cols-[minmax(0,1.2fr)_minmax(0,1.4fr)_minmax(0,1fr)] items-center gap-2 px-3 py-1.5 text-sm',
                        skipped && 'opacity-50'
                      )}
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <input
                          type="checkbox"
                          checked={isTitle || c.target !== 'skip'}
                          disabled={isTitle}
                          onChange={(e) => {
                            if (e.target.checked) {
                              const match = existingProps.find((p) => p.name.trim().toLowerCase() === h.trim().toLowerCase())
                              patchColumn(i, { target: match ? match.id : 'new' })
                            } else {
                              patchColumn(i, { target: 'skip' })
                            }
                          }}
                          aria-label={`Importar la columna ${h}`}
                          className="h-3.5 w-3.5 shrink-0 accent-primary"
                        />
                        {target || isTitle ? (
                          <span className="truncate" title={h}>
                            {h}
                          </span>
                        ) : (
                          <input
                            value={c.name}
                            disabled={skipped}
                            onChange={(e) => patchColumn(i, { name: e.target.value })}
                            className="min-w-0 flex-1 truncate rounded bg-transparent px-1 py-0.5 outline-none hover:bg-muted/60 focus:bg-muted/60"
                            aria-label={`Nombre de la columna ${h}`}
                          />
                        )}
                      </span>
                      <span className="flex min-w-0 items-center gap-1">
                        {isTitle ? (
                          <span className="px-1 text-xs text-muted-foreground">Título</span>
                        ) : (
                          <>
                            {target && (
                              <select
                                value={c.target}
                                onChange={(e) => patchColumn(i, { target: e.target.value })}
                                className={cn(field, 'h-7 min-w-0 flex-1 text-xs')}
                                aria-label={`Destino de ${h}`}
                              >
                                <option value="new">+ Columna nueva</option>
                                {existingProps.map((p) => (
                                  <option key={p.id} value={p.id}>
                                    {p.name} ({PROPERTY_TYPE_LABELS[p.type]})
                                  </option>
                                ))}
                                <option value="skip">No importar</option>
                              </select>
                            )}
                            {(!target || c.target === 'new') && c.target !== 'skip' && (
                              <select
                                value={c.type}
                                onChange={(e) => patchColumn(i, { type: e.target.value as PropertyType })}
                                className={cn(field, 'h-7 min-w-0 flex-1 text-xs')}
                                aria-label={`Tipo de ${h}`}
                              >
                                {IMPORTABLE_TYPES.map((t) => (
                                  <option key={t} value={t}>
                                    {PROPERTY_TYPE_LABELS[t]}
                                  </option>
                                ))}
                              </select>
                            )}
                            {(!target || c.target === 'new') && c.target !== 'skip' && c.type === 'number' && (
                              <select
                                value={c.numberFormat ?? 'number'}
                                onChange={(e) => patchColumn(i, { numberFormat: e.target.value as NumberFormat })}
                                className={cn(field, 'h-7 w-24 shrink-0 text-xs')}
                                aria-label={`Formato de ${h}`}
                              >
                                {(Object.keys(NUMBER_FORMAT_LABELS) as NumberFormat[]).map((f) => (
                                  <option key={f} value={f}>
                                    {NUMBER_FORMAT_LABELS[f]}
                                  </option>
                                ))}
                              </select>
                            )}
                          </>
                        )}
                      </span>
                      <span className="truncate text-xs text-muted-foreground" title={sample}>
                        {sample || '—'}
                      </span>
                    </li>
                  )
                })}
              </ul>
            </div>
            {loaded.table.rows.length > MAX_IMPORT_ROWS && (
              <p className="text-xs text-destructive">
                El archivo tiene {loaded.table.rows.length} filas; se importan las primeras {MAX_IMPORT_ROWS}.
              </p>
            )}
          </div>
        )}

        {loaded && (
          <DialogFooter className="gap-2 sm:justify-between">
            <Button variant="ghost" size="sm" onClick={reset} disabled={busy}>
              <ArrowLeft className="h-4 w-4" />
              Otro archivo
            </Button>
            <Button size="sm" onClick={runImport} disabled={busy}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              Importar {rowCount} {rowCount === 1 ? 'fila' : 'filas'}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  )
}
