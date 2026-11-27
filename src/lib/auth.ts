import type { NextAuthOptions } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import { db } from '@/lib/db'
import { verifyPassword } from '@/lib/bcrypt'
import { esAdmin } from '@/lib/admins'

export const authOptions: NextAuthOptions = {
  session: {
    strategy: 'jwt',
  },
  pages: {
    signIn: '/',
  },
  // Force simple cookie names without the `__Host-` / `__Secure-` prefixes
  // that NextAuth would otherwise add. Those prefixes have stricter
  // requirements (no Domain attribute, must be Path=/) that can break
  // with proxies.
  //
  // We use `SameSite=None` so the cookies are sent on cross-origin fetch
  // requests (the NextAuth `signIn()` client helper does a fetch XHR,
  // which is treated as cross-site under strict SameSite policies).
  // `SameSite=None` requires `Secure`, which is fine because the preview
  // gateway always serves the app over HTTPS.
  cookies: {
    sessionToken: {
      name: 'next-auth.session-token',
      options: {
        httpOnly: true,
        sameSite: 'none',
        path: '/',
        secure: true,
      },
    },
    callbackUrl: {
      name: 'next-auth.callback-url',
      options: {
        httpOnly: true,
        sameSite: 'none',
        path: '/',
        secure: true,
      },
    },
    csrfToken: {
      name: 'next-auth.csrf-token',
      options: {
        httpOnly: true,
        sameSite: 'none',
        path: '/',
        secure: true,
      },
    },
    pkceCodeVerifier: {
      name: 'next-auth.pkce.code_verifier',
      options: {
        httpOnly: true,
        sameSite: 'none',
        path: '/',
        secure: true,
      },
    },
  },
  providers: [
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null
        }

        const user = await db.user.findUnique({
          where: { email: credentials.email.toLowerCase() },
        })

        if (!user) {
          return null
        }

        const isValid = await verifyPassword(
          credentials.password,
          user.passwordHash
        )

        if (!isValid) {
          return null
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name ?? undefined,
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id
      }
      return token
    },
    async session({ session, token }) {
      if (session.user && token.id) {
        ;(session.user as { id?: string }).id = token.id as string
        // Shows or hides admin-only things (sharing, Cómputo y presupuesto).
        // The server checks it again on every request.
        session.user.esAdmin = await esAdmin(token.id as string)
      }
      return session
    },
    async redirect({ url, baseUrl }) {
      if (url.startsWith('/')) return `${baseUrl}${url}`
      try {
        const u = new URL(url)
        const b = new URL(baseUrl)
        if (u.origin === b.origin) return url
      } catch {
        // ignore parse errors
      }
      return baseUrl
    },
  },
  secret: process.env.NEXTAUTH_SECRET || 'dev-secret-change-in-production',
}
