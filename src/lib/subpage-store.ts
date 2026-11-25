'use client'

import { create } from 'zustand'

/** One level of the sub-page breadcrumb. */
export type SubPageCrumb = { id: string; title: string; icon: string | null }

type State = {
  /** Document (row or card) whose panel is showing the sub-pages: "row:<id>" / "card:<id>". */
  root: string | null
  /** Open sub-pages, outermost first; the last one is on screen. */
  stack: SubPageCrumb[]
  /** Opens a sub-page from a document shown in the panel of `root`. */
  open: (root: string, crumb: SubPageCrumb) => void
  /** Opens a whole trail at once (links to a sub-page). */
  setTrail: (root: string, stack: SubPageCrumb[]) => void
  /** Back to the document that contains the current sub-page. */
  back: () => void
  /** Goes back to a level of the breadcrumb (-1 = the row or card itself). */
  backTo: (index: number) => void
  reset: () => void
  rename: (id: string, patch: { title?: string; icon?: string | null }) => void
}

export const useSubPages = create<State>((set) => ({
  root: null,
  stack: [],
  open: (root, crumb) =>
    set((s) => {
      if (s.root !== root) return { root, stack: [crumb] }
      const at = s.stack.findIndex((c) => c.id === crumb.id)
      return { stack: at >= 0 ? s.stack.slice(0, at + 1) : [...s.stack, crumb] }
    }),
  setTrail: (root, stack) => set({ root, stack }),
  back: () => set((s) => ({ stack: s.stack.slice(0, -1) })),
  backTo: (index) => set((s) => ({ stack: s.stack.slice(0, index + 1) })),
  reset: () => set({ root: null, stack: [] }),
  rename: (id, patch) => set((s) => ({ stack: s.stack.map((c) => (c.id === id ? { ...c, ...patch } : c)) })),
}))

/** Sub-pages open in the panel of a given row or card (empty if none). */
export function useOpenSubPages(root: string): SubPageCrumb[] {
  return useSubPages((s) => (s.root === root ? s.stack : EMPTY))
}
const EMPTY: SubPageCrumb[] = []
