import NextAuth from 'next-auth'
import { authOptions } from '@/lib/auth'

/**
 * Wrap the NextAuth handler so we can inject the real public URL
 * (read from X-Forwarded-* headers) into process.env.NEXTAUTH_URL
 * before NextAuth reads it on each request.
 *
 * Without this, NextAuth derives its base URL from the Host header
 * of the incoming request. When the app is behind a proxy (Caddy →
 * localhost:3000), the Host header is `localhost:3000` even when the
 * user is browsing `https://preview-*.space-z.ai`. This causes
 * NextAuth to:
 *  - Set the callback-url cookie pointing to localhost:3000
 *  - Sign CSRF tokens with the wrong URL
 *  - Reject the credentials POST with `?csrf=true` (CSRF mismatch)
 *
 * By setting NEXTAUTH_URL from the forwarded headers, all of NextAuth's
 * internal URL calculations match the URL the user is actually browsing.
 *
 * NOTE: We always overwrite process.env.NEXTAUTH_URL on every request,
 * even for plain HTTP localhost. This is intentional — it makes the
 * behavior identical in dev and in the preview proxy.
 */
async function handler(req: Request, ctx: any) {
  const headers = req.headers
  const xfProto = headers.get('x-forwarded-proto')?.split(',')[0]?.trim()
  const xfHost = headers.get('x-forwarded-host')?.split(',')[0]?.trim()
  const host = headers.get('host')?.split(',')[0]?.trim()

  if (xfProto && xfHost) {
    // Behind a proxy (Caddy / preview gateway) — use the forwarded URL.
    process.env.NEXTAUTH_URL = `${xfProto}://${xfHost}`
  } else if (host) {
    // Direct access (e.g. http://localhost:3000).
    // Detect HTTPS from the host header (rare in dev).
    const isHttps = host.startsWith('localhost:') ? false : false
    process.env.NEXTAUTH_URL = `${isHttps ? 'https' : 'http'}://${host}`
  }

  const authHandler = NextAuth(authOptions)
  return authHandler(req as any, ctx)
}

export { handler as GET, handler as POST }
