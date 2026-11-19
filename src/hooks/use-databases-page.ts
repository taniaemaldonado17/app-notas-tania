'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import * as api from '@/lib/api'
import type { Page } from '@/lib/types'
import type { DatabaseDef, DbRow, PageLayout, PropertyDef, RowValue, ViewDef } from '@/lib/db-types'

type State = { page: Page | null; loading: boolean; error: string | null }

type DatabasePatch = Partial<{ title: string; icon: string | null; properties: PropertyDef[]; views: ViewDef[] }>

export type DatabasesWorkspace = ReturnType<typeof useDatabasesPage>

/**
 * State of a 'databases' page: its databases, rows and dashboard layout.
 * Edits are applied optimistically and saved in the background.
 */
export function useDatabasesPage(pageId: string | null) {
  const [state, setState] = useState<State>({ page: null, loading: true, error: null })
  const pageRef = useRef<Page | null>(null)
  pageRef.current = state.page
  /** Saves in flight; background refresh waits until they finish. */
  const pendingRef = useRef(0)
  /** Per-database chain so schema saves reach the server in order. */
  const schemaChains = useRef(new Map<string, Promise<void>>())

  const commit = useCallback((next: Page) => {
    pageRef.current = next
    setState((s) => ({ ...s, page: next }))
  }, [])

  const load = useCallback(async () => {
    if (!pageId) return
    setState((s) => ({ ...s, loading: true, error: null }))
    try {
      const page = await api.fetchPage(pageId)
      pageRef.current = page
      setState({ page, loading: false, error: null })
    } catch (err) {
      setState({ page: null, loading: false, error: err instanceof Error ? err.message : 'Error al cargar' })
    }
  }, [pageId])

  useEffect(() => {
    if (pageId) load()
  }, [pageId, load])

  /** Background reload (no spinner) to pick up collaborators' changes. */
  const refresh = useCallback(async () => {
    if (!pageId || pendingRef.current > 0) return
    try {
      const page = await api.fetchPage(pageId)
      if (pendingRef.current > 0) return
      if (pageRef.current && pageRef.current.id !== page.id) return
      pageRef.current = page
      setState({ page, loading: false, error: null })
    } catch {
      // keep what is on screen
    }
  }, [pageId])

  async function track<T>(p: Promise<T>): Promise<T> {
    pendingRef.current++
    try {
      return await p
    } finally {
      pendingRef.current--
    }
  }

  /* ------------------------------ Helpers ------------------------------ */

  const mapDatabases = useCallback(
    (fn: (dbs: DatabaseDef[]) => DatabaseDef[]) => {
      const current = pageRef.current
      if (!current) return
      commit({ ...current, databases: fn(current.databases ?? []) })
    },
    [commit]
  )

  const mapRow = useCallback(
    (rowId: string, fn: (r: DbRow) => DbRow) => {
      mapDatabases((dbs) =>
        dbs.map((d) =>
          d.rows.some((r) => r.id === rowId) ? { ...d, rows: d.rows.map((r) => (r.id === rowId ? fn(r) : r)) } : d
        )
      )
    },
    [mapDatabases]
  )

  /* ------------------------------ Page meta ----------------------------- */

  const updatePageMeta = useCallback(
    async (payload: Partial<Pick<Page, 'title' | 'subtitle' | 'icon' | 'coverUrl'>>) => {
      const current = pageRef.current
      if (!current) return
      commit({ ...current, ...payload })
      try {
        await track(api.updatePage(current.id, payload))
      } catch {
        commit(current)
        toast.error('No se pudo guardar la página')
      }
    },
    [commit]
  )

  const updateLayout = useCallback(
    async (layout: PageLayout) => {
      const current = pageRef.current
      if (!current) return
      commit({ ...current, layout })
      try {
        await track(api.updatePage(current.id, { layout }))
      } catch {
        commit(current)
        toast.error('No se pudo guardar el diseño de la página')
      }
    },
    [commit]
  )

  /* ------------------------------ Databases ----------------------------- */

  /**
   * Change a database's schema/views/title. Applied on screen at once;
   * quick successive edits (typing in a filter) are merged and saved
   * together shortly after, in order.
   */
  const pendingSchema = useRef(new Map<string, { patch: DatabasePatch; timer: ReturnType<typeof setTimeout> }>())
  const updateDatabase = useCallback(
    (databaseId: string, patch: DatabasePatch) => {
      mapDatabases((dbs) => dbs.map((d) => (d.id === databaseId ? { ...d, ...patch } : d)))
      const existing = pendingSchema.current.get(databaseId)
      if (existing) {
        clearTimeout(existing.timer)
      } else {
        pendingRef.current++
      }
      const merged = { ...(existing?.patch ?? {}), ...patch }
      const timer = setTimeout(() => {
        pendingSchema.current.delete(databaseId)
        const prev = schemaChains.current.get(databaseId) ?? Promise.resolve()
        const next = prev
          .then(() => api.updateDatabase(databaseId, merged))
          .catch((err) => {
            toast.error(err instanceof Error ? err.message : 'No se pudo guardar la base de datos')
          })
          .finally(() => {
            pendingRef.current--
          })
        schemaChains.current.set(databaseId, next)
      }, 350)
      pendingSchema.current.set(databaseId, { patch: merged, timer })
    },
    [mapDatabases]
  )

  // Leaving the page: send schema edits that are still waiting.
  useEffect(() => {
    const pending = pendingSchema.current
    return () => {
      for (const [databaseId, { patch, timer }] of pending) {
        clearTimeout(timer)
        api.updateDatabase(databaseId, patch).catch(() => {})
      }
      pending.clear()
    }
  }, [])

  const createDatabase = useCallback(
    async (title?: string): Promise<DatabaseDef | null> => {
      const current = pageRef.current
      if (!current) return null
      try {
        const created = await track(api.createDatabase(current.id, title))
        mapDatabases((dbs) => [...dbs, created])
        return created
      } catch {
        toast.error('No se pudo crear la base de datos')
        return null
      }
    },
    [mapDatabases]
  )

  /**
   * Imports a table: a new database on this page, or rows appended to
   * `databaseId`. Throws on failure so the import dialog can show why.
   */
  const importDatabase = useCallback(
    async (
      payload:
        | { title: string; icon?: string | null; properties: PropertyDef[]; rows: { title: string; values: Record<string, RowValue> }[] }
        | { databaseId: string; addToViews?: string[]; properties: PropertyDef[]; rows: { title: string; values: Record<string, RowValue> }[] }
    ): Promise<DatabaseDef | null> => {
      const current = pageRef.current
      if (!current) return null
      const body = 'databaseId' in payload ? payload : { ...payload, pageId: current.id }
      const { database } = await track(api.importDatabase(body))
      mapDatabases((dbs) =>
        dbs.some((d) => d.id === database.id) ? dbs.map((d) => (d.id === database.id ? database : d)) : [...dbs, database]
      )
      return database
    },
    [mapDatabases]
  )

  const deleteDatabase = useCallback(
    async (databaseId: string) => {
      const current = pageRef.current
      if (!current) return
      // Also drop dashboard sections that pointed at it.
      const layout = current.layout
      const nextLayout: PageLayout | null = layout
        ? {
            ...layout,
            sections: layout.sections
              .filter((s) => !(s.type === 'view' && s.databaseId === databaseId))
              .map((s) =>
                s.type === 'stats'
                  ? { ...s, items: s.items.filter((i) => i.databaseId !== databaseId) }
                  : s.type === 'actions'
                    ? { ...s, items: s.items.filter((i) => i.databaseId !== databaseId) }
                    : s
              ),
          }
        : null
      commit({
        ...current,
        layout: nextLayout,
        databases: (current.databases ?? []).filter((d) => d.id !== databaseId),
      })
      try {
        await track(api.deleteDatabase(databaseId))
        if (nextLayout) await track(api.updatePage(current.id, { layout: nextLayout }))
        toast.success('Base de datos eliminada')
      } catch {
        commit(current)
        toast.error('No se pudo eliminar la base de datos')
      }
    },
    [commit]
  )

  /* -------------------------------- Rows -------------------------------- */

  const createRow = useCallback(
    async (databaseId: string, init: { title?: string; values?: Record<string, RowValue> } = {}): Promise<DbRow | null> => {
      try {
        const row = await track(api.createRow(databaseId, init))
        mapDatabases((dbs) => dbs.map((d) => (d.id === databaseId ? { ...d, rows: [...d.rows, row] } : d)))
        return row
      } catch {
        toast.error('No se pudo crear la fila')
        return null
      }
    },
    [mapDatabases]
  )

  const updateRowValues = useCallback(
    async (rowId: string, patch: Record<string, RowValue>) => {
      const before = pageRef.current
      const now = new Date().toISOString()
      mapRow(rowId, (r) => {
        const values = { ...r.values }
        for (const [k, v] of Object.entries(patch)) {
          if (v === null) delete values[k]
          else values[k] = v
        }
        return { ...r, values, updatedAt: now }
      })
      try {
        await track(api.updateRow(rowId, { values: patch }))
      } catch {
        if (before) commit(before)
        toast.error('No se pudo guardar el cambio')
      }
    },
    [mapRow, commit]
  )

  const updateRowMeta = useCallback(
    async (rowId: string, patch: Partial<{ title: string; icon: string | null }>) => {
      const before = pageRef.current
      mapRow(rowId, (r) => ({ ...r, ...patch, updatedAt: new Date().toISOString() }))
      try {
        await track(api.updateRow(rowId, patch))
      } catch {
        if (before) commit(before)
        toast.error('No se pudo guardar el cambio')
      }
    },
    [mapRow, commit]
  )

  const saveRowContent = useCallback(async (rowId: string, content: string | null) => {
    try {
      await track(api.updateRow(rowId, { content }))
    } catch {
      toast.error('No se pudo guardar el contenido')
    }
  }, [])

  const deleteRow = useCallback(
    async (rowId: string) => {
      const before = pageRef.current
      mapDatabases((dbs) => dbs.map((d) => ({ ...d, rows: d.rows.filter((r) => r.id !== rowId) })))
      try {
        await track(api.deleteRow(rowId))
      } catch {
        if (before) commit(before)
        toast.error('No se pudo eliminar')
      }
    },
    [mapDatabases, commit]
  )

  /**
   * Moves a row to just before `beforeId` (or to the end when null), in the
   * manual order of its database. Uses a position between the neighbours;
   * if there is no room (equal positions), renumbers the whole database.
   */
  const moveRow = useCallback(
    async (rowId: string, beforeId: string | null) => {
      const before = pageRef.current
      const database = before?.databases?.find((d) => d.rows.some((r) => r.id === rowId))
      if (!database) return
      const ordered = [...database.rows]
        .sort((a, b) => a.position - b.position || a.createdAt.localeCompare(b.createdAt))
        .filter((r) => r.id !== rowId)
      let at = beforeId ? ordered.findIndex((r) => r.id === beforeId) : ordered.length
      if (at < 0) at = ordered.length
      const prev = ordered[at - 1]
      const next = ordered[at]

      const updates = new Map<string, number>()
      if (!prev && !next) updates.set(rowId, 0)
      else if (!prev) updates.set(rowId, next.position - 1)
      else if (!next) updates.set(rowId, prev.position + 1)
      else if (next.position - prev.position > 1e-6) updates.set(rowId, (prev.position + next.position) / 2)
      else {
        const all = [...ordered.slice(0, at), { id: rowId } as DbRow, ...ordered.slice(at)]
        all.forEach((r, i) => {
          if (r.id === rowId || r.position !== i) updates.set(r.id, i)
        })
      }

      mapDatabases((dbs) =>
        dbs.map((d) =>
          d.id === database.id
            ? { ...d, rows: d.rows.map((r) => (updates.has(r.id) ? { ...r, position: updates.get(r.id)! } : r)) }
            : d
        )
      )
      try {
        await track(Promise.all([...updates].map(([id, position]) => api.updateRow(id, { position }))))
      } catch {
        if (before) commit(before)
        toast.error('No se pudo mover la fila')
      }
    },
    [mapDatabases, commit]
  )

  const duplicateRow = useCallback(
    async (rowId: string) => {
      const database = pageRef.current?.databases?.find((d) => d.rows.some((r) => r.id === rowId))
      const source = database?.rows.find((r) => r.id === rowId)
      if (!database || !source) return null
      const ordered = [...database.rows].sort((a, b) => a.position - b.position || a.createdAt.localeCompare(b.createdAt))
      const after = ordered[ordered.findIndex((r) => r.id === rowId) + 1] ?? null
      const copy = await createRow(source.databaseId, {
        title: source.title ? `${source.title} (copia)` : '',
        values: source.values,
      })
      // Place the copy right below the original, not at the end.
      if (copy && after) await moveRow(copy.id, after.id)
      return copy
    },
    [createRow, moveRow]
  )

  const setRowCommentCount = useCallback(
    (rowId: string, count: number) => mapRow(rowId, (r) => ({ ...r, commentCount: count })),
    [mapRow]
  )

  return {
    page: state.page,
    loading: state.loading,
    error: state.error,
    refresh,
    updatePageMeta,
    updateLayout,
    updateDatabase,
    createDatabase,
    importDatabase,
    deleteDatabase,
    createRow,
    updateRowValues,
    updateRowMeta,
    saveRowContent,
    deleteRow,
    duplicateRow,
    moveRow,
    setRowCommentCount,
  }
}
