'use client'

import { useContext, useEffect, useState } from 'react'
import { useTheme } from 'next-themes'
import { BlockNoteSchema, defaultBlockSpecs, defaultInlineContentSpecs, filterSuggestionItems, insertOrUpdateBlockForSlashMenu, type BlockNoteEditor } from '@blocknote/core'
import { es } from '@blocknote/core/locales'
import {
  FormattingToolbar,
  FormattingToolbarController,
  getDefaultReactSlashMenuItems,
  SideMenu,
  SideMenuController,
  SuggestionMenuController,
  useCreateBlockNote,
} from '@blocknote/react'
import { BlockNoteView } from '@blocknote/mantine'
import '@blocknote/mantine/style.css'
import { CalendarRange, Code2, FileText, FileUp, GalleryHorizontal, Lightbulb, Sheet } from 'lucide-react'
import { toast } from 'sonner'
import { decodeText, parseTable } from '@/lib/db-import'
import { importDocumentWithToast } from '@/lib/import-doc'
import type { DocBlock } from '@/lib/blocks'
import { createSubPage, fetchShare, uploadFile } from '@/lib/api'
import { EmbedBlock } from '@/components/embed-block'
import { ImageRowBlock } from '@/components/image-row-block'
import { Mention } from '@/components/mention-inline'
import { CalloutBlock } from '@/components/callout-block'
import { TimelineBlock } from '@/components/timeline-block'
import { DocRefContext, SubPageBlock, SubPageRootContext } from '@/components/subpage-block'
import { useSubPages } from '@/lib/subpage-store'
import type { DocRef } from '@/lib/subpages'
import { EditorPeopleContext } from '@/components/editor-people'
import { BlockHandleMenu, blockTypeItems } from '@/components/block-handle-menu'

export type MentionPerson = { id: string; name: string | null; email: string }

const schema = BlockNoteSchema.create({
  blockSpecs: { ...defaultBlockSpecs, embed: EmbedBlock(), imageRow: ImageRowBlock(), callout: CalloutBlock(), timeline: TimelineBlock(), subpage: SubPageBlock() },
  inlineContentSpecs: { ...defaultInlineContentSpecs, mention: Mention },
})

type Editor = BlockNoteEditor<typeof schema.blockSchema, typeof schema.inlineContentSchema, typeof schema.styleSchema>

// Spanish UI, with the toggle block named as in Notion ("Lista desplegable").
const dictionary = {
  ...es,
  slash_menu: {
    ...es.slash_menu,
    toggle_list: {
      ...es.slash_menu.toggle_list,
      title: 'Lista desplegable',
      aliases: [
        ...es.slash_menu.toggle_list.aliases,
        'desplegable',
        'lista desplegable',
        'toggle',
      ],
    },
  },
}

type Props = {
  /** Blocks to load when the editor mounts. Later changes are ignored. */
  initialBlocks: DocBlock[]
  onChange: (blocks: DocBlock[]) => void
  /** Gives the parent access to the editor (e.g. for Markdown export). */
  onReady?: (editor: BlockNoteEditor | null) => void
  /** People who can be @mentioned (they get an email). */
  people?: MentionPerson[]
  /** Alternative to `people`: load the page's owner and members. */
  pageId?: string
  /** The document being edited: enables "Página" (pages inside the document). */
  docRef?: DocRef
}

const shareCache = new Map<string, Promise<MentionPerson[]>>()
function pagePeople(pageId: string) {
  let p = shareCache.get(pageId)
  if (!p) {
    p = fetchShare(pageId)
      .then((s) => [s.owner, ...s.members].map((m) => ({ id: m.id, name: m.name, email: m.email })))
      .catch(() => {
        shareCache.delete(pageId)
        return []
      })
    shareCache.set(pageId, p)
  }
  return p
}

/** "@" menu: people of the page. */
function mentionItems(editor: Editor, people: MentionPerson[]) {
  if (!people.length) {
    return [
      {
        title: 'No hay personas para mencionar',
        subtext: 'Compartí la página para poder mencionar a alguien',
        onItemClick: () => {},
      },
    ]
  }
  return people.map((p) => {
    const name = p.name?.trim() || p.email.split('@')[0]
    return {
      title: name,
      subtext: p.email,
      aliases: [p.email, p.email.split('@')[0]],
      icon: <span className="mention-avatar">{name.slice(0, 1).toUpperCase()}</span>,
      onItemClick: () => {
        editor.insertInlineContent([{ type: 'mention', props: { userId: p.id, name } }, ' '] as never)
      },
    }
  })
}

const CSV_MAX_ROWS = 500
const CSV_MAX_COLS = 40

