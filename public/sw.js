/*
 * Service worker: lets the app open and show what was already seen without
 * connection (work in the field).
 *
 * - Pages: network first; without connection, the last copy of the app.
 * - /_next/static (hashed, never change): cache first.
 * - API reads (GET /api/...): network first; without connection, the last
 *   answer seen. Writes are never cached: budget changes made offline go
 *   through their own queue (src/lib/presupuesto/offline.ts).
 *
 * Bump VERSION to drop old caches.
 */
const VERSION = 'v1'
const SHELL = `shell-${VERSION}`
const STATIC = `static-${VERSION}`
const API = `api-${VERSION}`
const TIMEOUT_MS = 10000

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then((c) => c.add('/'))
      .catch(() => {})
      .then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => ![SHELL, STATIC, API].includes(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  )
})

/** fetch() that gives up after a while: weak signal shouldn't hang the app. */
function conTiempo(request) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), TIMEOUT_MS)
    fetch(request).then(
      (r) => {
        clearTimeout(t)
        resolve(r)
      },
      (e) => {
        clearTimeout(t)
        reject(e)
      }
    )
  })
}

function sinConexion() {
  return new Response(JSON.stringify({ error: 'Sin conexión' }), {
    status: 503,
    headers: { 'Content-Type': 'application/json', 'x-sin-conexion': '1' },
  })
}

/** API reads that make no sense to keep (or are kept elsewhere). */
function noGuardar(path) {
  return (
    (path.startsWith('/api/auth/') && path !== '/api/auth/session') ||
    path.endsWith('/snapshot') ||
    path.endsWith('/pdf') ||
    path.startsWith('/api/files') ||
    path.startsWith('/api/upload')
  )
}

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return

  // App pages
  if (req.mode === 'navigate') {
    event.respondWith(
      conTiempo(req)
        .then((res) => {
          // The whole app lives at "/" (other pages, like invitations, need connection anyway).
          if (res.ok && url.pathname === '/') {
            const copia = res.clone()
            caches.open(SHELL).then((c) => c.put('/', copia))
          }
          return res
        })
        .catch(() => caches.match('/', { cacheName: SHELL }).then((r) => r || Response.error()))
    )
    return
  }

  // Build files: content-hashed, safe to keep forever
  if (url.pathname.startsWith('/_next/static/') || /^\/(icon|apple-icon|manifest)/.test(url.pathname)) {
    event.respondWith(
      caches.match(req, { cacheName: STATIC }).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) {
              const copia = res.clone()
              caches.open(STATIC).then((c) => c.put(req, copia))
            }
            return res
          })
      )
    )
    return
  }

  // Data reads
  if (url.pathname.startsWith('/api/') && !noGuardar(url.pathname)) {
    event.respondWith(
      conTiempo(req)
        .then((res) => {
          if (res.ok && (res.headers.get('content-type') || '').includes('application/json')) {
            const copia = res.clone()
            caches.open(API).then((c) => c.put(req, copia))
          }
          return res
        })
        .catch(() => caches.match(req, { cacheName: API }).then((r) => r || sinConexion()))
    )
  }
})
