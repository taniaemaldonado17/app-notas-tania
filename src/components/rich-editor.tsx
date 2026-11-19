'use client'

import { useEffect, useState } from 'react'
import { useTheme } from 'next-themes'
import { BlockNoteSchema, defaultBlockSpecs, defaultInlineContentSpecs, filterSuggestionItems, insertOrUpdateBlockForSlashMenu, type BlockNoteEditor } from '@blocknote/core'
import { es } from '@blocknote/core/locales'
import { getDefaultReactSlashMenuItems, SuggestionMenuController, useCreateBlockNote } from '@blocknote/react'
import { BlockNoteView } from '@blocknote/mantine'
import '@blocknote/mantine/style.css'
import { Code2, GalleryHorizontal } from 'lucide-react'
import type { DocBlock } from '@/lib/blocks'
import { fetchShare, uploadFile } from '@/lib/api'
import { EmbedBlock } from '@/components/embed-block'
import { ImageRowBlock } from '@/components/image-row-block'
import { Mention } from '@/components/mention-inline'

export type MentionPerson = { id: string; name: string | null; email: string }

const schema = BlockNoteSchema.create({
  blockSpecs: { ...defaultBlockSpecs, embed: EmbedBlock(), imageRow: ImageRowBlock() },
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

/** Default "/" menu plus our blocks; "Imágenes en fila" goes right after "Imagen". */
function slashItems(editor: Editor) {
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
export default function RichEditor({ initialBlocks, onChange, onReady, people, pageId }: Props) {
  const { resolvedTheme } = useTheme()
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
      <SuggestionMenuController
        triggerCharacter="@"
        getItems={async (query) => filterSuggestionItems(mentionItems(editor, mentionable), query)}
      />
    </BlockNoteView>
  )
}
