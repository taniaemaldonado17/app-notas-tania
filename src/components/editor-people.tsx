'use client'

import { createContext, useContext } from 'react'

export type EditorPerson = { id: string; name: string | null; email: string }

/** People of the page, for blocks inside the editor (mentions, cronograma). */
export const EditorPeopleContext = createContext<EditorPerson[]>([])

export const useEditorPeople = () => useContext(EditorPeopleContext)

export const personName = (p: EditorPerson) => p.name?.trim() || p.email.split('@')[0]
