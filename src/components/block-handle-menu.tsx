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
import { createSubPage, fetchSubPage, saveDocContent } from '@/lib/api'
import { parseDoc, serializeDoc, type DocBlock } from '@/lib/blocks'
import { hashDoc } from '@/lib/doc-merge'
import { bulletsToLists } from '@/lib/list-glyphs'
import { blockText, findSubPageBlocks, pageContentFor, SUBPAGE_BLOCK } from '@/lib/subpages'
import { useSubPages } from '@/lib/subpage-store'
import { DocRefContext, SubPageRootContext } from '@/components/subpage-block'
import { UseAsLogoContext } from '@/components/doc-logo'

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

type MenuEditor = Parameters<typeof blockTypeSelectItems>[0]

/** Blocks at the same level as `block` (its parent's children, or the top of the document). */
function siblingsOf(editor: MenuEditor, block: AnyBlock): AnyBlock[] {
  const parent = editor.getParentBlock(block.id) as unknown as AnyBlock | undefined
  return ((parent ? parent.children : editor.document) ?? []) as AnyBlock[]
}

/**
 * "Convertir en → Página": the block's text becomes the title of a new page
 * inside this document and what belongs to it (see pageContentFor) moves into
 * the page, so the document only keeps the link. Pasted bullets ("• …") are
 * turned into real lists on the way.
 */
async function turnIntoSubPage(editor: MenuEditor, block: AnyBlock, docRef: NonNullable<React.ContextType<typeof DocRefContext>>, root: string | null) {
  const picked = pageContentFor(block as DocBlock, targets(editor, block) as DocBlock[], siblingsOf(editor, block) as DocBlock[])
  const title = blockText(picked.title).slice(0, 2000)
  try {
    const sub = await createSubPage({
      parent: docRef,
      title,
      content: serializeDoc(bulletsToLists(picked.content)),
    })
    editor.transact(() => {
      if (picked.taken.length) editor.removeBlocks(picked.taken.map((b) => b.id))
      editor.replaceBlocks([picked.title.id], [{ type: 'subpage', props: { subpageId: sub.id, title, icon: '' } }] as never)
    })
    if (root) useSubPages.getState().open(root, { id: sub.id, title, icon: null })
  } catch {
    toast.error('No se pudo convertir en página')
  }
}

/**
 * "Mover a → <página>": appends the block (or the selected blocks) at the end
 * of a page that lives in this document, and removes them from here.
 */
async function moveIntoSubPage(editor: MenuEditor, list: AnyBlock[], target: { subpageId: string; title: string; icon: string }, root: string | null) {
  const moving = list.filter((b) => b.type !== SUBPAGE_BLOCK)
  if (!moving.length) return
  try {
    let saved = false
    for (let attempt = 0; attempt < 3 && !saved; attempt++) {
      const sub = await fetchSubPage(target.subpageId)
      const next = [...parseDoc(sub.content), ...bulletsToLists(moving as DocBlock[])]
      const res = await saveDocContent('subpage', target.subpageId, serializeDoc(next), hashDoc(sub.content))
      saved = 'ok' in res
    }
    if (!saved) throw new Error('conflict')
    editor.removeBlocks(moving.map((b) => b.id))
    toast.success(`Se movió a "${target.title || 'Sin título'}"`, {
      action: root
        ? { label: 'Abrir', onClick: () => useSubPages.getState().open(root, { id: target.subpageId, title: target.title, icon: target.icon || null }) }
        : undefined,
    })
  } catch {
    toast.error('No se pudo mover a la página')
  }
}

/** Links to pages anywhere in the document (nested too). */
function subPageLinks(blocks: AnyBlock[]): AnyBlock[] {
  return findSubPageBlocks(blocks as DocBlock[]) as AnyBlock[]
}

function MoveToPageItem() {
  const Components = useComponentsContext()!
  const editor = useBlockNoteEditor() as never as MenuEditor
  const portal = usePortalElement()
  const docRef = useContext(DocRefContext)
  const root = useContext(SubPageRootContext)
  const block = useExtensionState(SideMenuExtension, { editor, selector: (s) => s?.block }) as AnyBlock | undefined
  if (!docRef || !block || block.type === SUBPAGE_BLOCK) return null
  const pages = subPageLinks(editor.document as unknown as AnyBlock[])
  if (!pages.length) return null

  return (
    <Components.Generic.Menu.Root position="right" sub portalElement={portal}>
      <Components.Generic.Menu.Trigger sub>
        <Components.Generic.Menu.Item className="bn-menu-item" subTrigger>
          Mover a
        </Components.Generic.Menu.Item>
      </Components.Generic.Menu.Trigger>
      <Components.Generic.Menu.Dropdown sub className="bn-menu-dropdown">
        {pages.map((p) => {
          const props = p.props as { subpageId: string; title: string; icon: string }
          return (
            <Components.Generic.Menu.Item
              key={p.id}
              className="bn-menu-item"
              icon={props.icon ? <span className="text-base leading-none">{props.icon}</span> : <FileText size={16} />}
              onClick={() => void moveIntoSubPage(editor, targets(editor, block), props, root)}
            >
              {props.title || 'Sin título'}
            </Components.Generic.Menu.Item>
          )
        })}
      </Components.Generic.Menu.Dropdown>
    </Components.Generic.Menu.Root>
  )
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

/** On an image: it becomes the page's logo, above the title (and leaves the text). */
function UseAsLogoItem() {
  const Components = useComponentsContext()!
  const editor = useBlockNoteEditor() as never as Parameters<typeof blockTypeSelectItems>[0]
  const block = useExtensionState(SideMenuExtension, { editor, selector: (s) => s?.block }) as AnyBlock | undefined
  const setLogo = useContext(UseAsLogoContext)
  const url = block?.type === 'image' && typeof block.props?.url === 'string' ? (block.props.url as string) : ''
  if (!block || !setLogo || !url) return null
  return (
    <Components.Generic.Menu.Item
      className="bn-menu-item"
      onClick={() => {
        setLogo(url)
        editor.removeBlocks([block.id])
        toast.success('Listo: el logo va arriba del título')
      }}
    >
      Usar como logo (arriba del título)
    </Components.Generic.Menu.Item>
  )
}

/** Menu of the ⋮⋮ handle next to each block. */
export function BlockHandleMenu() {
  return (
    <DragHandleMenu>
      <UseAsLogoItem />
      <TurnIntoItem />
      <MoveToPageItem />
      <DuplicateItem />
      <BlockColorsItem>Colores</BlockColorsItem>
      <RemoveBlockItem>Eliminar</RemoveBlockItem>
    </DragHandleMenu>
  )
}
