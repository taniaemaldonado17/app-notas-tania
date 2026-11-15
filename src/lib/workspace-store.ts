'use client'

import { create } from 'zustand'

type WorkspaceUIState = {
  /** Card currently open in the side panel (or null). */
  selectedCardId: string | null
  /** Open the side panel for a given card. */
  openCard: (cardId: string) => void
  /** Close the side panel. */
  closeCard: () => void

  /** Live search query for client-side card filtering. */
  searchQuery: string
  setSearchQuery: (q: string) => void

  /** Whether the column context menu is open (only one at a time). */
  openColumnMenuId: string | null
  setOpenColumnMenu: (id: string | null) => void
}

export const useWorkspace = create<WorkspaceUIState>((set) => ({
  selectedCardId: null,
  openCard: (cardId) => set({ selectedCardId: cardId }),
  closeCard: () => set({ selectedCardId: null }),

  searchQuery: '',
  setSearchQuery: (q) => set({ searchQuery: q }),

  openColumnMenuId: null,
  setOpenColumnMenu: (id) => set({ openColumnMenuId: id }),
}))
