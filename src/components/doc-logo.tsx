'use client'

import { createContext, useRef, useState } from 'react'
import { ImagePlus, Loader2, X } from 'lucide-react'
import { toast } from 'sonner'
import { uploadFile } from '@/lib/api'

/**
 * The editor's ⋮⋮ menu uses this to offer "Usar como logo" on an image that
 * is already in the text (it moves above the title).
 */
export const UseAsLogoContext = createContext<((url: string) => void) | null>(null)

/**
 * Logo above a document's title, like a letterhead: it also goes at the top
 * of the PDF and of shared links. Without one, a discreet "Agregar logo".
 */
export function DocLogo({ url, onChange }: { url: string | null | undefined; onChange: (url: string | null) => void | Promise<void> }) {
  const input = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)

  async function pick(file: File | undefined) {
    if (!file) return
    if (!file.type.startsWith('image/')) {
      toast.error('Elegí una imagen (PNG, JPG, SVG…)')
      return
    }
    setUploading(true)
    try {
      const res = await uploadFile(file)
      await onChange(res.url)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo subir el logo')
    } finally {
      setUploading(false)
      if (input.current) input.current.value = ''
    }
  }

  const fileInput = (
    <input ref={input} type="file" accept="image/*" className="hidden" onChange={(e) => void pick(e.target.files?.[0])} />
  )

  if (!url) {
    return (
      <div className="doc-logo-empty">
        {fileInput}
        <button
          type="button"
          onClick={() => input.current?.click()}
          disabled={uploading}
          className="flex items-center gap-1 rounded-sm px-1.5 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
          title="Una imagen arriba del título, por ejemplo el logo del estudio. También sale en el PDF."
        >
          {uploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <ImagePlus className="h-3 w-3" />}
          Agregar logo
        </button>
      </div>
    )
  }

  return (
    <div className="group/logo relative inline-block max-w-full">
      {fileInput}
      <img src={url} alt="Logo" className="block max-h-24 max-w-[16rem] object-contain" />
      <div className="absolute right-1 top-1 hidden gap-1 group-hover/logo:flex [@media(hover:none)]:flex">
        <button
          type="button"
          onClick={() => input.current?.click()}
          disabled={uploading}
          className="flex items-center gap-1 rounded bg-background/90 px-1.5 py-0.5 text-[11px] shadow-sm hover:bg-accent"
        >
          {uploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <ImagePlus className="h-3 w-3" />}
          Cambiar
        </button>
        <button
          type="button"
          onClick={() => void onChange(null)}
          className="flex items-center rounded bg-background/90 px-1 py-0.5 shadow-sm hover:bg-accent hover:text-destructive"
          aria-label="Quitar logo"
          title="Quitar logo"
        >
          <X className="h-3 w-3" />
        </button>
      </div>
    </div>
  )
}
