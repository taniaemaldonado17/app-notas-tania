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

  /** Left navigation sidebar. */
  sidebarOpen: boolean
  setSidebarOpen: (open: boolean) => void

  /** Global search dialog (Ctrl+K). */
  searchDialogOpen: boolean
  setSearchDialogOpen: (open: boolean) => void

  /** Bumped whenever a card's favourite flag changes, so the sidebar reloads. */
  favoritesVersion: number
  bumpFavorites: () => void
}

export const useWorkspace = create<WorkspaceUIState>((set) => ({
  selectedCardId: null,
  openCard: (cardId) => set({ selectedCardId: cardId }),
  closeCard: () => set({ selectedCardId: null }),

  searchQuery: '',
  setSearchQuery: (q) => set({ searchQuery: q }),

  openColumnMenuId: null,
  setOpenColumnMenu: (id) => set({ openColumnMenuId: id }),

  sidebarOpen: false,
  setSidebarOpen: (open) => set({ sidebarOpen: open }),

  searchDialogOpen: false,
  setSearchDialogOpen: (open) => set({ searchDialogOpen: open }),

  favoritesVersion: 0,
  bumpFavorites: () => set((s) => ({ favoritesVersion: s.favoritesVersion + 1 })),
}))