/** Asks for a CSV file and inserts it as a table where the "/" was typed. */
function insertCsvTable(editor: Editor) {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = '.csv,.tsv,.txt,text/csv'
  input.onchange = async () => {
    const file = input.files?.[0]
    if (!file) return
    if (/\.xlsx?$/i.test(file.name)) {
      toast.error('Ese es un archivo de Excel: en Excel usá Guardar como → CSV y subí ese archivo')
      return
    }
    const table = parseTable(decodeText(await file.arrayBuffer()))
    if (!table || !table.headers.length) {
      toast.error('No se encontraron datos en el archivo')
      return
    }
    const cols = Math.min(table.headers.length, CSV_MAX_COLS)
    const rows = [table.headers, ...table.rows.slice(0, CSV_MAX_ROWS)].map((r) => ({
      cells: Array.from({ length: cols }, (_, i) => r[i] ?? ''),
    }))
    insertOrUpdateBlockForSlashMenu(editor, {
      type: 'table',
      content: { type: 'tableContent', headerRows: 1, rows },
    } as never)
    if (table.rows.length > CSV_MAX_ROWS || table.headers.length > CSV_MAX_COLS) {
      toast.info(`Se cargaron las primeras ${CSV_MAX_ROWS} filas y ${CSV_MAX_COLS} columnas. Para tablas grandes conviene una base de datos.`)
    }
  }
  input.click()
}

/** "/Página": creates a page inside this document and opens it. */
async function insertSubPage(editor: Editor, docRef: DocRef, root: string | null) {
  try {
    const sub = await createSubPage({ parent: docRef, title: '' })
    insertOrUpdateBlockForSlashMenu(editor, { type: 'subpage', props: { subpageId: sub.id, title: '', icon: '' } } as never)
    if (root) useSubPages.getState().open(root, { id: sub.id, title: '', icon: null })
  } catch {
    toast.error('No se pudo crear la página')
  }
}

/** Default "/" menu plus our blocks; "Imágenes en fila" goes right after "Imagen". */
function slashItems(editor: Editor, docRef?: DocRef, root: string | null = null) {
  const items = getDefaultReactSlashMenuItems(editor)
  if (docRef) {
    const page = {
      title: 'Página',
      subtext: 'Una página dentro de este documento, con su propio contenido',
      aliases: ['pagina', 'página', 'subpagina', 'subpágina', 'page', 'documento', 'hoja'],
      group: es.slash_menu.paragraph.group,
      icon: <FileText size={18} />,
      onItemClick: () => void insertSubPage(editor, docRef, root),
    }
    const pi = items.findIndex((i) => (i as { key?: string }).key === 'paragraph')
    items.splice(pi >= 0 ? pi + 1 : 0, 0, page)
  }
  const imageRow = {
    title: 'Imágenes en fila',
    subtext: 'Varias imágenes una al lado de la otra; arrastralas para ordenarlas',
    aliases: ['imagenes', 'fila', 'columnas', 'galeria', 'fotos', 'lado', 'grilla', 'gallery'],
    group: es.slash_menu.image.group,
    icon: <GalleryHorizontal size={18} />,
    onItemClick: () => insertOrUpdateBlockForSlashMenu(editor, { type: 'imageRow' } as never),
  }
  const at = items.findIndex((i) => (i as { key?: string }).key === 'image')
  items.splice(at >= 0 ? at + 1 : items.length, 0, imageRow)
  const callout = {
    title: 'Destacado',
    subtext: 'Un recuadro con ícono para resaltar una nota, como en Notion',
    aliases: ['destacado', 'callout', 'nota', 'aviso', 'recuadro', 'caja', 'tip'],
    group: es.slash_menu.quote.group,
    icon: <Lightbulb size={18} />,
    onItemClick: () => insertOrUpdateBlockForSlashMenu(editor, { type: 'callout' } as never),
  }
  const q = items.findIndex((i) => (i as { key?: string }).key === 'quote')
  items.splice(q >= 0 ? q + 1 : items.length, 0, callout)
  const csvTable = {
    title: 'Tabla desde CSV',
    subtext: 'Subí un archivo CSV (de Excel o Notion) y se arma una tabla',
    aliases: ['csv', 'tabla', 'importar', 'excel', 'planilla', 'table'],
    group: es.slash_menu.table.group,
    icon: <Sheet size={18} />,
    onItemClick: () => insertCsvTable(editor),
  }
  const tb = items.findIndex((i) => (i as { key?: string }).key === 'table')
  items.splice(tb >= 0 ? tb + 1 : items.length, 0, csvTable)
  return [
    ...items,
    {
      title: 'Cronograma',
      subtext: 'Tareas con fechas en barras (Gantt), con responsable y retrasos',
      aliases: ['cronograma', 'gantt', 'timeline', 'plazos', 'fechas', 'planificacion', 'calendario', 'obra'],
      group: 'Insertar',
      icon: <CalendarRange size={18} />,
      onItemClick: () => insertOrUpdateBlockForSlashMenu(editor, { type: 'timeline' } as never),
    },
    {
      title: 'Importar documento',
      subtext: 'Traé un archivo Markdown (.md), Word (.docx) o HTML con sus títulos, listas y tablas',
      aliases: ['importar', 'documento', 'word', 'docx', 'markdown', 'md', 'archivo', 'claude', 'pegar'],
      group: 'Insertar',
      icon: <FileUp size={18} />,
      onItemClick: () => void importDocumentWithToast(editor as unknown as BlockNoteEditor, 'cursor'),
    },
    {
      title: 'Insertar HTML o web',
      subtext: 'Mostrá una página web, un mapa, un video o tu propio código HTML',
      aliases: ['html', 'embed', 'insertar', 'web', 'iframe', 'codigo', 'pagina'],
      group: 'Insertar',
      icon: <Code2 size={18} />,
      onItemClick: () => insertOrUpdateBlockForSlashMenu(editor, { type: 'embed' } as never),
    },
  ]
}

