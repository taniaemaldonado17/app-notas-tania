'use client'

import { createContext, useContext } from 'react'
import { createReactBlockSpec } from '@blocknote/react'
import { FileText } from 'lucide-react'
import { toast } from 'sonner'
import { useSubPages } from '@/lib/subpage-store'
import type { DocRef } from '@/lib/subpages'

/** Panel showing the document ("row:<id>" / "card:<id>"): where sub-pages open. */
export const SubPageRootContext = createContext<string | null>(null)

/** The document being edited, so "Página" can create sub-pages inside it. */
export const DocRefContext = createContext<DocRef | null>(null)

type LinkProps = { subpageId: string; title: string; icon: string }

function SubPageLink({ props }: { props: LinkProps }) {
  const root = useContext(SubPageRootContext)
  const open = () => {
    if (!props.subpageId) return
    if (!root) {
      toast.info('Abrí la fila o la tarjeta para entrar a esta página')
      return
    }
    useSubPages.getState().open(root, { id: props.subpageId, title: props.title, icon: props.icon || null })
  }
  return (
    <button
      type="button"
      contentEditable={false}
      onClick={open}
      className="flex w-full items-center gap-2 rounded-md px-1 py-1 text-left text-[15px] hover:bg-accent/70"
      title="Abrir página"
    >
      <span className="flex h-6 w-6 shrink-0 items-center justify-center text-lg leading-none">
        {props.icon || <FileText className="h-[18px] w-[18px] text-muted-foreground" />}
      </span>
      <span className="truncate border-b border-foreground/20 font-medium">{props.title || 'Sin título'}</span>
    </button>
  )
}

/**
 * "Página" block, like Notion's: a link to a page that lives inside this
 * document, with its own title, icon and content.
 */
export const SubPageBlock = createReactBlockSpec(
  {
    type: 'subpage',
    propSchema: {
      subpageId: { default: '' },
      title: { default: '' },
      icon: { default: '' },
    },
    content: 'none',
  },
  {
    render: (p) => <SubPageLink props={p.block.props as LinkProps} />,
    toExternalHTML: (p) => (
      <p>
        {(p.block.props as LinkProps).icon || '📄'} {(p.block.props as LinkProps).title || 'Sin título'}
      </p>
    ),
  }
)
