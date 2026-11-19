'use client'

import { useEffect } from 'react'
import { useTheme } from 'next-themes'
import { BlockNoteSchema, defaultBlockSpecs, filterSuggestionItems, insertOrUpdateBlockForSlashMenu, type BlockNoteEditor } from '@blocknote/core'
import { es } from '@blocknote/core/locales'
import { getDefaultReactSlashMenuItems, SuggestionMenuController, useCreateBlockNote } from '@blocknote/react'
import { BlockNoteView } from '@blocknote/mantine'
import '@blocknote/mantine/style.css'
import { Code2, GalleryHorizontal } from 'lucide-react'
import type { DocBlock } from '@/lib/blocks'
import { uploadFile } from '@/lib/api'
import { EmbedBlock } from '@/components/embed-block'
import { ImageRowBlock } from '@/components/image-row-block'

const schema = BlockNoteSchema.create({
  blockSpecs: { ...defaultBlockSpecs, embed: EmbedBlock(), imageRow: ImageRowBlock() },
})

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
}

/** Default "/" menu plus our blocks; "Imágenes en fila" goes right after "Imagen". */
function slashItems(editor: BlockNoteEditor<typeof schema.blockSchema, typeof schema.inlineContentSchema, typeof schema.styleSchema>) {
  const items = getDefaultReactSlashMenuItems(editor)
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
  return [
    ...items,
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
export default function RichEditor({ initialBlocks, onChange, onReady }: Props) {
  const { resolvedTheme } = useTheme()

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

  return (
    <BlockNoteView
      editor={editor}
      theme={resolvedTheme === 'light' ? 'light' : 'dark'}
      onChange={() => onChange(editor.document as unknown as DocBlock[])}
      className="rich-editor"
      slashMenu={false}
    >
      <SuggestionMenuController
        triggerCharacter="/"
        getItems={async (query) =>
          filterSuggestionItems(
            slashItems(editor),
            query
          )
        }
      />
    </BlockNoteView>
  )
}
