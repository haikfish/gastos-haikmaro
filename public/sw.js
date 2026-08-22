/* El service worker: la app abre aunque no haya señal.
 *
 * Dos reglas y nada más:
 * - La página (navegación) va red-primero con caché de respaldo: las
 *   versiones nuevas llegan apenas hay señal, y sin señal abre la última.
 * - Los archivos propios (js, css, fuentes, íconos) van caché-primero:
 *   Vite les pone un hash en el nombre, así que uno nuevo es una URL nueva
 *   y el caché viejo jamás pisa una versión nueva.
 * - Al buzón (supabase.co) este worker NO lo toca: la cola offline de la
 *   app ya maneja la falta de red, y cachear respuestas de datos mentiría.
 */

const CACHE = 'gastos-v2'

self.addEventListener('install', (evento) => {
  evento.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(['./'])).then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    caches
      .keys()
      .then((claves) => Promise.all(claves.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (evento) => {
  const pedido = evento.request
  if (pedido.method !== 'GET') return
  const url = new URL(pedido.url)
  if (url.origin !== location.origin) return // el buzón no se cachea

  if (pedido.mode === 'navigate') {
    evento.respondWith(
      // no-cache: revalida contra el servidor en vez de aceptar el caché HTTP
      // de Pages (10 minutos). Sin esto, una versión nueva tardaba hasta 10
      // minutos en llegar al teléfono y no había forma de saberlo.
      fetch(pedido, { cache: 'no-cache' })
        .then((r) => {
          const copia = r.clone()
          void caches.open(CACHE).then((c) => c.put('./', copia))
          return r
        })
        .catch(() => caches.match('./')),
    )
    return
  }

  evento.respondWith(
    caches.match(pedido).then(
      (guardada) =>
        guardada ??
        fetch(pedido).then((r) => {
          const copia = r.clone()
          void caches.open(CACHE).then((c) => c.put(pedido, copia))
          return r
        }),
    ),
  )
})
