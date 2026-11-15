'use client'

import { useState } from 'react'
import { signIn } from 'next-auth/react'
import { toast } from 'sonner'
import { Loader2, NotebookPen } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

type Mode = 'login' | 'register'

export function AuthScreen() {
  const [mode, setMode] = useState<Mode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    try {
      if (mode === 'register') {
        const res = await fetch('/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password, name }),
        })
        const data = await res.json()
        if (!res.ok) {
          throw new Error(data?.error || 'No se pudo registrar')
        }
        toast.success('Cuenta creada. Iniciando sesión…')
      }

      const result = await signIn('credentials', {
        email,
        password,
        redirect: false,
      })

      // Debug log — will appear in the browser console (F12 → Console)
      console.log('[auth] signIn result:', result)

      // signIn returns { error, status, ok, url } when redirect: false
      // - ok: true → success
      // - ok: false, error: "CredentialsSignin" → wrong email/password
      // - ok: false, error: something else → CSRF or callback URL mismatch
      if (!result?.ok || result?.error) {
        const errMsg =
          result?.error === 'CredentialsSignin'
            ? 'Email o contraseña incorrectos'
            : result?.error
            ? `Error de autenticación: ${result.error}`
            : 'No se pudo iniciar sesión. Verificá tu conexión e intentá de nuevo.'
        toast.error(errMsg)
        setLoading(false)
        return
      }

      // Small delay to let the session cookie settle
      await new Promise((r) => setTimeout(r, 500))
      // Force a full reload so the page picks up the new session.
      window.location.reload()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error inesperado')
      setLoading(false)
    }
  }

  function fillDemo() {
    setEmail('demo@notas.local')
    setPassword('demo1234')
    setMode('login')
  }

  return (
    <div className="relative min-h-screen w-full overflow-hidden">
      {/* Decorative water-textured cover backdrop */}
      <div className="cover-water absolute inset-0 -z-10 opacity-90" />
      <div className="absolute inset-0 -z-10 bg-black/55" />

      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="w-full max-w-md rounded-xl border border-white/10 bg-card/95 p-8 shadow-2xl backdrop-blur">
          <div className="mb-6 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <NotebookPen className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-foreground">
                Registro de tareas diarias
              </h1>
              <p className="text-xs text-muted-foreground">
                Notas de trabajo en estilo Notion
              </p>
            </div>
          </div>

          <div className="mb-5 flex rounded-md border border-border bg-muted/50 p-1">
            <button
              type="button"
              onClick={() => setMode('login')}
              className={`flex-1 rounded-sm px-3 py-1.5 text-sm transition ${
                mode === 'login'
                  ? 'bg-card text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Iniciar sesión
            </button>
            <button
              type="button"
              onClick={() => setMode('register')}
              className={`flex-1 rounded-sm px-3 py-1.5 text-sm transition ${
                mode === 'register'
                  ? 'bg-card text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Registrarse
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'register' && (
              <div className="space-y-1.5">
                <Label htmlFor="name">Nombre (opcional)</Label>
                <Input
                  id="name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Tu nombre"
                  autoComplete="name"
                />
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="tu@email.com"
                autoComplete="email"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="password">Contraseña</Label>
              <Input
                id="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              />
              {mode === 'register' && (
                <p className="text-xs text-muted-foreground">
                  Mínimo 6 caracteres.
                </p>
              )}
            </div>

            <Button
              type="submit"
              disabled={loading}
              className="w-full"
              variant="default"
            >
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {mode === 'login' ? 'Iniciar sesión' : 'Crear cuenta'}
            </Button>
          </form>

          <div className="mt-6 rounded-md border border-dashed border-border bg-muted/40 p-3 text-xs text-muted-foreground">
            <p className="font-medium text-foreground">Cuenta demo</p>
            <p className="mt-1">
              Email: <span className="font-mono text-foreground">demo@notas.local</span>
            </p>
            <p>
              Contraseña: <span className="font-mono text-foreground">demo1234</span>
            </p>
            <button
              type="button"
              onClick={fillDemo}
              className="mt-2 text-foreground underline underline-offset-2 hover:opacity-80"
            >
              Rellenar automáticamente
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
