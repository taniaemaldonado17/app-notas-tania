import type { MetadataRoute } from 'next'

/** Installable app ("Agregar a pantalla de inicio"): opens full screen and works offline. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Registro de tareas diarias',
    short_name: 'Notas',
    description: 'Notas, tableros y administración de obras.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#191919',
    theme_color: '#191919',
    lang: 'es-AR',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
