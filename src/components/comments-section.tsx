'use client'

import { useState } from 'react'
import { ArrowUp, Trash2 } from 'lucide-react'
import type { CardComment } from '@/lib/types'
import { formatDateAR } from '@/lib/utils'

type Props = {
  comments: CardComment[]
  onAdd: (text: string) => Promise<void> | void
  onDelete: (commentId: string) => Promise<void> | void
}

function initialOf(c: CardComment): string {
  return (c.user.name || c.user.email || '?').trim().charAt(0).toUpperCase()
}

/** Card discussion: list of comments plus an "add a comment" box. */
export function CommentsSection({ comments, onAdd, onDelete }: Props) {
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)

  async function submit() {
    const text = draft.trim()
    if (!text || sending) return
    setSending(true)
    try {
      await onAdd(text)
      setDraft('')
    } finally {
      setSending(false)
    }
  }

  return (
    <section className="space-y-3">
      {comments.length > 0 && (
        <ul className="space-y-3">
          {comments.map((c) => (
            <li key={c.id} className="group flex items-start gap-2.5">
              <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-semibold text-foreground">
                {initialOf(c)}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <span className="truncate text-sm font-semibold text-foreground">
                    {c.user.name || c.user.email}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {formatDateAR(c.createdAt)}
                  </span>
                  <button
                    type="button"
                    onClick={() => onDelete(c.id)}
                    className="ml-auto shrink-0 rounded-sm p-0.5 text-muted-foreground opacity-0 transition hover:text-destructive focus:opacity-100 group-hover:opacity-100"
                    aria-label="Eliminar comentario"
                    title="Eliminar comentario"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
                <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground">
                  {c.text}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-start gap-2.5">
        <span className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] text-muted-foreground">
          +
        </span>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              submit()
            }
          }}
          rows={1}
          placeholder="Agregar un comentario…"
          aria-label="Agregar un comentario"
          className="min-h-8 flex-1 resize-none bg-transparent py-1.5 text-sm leading-relaxed outline-none placeholder:text-muted-foreground/70 [field-sizing:content]"
        />
        {draft.trim() && (
          <button
            type="button"
            onClick={submit}
            disabled={sending}
            className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition hover:opacity-90 disabled:opacity-50"
            aria-label="Enviar comentario"
            title="Enviar (Enter)"
          >
            <ArrowUp className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </section>
  )
}
