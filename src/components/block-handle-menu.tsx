'use client'

import { SideMenuExtension } from '@blocknote/core/extensions'
import {
  BlockColorsItem,
  blockTypeSelectItems,
  DragHandleMenu,
  RemoveBlockItem,
  useBlockNoteEditor,
  useComponentsContext,
  useExtensionState,
  usePortalElement,
  type BlockTypeSelectItem,
} from '@blocknote/react'
import { useContext } from 'react'
import { FileText, Lightbulb } from 'lucide-react'
import { toast } from 'sonner'
import { createSubPage } from '@/lib/api'
import { serializeDoc, type DocBlock } from '@/lib/blocks'
import { blockText } from '@/lib/subpages'
import { useSubPages } from '@/lib/subpage-store'
import { DocRefContext, SubPageRootContext } from '@/components/subpage-block'

type AnyBlock = { id: string; type: string; props: Record<string, unknown>; content?: unknown; children?: unknown[] }

/** "Destacado" (callout) as one more block type for the "convert" menus. */
export const calloutTypeItem: BlockTypeSelectItem = {
  name: 'Destacado',
  type: 'callout',
  icon: Lightbulb as unknown as BlockTypeSelectItem['icon'],
}

export function blockTypeItems(editor: Parameters<typeof blockTypeSelectItems>[0]): BlockTypeSelectItem[] {
  return [...blockTypeSelectItems(editor), calloutTypeItem]
}

/** Blocks the ⋮⋮ menu acts on: the whole selection if it includes the block, else just the block. */
function targets(editor: Parameters<typeof blockTypeSelectItems>[0], block: AnyBlock): AnyBlock[] {
  const sel = editor.getSelection()?.blocks as AnyBlock[] | undefined
  return sel && sel.some((b) => b.id === block.id) ? sel : [block]
}

/**
 * "Convertir en → Página": the block's text becomes the title of a new page
 * inside this document and its nested blocks become the page's content.
 */
async function turnIntoSubPage(
  editor: Parameters<typeof blockTypeSelectItems>[0],
  block: AnyBlock,
  docRef: NonNullable<React.ContextType<typeof DocRefContext>>,
  root: string | null
) {
  const title = blockText(block as unknown as DocBlock)
  try {
    const sub = await createSubPage({
      parent: docRef,
      title,
      content: serializeDoc((block.children ?? []) as DocBlock[]),
    })
    editor.replaceBlocks([block.id], [{ type: 'subpage', props: { subpageId: sub.id, title, icon: '' } }] as never)
    if (root) useSubPages.getState().open(root, { id: sub.id, title, icon: null })
  } catch {
    toast.error('No se pudo convertir en página')
  }
}

function TurnIntoItem() {
  const Components = useComponentsContext()!
  const editor = useBlockNoteEditor() as never as Parameters<typeof blockTypeSelectItems>[0]
  const portal = usePortalElement()
  const docRef = useContext(DocRefContext)
  const root = useContext(SubPageRootContext)
  const block = useExtensionState(SideMenuExtension, { editor, selector: (s) => s?.block }) as AnyBlock | undefined
  // Only text blocks can change type (images, tables… keep theirs).
  const items = blockTypeItems(editor)
  if (!block || !items.some((i) => i.type === block.type)) return null

  return (
    <Components.Generic.Menu.Root position="right" sub portalElement={portal}>
      <Components.Generic.Menu.Trigger sub>
        <Components.Generic.Menu.Item className="bn-menu-item" subTrigger>
          Convertir en
        </Components.Generic.Menu.Item>
      </Components.Generic.Menu.Trigger>
      <Components.Generic.Menu.Dropdown sub className="bn-menu-dropdown">
        {items.map((item) => {
          const Icon = item.icon
          const current =
            item.type === block.type &&
            Object.entries(item.props ?? {}).every(([k, v]) => block.props[k] === v)
          return (
            <Components.Generic.Menu.Item
              key={`${item.type}-${JSON.stringify(item.props ?? {})}`}
              className="bn-menu-item"
              icon={<Icon size={16} />}
              checked={current}
              onClick={() => {
                const list = targets(editor, block).filter((b) => items.some((i) => i.type === b.type))
                editor.focus()
                editor.transact(() => {
                  for (const b of list) editor.updateBlock(b.id, { type: item.type, props: item.props } as never)
                })
              }}
            >
              {item.name}
            </Components.Generic.Menu.Item>
          )
        })}
        {docRef && (
          <Components.Generic.Menu.Item
            className="bn-menu-item"
            icon={<FileText size={16} />}
            onClick={() => void turnIntoSubPage(editor, block, docRef, root)}
          >
            Página
          </Components.Generic.Menu.Item>
        )}
      </Components.Generic.Menu.Dropdown>
    </Components.Generic.Menu.Root>
  )
}

function DuplicateItem() {
  const Components = useComponentsContext()!
  const editor = useBlockNoteEditor() as never as Parameters<typeof blockTypeSelectItems>[0]
  const block = useExtensionState(SideMenuExtension, { editor, selector: (s) => s?.block }) as AnyBlock | undefined
  if (!block) return null
  return (
    <Components.Generic.Menu.Item
      className="bn-menu-item"
      onClick={() => {
        const list = targets(editor, block)
         
        const copies = list.map(({ id, ...rest }) => rest)
        editor.insertBlocks(copies as never, list[list.length - 1].id, 'after')
      }}
    >
      Duplicar
    </Components.Generic.Menu.Item>
  )
}

/** Menu of the ⋮⋮ handle next to each block. */
export function BlockHandleMenu() {
  return (
    <DragHandleMenu>
      <TurnIntoItem />
      <DuplicateItem />
      <BlockColorsItem>Colores</BlockColorsItem>
      <RemoveBlockItem>Eliminar</RemoveBlockItem>
    </DragHandleMenu>
  )
}