/**
 * Rich block editor for card content: inline formatting, links, colours,
 * toggle lists, nested blocks, to-dos, code, tables and images.
 * Type "/" for the block menu; select text for the formatting toolbar.
 *
 * Must be loaded client-side only (see card-detail-panel.tsx).
 */
export default function RichEditor({ initialBlocks, onChange, onReady, people, pageId, docRef }: Props) {
  const { resolvedTheme } = useTheme()
  const panelRoot = useContext(SubPageRootContext)
  const [loaded, setLoaded] = useState<MentionPerson[]>([])
  useEffect(() => {
    if (people || !pageId) return
    let cancelled = false
    pagePeople(pageId).then((list) => {
      if (!cancelled) setLoaded(list)
    })
    return () => {
      cancelled = true
    }
  }, [people, pageId])
  const mentionable = people ?? loaded

  const editor = useCreateBlockNote({
    schema,
    dictionary,
    initialContent: initialBlocks.length > 0 ? (initialBlocks as any) : undefined,
    uploadFile: async (file: File) => {
      const result = await uploadFile(file)
      return result.url
    },
  })

  useEffect(() => {
    onReady?.(editor as unknown as BlockNoteEditor)
    return () => onReady?.(null)
  }, [editor])

  /**
   * Enter inside a "Destacado" keeps writing inside the box (as in Notion):
   * a new line is added as the first block nested in it. Enter on an empty
   * one with nothing inside turns it back into a normal paragraph.
   */
  function onKeyDownCapture(e: React.KeyboardEvent) {
    if (e.key !== 'Enter' || e.shiftKey || e.ctrlKey || e.metaKey || e.altKey || e.nativeEvent.isComposing) return
    const block = editor.getTextCursorPosition().block as unknown as { id: string; type: string; content: unknown[]; children: { id: string }[] }
    if (block.type !== 'callout') return
    const sel = editor.prosemirrorState.selection
    const empty = !block.content?.length
    if (!sel.empty) return
    if (empty && !block.children.length) {
      e.preventDefault()
      e.stopPropagation()
      editor.updateBlock(block.id, { type: 'paragraph' } as never)
      return
    }
    if (sel.$from.parentOffset !== sel.$from.parent.content.size) return // middle of the text: default split
    e.preventDefault()
    e.stopPropagation()
    let newId: string
    if (block.children.length) {
      newId = editor.insertBlocks([{ type: 'paragraph' }] as never, block.children[0].id, 'before')[0].id
    } else {
      editor.updateBlock(block.id, { children: [{ type: 'paragraph' }] } as never)
      newId = (editor.getBlock(block.id) as unknown as { children: { id: string }[] }).children[0].id
    }
    editor.setTextCursorPosition(newId, 'start')
  }

  return (
    <EditorPeopleContext.Provider value={mentionable}>
    <DocRefContext.Provider value={docRef ?? null}>
    <div onKeyDownCapture={onKeyDownCapture} className="contents">
    <BlockNoteView
      editor={editor}
      theme={resolvedTheme === 'light' ? 'light' : 'dark'}
      onChange={() => onChange(editor.document as unknown as DocBlock[])}
      className="rich-editor"
      slashMenu={false}
      sideMenu={false}
      formattingToolbar={false}
    >
      <SideMenuController sideMenu={() => <SideMenu dragHandleMenu={BlockHandleMenu} />} />
      <FormattingToolbarController
        formattingToolbar={() => <FormattingToolbar blockTypeSelectItems={blockTypeItems(editor as never)} />}
      />
      <SuggestionMenuController
        triggerCharacter="/"
        getItems={async (query) =>
          filterSuggestionItems(
            slashItems(editor, docRef, panelRoot),
            query
          )
        }
      />
      <SuggestionMenuController
        triggerCharacter="@"
        getItems={async (query) => filterSuggestionItems(mentionItems(editor, mentionable), query)}
      />
    </BlockNoteView>
    </div>
    </DocRefContext.Provider>
    </EditorPeopleContext.Provider>
  )
}
