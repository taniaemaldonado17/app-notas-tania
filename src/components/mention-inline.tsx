'use client'

import { createReactInlineContentSpec } from '@blocknote/react'

/**
 * "@persona" inside the text. Stores who was mentioned so the server can
 * email them (see src/lib/mentions.ts).
 */
export const Mention = createReactInlineContentSpec(
  {
    type: 'mention',
    propSchema: {
      userId: { default: '' },
      name: { default: '' },
    },
    content: 'none',
  },
  {
    render: (p) => (
      <span className="mention" data-user-id={p.inlineContent.props.userId}>
        @{p.inlineContent.props.name || 'alguien'}
      </span>
    ),
  }
)
