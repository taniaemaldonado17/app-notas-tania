'use client'

import { useState } from 'react'
import { Search, X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { useWorkspace } from '@/lib/workspace-store'

export function SearchBox() {
  const { searchQuery, setSearchQuery } = useWorkspace()
  const [focused, setFocused] = useState(false)

  return (
    <div className="relative w-full max-w-md">
      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        type="text"
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder="Filtrar tarjetas de esta página…"
        className={`h-9 rounded-md border-border bg-card pl-8 pr-8 text-sm transition ${
          focused ? 'ring-1 ring-ring' : ''
        }`}
        aria-label="Filtrar tarjetas de esta página"
      />
      {searchQuery && (
        <button
          onClick={() => setSearchQuery('')}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-sm p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
          aria-label="Limpiar búsqueda"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  )
}
