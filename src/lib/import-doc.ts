/**
 * "Importar documento": loads a Markdown, Word (.docx), HTML or text file into
 * an open page editor, keeping headings, bold/italics, lists, tables, quotes
 * and images. Browser only (uses the editor's own parsers).
 */
import type { BlockNoteEditor } from '@blocknote/core'
import { uploadFile } from '@/lib/api'

export const IMPORT_ACCEPT = [
  '.md',
  '.markdown',
  '.txt',
  '.docx',
  '.html',
  '.htm',
  'text/markdown',
  'text/plain',
  'text/html',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
].join(',')

const MAX_FILE = 15 * 1024 * 1024
const UPLOADABLE = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp'])

type AnyBlock = { id: string; type: string; props?: Record<string, unknown>; content?: unknown; children?: AnyBlock[] }

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}

/** Word → HTML. Pictures are uploaded like any image (not kept inside the page). */
async function docxToHtml(file: File): Promise<string> {
  const mammoth = await import('mammoth')
  let n = 0
  const result = await mammoth.convertToHtml(
    { arrayBuffer: await file.arrayBuffer() },
    {
      convertImage: mammoth.images.imgElement(async (image) => {
        if (!UPLOADABLE.has(image.contentType)) return { src: '' }
        try {
          const bytes = base64ToBytes(await image.read('base64'))
          const ext = image.contentType.split('/')[1] || 'png'
          const up = await uploadFile(new File([bytes as BlobPart], `imagen-${++n}.${ext}`, { type: image.contentType }))
          return { src: up.url }
        } catch {
          return { src: '' }
        }
      }),
    }
  )
  return result.value
}

/** Drops images that couldn't be uploaded (empty url). */
function withoutEmptyImages(blocks: AnyBlock[]): AnyBlock[] {
  return blocks
    .filter((b) => !(b.type === 'image' && !b.props?.url))
    .map((b) => (b.children?.length ? { ...b, children: withoutEmptyImages(b.children) } : b))
}

/** Converts a file to editor blocks. Throws an Error with a message for the user. */
export async function fileToBlocks(editor: BlockNoteEditor, file: File): Promise<AnyBlock[]> {
  const name = file.name.toLowerCase()
  if (file.size > MAX_FILE) throw new Error('El archivo es demasiado grande (máximo 15 MB)')
  if (name.endsWith('.doc')) throw new Error('Los .doc viejos no se pueden leer: en Word usá Guardar como → Documento de Word (.docx)')
  if (name.endsWith('.pdf')) throw new Error('Los PDF no se pueden importar como texto: subilo como archivo o pegá su contenido')

  let blocks: AnyBlock[]
  if (name.endsWith('.docx')) {
    blocks = (await editor.tryParseHTMLToBlocks(await docxToHtml(file))) as unknown as AnyBlock[]
  } else if (name.endsWith('.html') || name.endsWith('.htm')) {
    blocks = (await editor.tryParseHTMLToBlocks(await file.text())) as unknown as AnyBlock[]
  } else {
    blocks = (await editor.tryParseMarkdownToBlocks(await file.text())) as unknown as AnyBlock[]
  }
  return withoutEmptyImages(blocks)
}

/** Opens the file picker; resolves with the chosen file or null. */
export function pickImportFile(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = IMPORT_ACCEPT
    input.onchange = () => resolve(input.files?.[0] ?? null)
    // No reliable "cancel" event everywhere; an unresolved promise is harmless.
    input.click()
  })
}

const isEmptyParagraph = (b: AnyBlock | undefined) =>
  !!b && b.type === 'paragraph' && (!b.content || (Array.isArray(b.content) && b.content.length === 0)) && !b.children?.length

/**
 * Inserts the imported blocks: at the cursor's line (`cursor`, replacing it if
 * it's empty, as after typing "/") or at the end of the page (`end`). An empty
 * page is simply replaced. Returns how many blocks were added.
 */
export function insertImported(editor: BlockNoteEditor, blocks: AnyBlock[], where: 'cursor' | 'end'): number {
  if (!blocks.length) return 0
  const doc = editor.document as unknown as AnyBlock[]
  const content = blocks as never
  if (doc.length === 0 || (doc.length === 1 && isEmptyParagraph(doc[0]))) {
    editor.replaceBlocks(editor.document, content)
    return blocks.length
  }
  if (where === 'cursor') {
    let current: AnyBlock | undefined
    try {
      current = editor.getTextCursorPosition().block as unknown as AnyBlock
    } catch {
      current = undefined
    }
    if (current) {
      if (isEmptyParagraph(current)) editor.replaceBlocks([current.id], content)
      else editor.insertBlocks(content, current.id, 'after')
      return blocks.length
    }
  }
  const last = doc[doc.length - 1]
  if (isEmptyParagraph(last)) editor.replaceBlocks([last.id], content)
  else editor.insertBlocks(content, last.id, 'after')
  return blocks.length
}

/** Picks a file and imports it into the editor. Returns a message for a toast. */
export async function importDocument(editor: BlockNoteEditor, where: 'cursor' | 'end'): Promise<string | null> {
  const file = await pickImportFile()
  if (!file) return null
  const blocks = await fileToBlocks(editor, file)
  if (!blocks.length) throw new Error('No se encontró contenido en el archivo')
  insertImported(editor, blocks, where)
  return `Se importó "${file.name}"`
}

/** importDocument with the usual success / error toasts. */
export async function importDocumentWithToast(editor: BlockNoteEditor | null, where: 'cursor' | 'end') {
  const { toast } = await import('sonner')
  if (!editor) {
    toast.error('Esperá a que cargue el editor')
    return
  }
  try {
    const msg = await importDocument(editor, where)
    if (msg) toast.success(msg)
  } catch (err) {
    toast.error(err instanceof Error ? err.message : 'No se pudo importar el archivo')
  }
}
