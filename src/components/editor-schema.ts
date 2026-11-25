import { BlockNoteSchema, defaultBlockSpecs, defaultInlineContentSpecs } from '@blocknote/core'
import { EmbedBlock } from '@/components/embed-block'
import { ImageRowBlock } from '@/components/image-row-block'
import { Mention } from '@/components/mention-inline'
import { CalloutBlock } from '@/components/callout-block'
import { TimelineBlock } from '@/components/timeline-block'
import { SubPageBlock } from '@/components/subpage-block'

/** Blocks the documents use: shared by the editor and the read-only view (PDF, shared links). */
export const docSchema = BlockNoteSchema.create({
  blockSpecs: { ...defaultBlockSpecs, embed: EmbedBlock(), imageRow: ImageRowBlock(), callout: CalloutBlock(), timeline: TimelineBlock(), subpage: SubPageBlock() },
  inlineContentSpecs: { ...defaultInlineContentSpecs, mention: Mention },
})
