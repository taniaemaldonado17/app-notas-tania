'use client'

import { signOut, useSession } from 'next-auth/react'
import {
  Avatar,
  AvatarFallback,
} from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { LogOut, Moon, Sun } from 'lucide-react'
import { useTheme } from 'next-themes'
import { toast } from 'sonner'

export function UserMenu() {
  const { data: session } = useSession()
  const { theme, setTheme } = useTheme()

  const name = session?.user?.name ?? session?.user?.email ?? 'Usuario'
  const email = session?.user?.email ?? ''
  const initials = name
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()

  async function handleLogout() {
    await signOut({ redirect: false })
    toast.success('Sesión cerrada')
    window.location.reload()
  }

  function toggleTheme() {
    setTheme(theme === 'dark' ? 'light' : 'dark')
  }

  return (
    <div className="flex items-center gap-2">
      <Button
        variant="ghost"
        size="icon"
        onClick={toggleTheme}
        aria-label="Cambiar tema"
        title={theme === 'dark' ? 'Modo claro' : 'Modo oscuro'}
        className="h-8 w-8 text-muted-foreground hover:text-foreground"
      >
        {theme === 'dark' ? (
          <Sun className="h-4 w-4" />
        ) : (
          <Moon className="h-4 w-4" />
        )}
      </Button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="flex items-center gap-2 rounded-md p-1 pr-2 hover:bg-accent transition">
            <Avatar className="h-7 w-7">
              <AvatarFallback className="bg-primary/10 text-[10px] font-medium text-foreground">
                {initials || '??'}
              </AvatarFallback>
            </Avatar>
            <span className="hidden text-xs text-muted-foreground sm:inline">
              {name}
            </span>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel className="text-xs text-muted-foreground">
            <div className="flex flex-col gap-0.5">
              <span className="truncate font-medium text-foreground">
                {name}
              </span>
              <span className="truncate text-muted-foreground">{email}</span>
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={toggleTheme}
            className="cursor-pointer text-sm"
          >
            {theme === 'dark' ? (
              <>
                <Sun className="mr-2 h-4 w-4" />
                Modo claro
              </>
            ) : (
              <>
                <Moon className="mr-2 h-4 w-4" />
                Modo oscuro
              </>
            )}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={handleLogout}
            className="cursor-pointer text-sm text-destructive focus:text-destructive"
          >
            <LogOut className="mr-2 h-4 w-4" />
            Cerrar sesión
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
