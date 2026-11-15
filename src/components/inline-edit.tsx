'use client'

import { useEffect, useRef, useState } from 'react'

type Props = {
  value: string
  onCommit: (next: string) => void
  className?: string
  placeholder?: string
  ariaLabel?: string
  multiline?: boolean
  /** Disable the inline edit (used while a parent is loading). */
  disabled?: boolean
}

/**
 * A controlled inline-edit field: shows static text; clicking switches
 * to an <input>/<textarea> focused + selected; blur or Enter commits,
 * Escape cancels.
 */
export function InlineEdit({
  value,
  onCommit,
  className,
  placeholder,
  ariaLabel,
  multiline,
  disabled,
}: Props) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const inputRef = useRef<HTMLTextAreaElement | HTMLInputElement | null>(null)

  useEffect(() => {
    setDraft(value)
  }, [value])

  useEffect(() => {
    if (editing && inputRef.current) {
      const el = inputRef.current
      el.focus()
      // Select all on entry
      if (el instanceof HTMLInputElement) {
        el.select()
      } else if (el instanceof HTMLTextAreaElement) {
        el.setSelectionRange(0, el.value.length)
      }
    }
  }, [editing])

  function commit() {
    setEditing(false)
    const next = draft.trim()
    if (next && next !== value) {
      onCommit(next)
    } else if (!next) {
      // Reset to previous value if empty
      setDraft(value)
    }
  }

  function cancel() {
    setDraft(value)
    setEditing(false)
  }

  if (editing) {
    const sharedProps = {
      ref: inputRef as any,
      value: draft,
      onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
        setDraft(e.target.value),
      onBlur: commit,
      onKeyDown: (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey && !multiline) {
          e.preventDefault()
          commit()
        } else if (e.key === 'Enter' && e.shiftKey && multiline) {
          // Allow newline
        } else if (e.key === 'Escape') {
          e.preventDefault()
          cancel()
        }
      },
      className,
      placeholder,
      'aria-label': ariaLabel,
      disabled,
    } as const

    return multiline ? (
      <textarea {...sharedProps} rows={3} />
    ) : (
      <input {...sharedProps} type="text" />
    )
  }

  return (
    <span
      role="button"
      tabIndex={0}
      className={className}
      onClick={() => !disabled && setEditing(true)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          if (!disabled) setEditing(true)
        }
      }}
      title="Click para editar"
    >
      {value || placeholder}
    </span>
  )
}
