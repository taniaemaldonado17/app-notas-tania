'use client'

import { createContext, useContext } from 'react'
import type { DatabasesWorkspace } from '@/hooks/use-databases-page'
import type { DatabaseDef } from '@/lib/db-types'
import type { ResolveCtx } from '@/lib/db-resolve'

export type Person = { id: string; name: string | null; email: string }

export type DbContextValue = {
  ws: DatabasesWorkspace
  /** All databases of the page (for relations, backlinks, formulas). */
  ctx: ResolveCtx
  /** People who can be assigned (page owner + members). */
  people: Person[]
  openRow: (rowId: string) => void
  getDatabase: (id: string) => DatabaseDef | undefined
}

const DbContext = createContext<DbContextValue | null>(null)

export const DbProvider = DbContext.Provider

export function useDb(): DbContextValue {
  const v = useContext(DbContext)
  if (!v) throw new Error('useDb must be used inside <DbProvider>')
  return v
}

export function personLabel(p: Person | undefined): string {
  if (!p) return 'Persona'
  return p.name || p.email
}
