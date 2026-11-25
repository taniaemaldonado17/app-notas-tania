'use client'

import { createRoot, type Root } from 'react-dom/client'
import { toast } from 'sonner'
import type { PaperDoc } from '@/components/doc-read-only'

const ROOT_ID = 'doc-print-root'
let active: (() => void) | null = null

/**
 * "Descargar PDF": prints the document alone, as a light sheet with its
 * formatting (titles, colours, lists, images), so the browser's print dialog
 * can save it as PDF. Works on computers, iPhone and iPad (also when the app
 * is installed on the home screen), unlike printing a separate window.
 */
export async function printDoc(doc: PaperDoc) {
  active?.()
  const toastId = toast.loading('Preparando el PDF…')
  let DocPaper: typeof import('@/components/doc-read-only').default
  try {
    DocPaper = (await import('@/components/doc-read-only')).default
  } catch {
    toast.error('No se pudo preparar el PDF', { id: toastId })
    return
  }

  const prevTitle = document.title

  const container = document.createElement('div')
  container.id = ROOT_ID
  document.body.appendChild(container)
  let root: Root | null = createRoot(container)

  const cleanup = () => {
    if (active !== cleanup) return
    active = null
    window.removeEventListener('afterprint', onAfterPrint)
    document.body.classList.remove('printing-doc')
    document.title = prevTitle
    root?.unmount()
    root = null
    container.remove()
  }
  // Safari can fire afterprint before the dialog is closed: wait a moment.
  const onAfterPrint = () => setTimeout(cleanup, 500)
  active = cleanup

  const ready = new Promise<void>((resolve) => {
    root!.render(<DocPaper doc={doc} onRendered={resolve} />)
  })
  // The sheet has its own light colours (.doc-paper), whatever the app theme.
  document.body.classList.add('printing-doc')
  await ready
  if (active !== cleanup) return
  toast.dismiss(toastId)
  // The suggested file name is the page title.
  document.title = (doc.title || 'Sin título').replace(/[\\/:*?"<>|]+/g, ' ').trim() || 'Documento'
  window.addEventListener('afterprint', onAfterPrint)
  // Let the toast go away before the page is captured.
  await new Promise((r) => setTimeout(r, 150))
  window.print()
  // Some browsers never send afterprint: clean up the next time the user does something.
  setTimeout(() => {
    if (active !== cleanup) return
    const once = () => {
      window.removeEventListener('pointerdown', once, true)
      window.removeEventListener('keydown', once, true)
      cleanup()
    }
    window.addEventListener('pointerdown', once, true)
    window.addEventListener('keydown', once, true)
  }, 1000)
}
