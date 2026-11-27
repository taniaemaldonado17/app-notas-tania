import 'next-auth'
import 'next-auth/jwt'

declare module 'next-auth' {
  interface Session {
    user: {
      id?: string
      /** Tania and Lucas: can share and use Cómputo y presupuesto. */
      esAdmin?: boolean
      name?: string | null
      email?: string | null
      image?: string | null
    }
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id?: string
  }
}
