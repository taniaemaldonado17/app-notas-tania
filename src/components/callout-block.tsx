'use client'

import { defaultProps } from '@blocknote/core'
import { createReactBlockSpec } from '@blocknote/react'
import { EmojiPicker } from '@/components/emoji-picker'

/**
 * Notion-style callout ("Destacado"): an emoji and a shaded box. Blocks nested
 * under it (Tab) stay inside the box (see .bn-block:has(> [data-content-type=callout]) in globals.css).
 */
export const CalloutBlock = createReactBlockSpec(
  {
    type: 'callout',
    propSchema: {
      textColor: defaultProps.textColor,
      backgroundColor: defaultProps.backgroundColor,
      textAlignment: defaultProps.textAlignment,
      emoji: { default: '💡' },
    },
    content: 'inline',
  },
  {
    render: (p) => {
      const editable = p.editor.isEditable
      const emoji = p.block.props.emoji
      const icon = (
        <button
          type="button"
          className="callout-emoji"
          contentEditable={false}
          disabled={!editable}
          title={editable ? 'Cambiar ícono' : undefined}
          aria-label="Ícono del destacado"
        >
          {emoji || '💡'}
        </button>
      )
      return (
        <div className="callout">
          {editable ? (
            <EmojiPicker onSelect={(e) => p.editor.updateBlock(p.block, { props: { emoji: e } })}>{icon}</EmojiPicker>
          ) : (
            icon
          )}
          <div ref={p.contentRef} className="callout-content" />
        </div>
      )
    },
    toExternalHTML: (p) => (
      <blockquote>
        {p.block.props.emoji} <span ref={p.contentRef} />
      </blockquote>
    ),
  }
)
