import type { Metadata } from 'next'
import { findPublicLink, publicDoc, rewriteFileUrls } from '@/lib/public-links'
import { PublicDocView } from '@/components/public-doc-view'

export const dynamic = 'force-dynamic'

type Props = {
  params: Promise<{ token: string }>
  searchParams: Promise<{ p?: string | string[] }>
}

async function load({ params, searchParams }: Props) {
  const { token } = await params
  const p = (await searchParams).p
  const subpageId = typeof p === 'string' && p ? p : null
  const link = await findPublicLink(token)
  if (!link) return { token, doc: null, subpageId }
  return { token, doc: await publicDoc(link, subpageId), subpageId }
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  const { doc } = await load(props)
  return {
    title: doc ? `${doc.icon ? `${doc.icon} ` : ''}${doc.title || 'Sin título'}` : 'Enlace no disponible',
    robots: { index: false, follow: false },
  }
}

/** Public, read-only view of a shared document (no account needed). */
export default async function SharedDocPage(props: Props) {
  const { token, doc, subpageId } = await load(props)
  if (!doc) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-white px-6 text-center text-[#1d1d1f]">
        <div>
          <p className="text-lg font-semibold">Este enlace no está disponible</p>
          <p className="mt-1 text-sm text-[#86868b]">Puede que hayan dejado de compartir la página o que ya no exista.</p>
        </div>
      </main>
    )
  }
  return (
    <PublicDocView
      token={token}
      isSubPage={!!subpageId}
      doc={{
        title: doc.title,
        icon: doc.icon,
        coverUrl: doc.coverUrl ? rewriteFileUrls(doc.coverUrl, token, subpageId) : null,
        content: doc.content ? rewriteFileUrls(doc.content, token, subpageId) : null,
        updatedAt: doc.updatedAt,
      }}
    />
  )
}
