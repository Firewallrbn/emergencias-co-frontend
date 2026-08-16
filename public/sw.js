/**
 * Service worker de la PWA.
 *
 * Objetivo único y acotado: que quien ya abrió la aplicación una vez pueda volver a
 * abrirla y redactar un reporte aunque no tenga señal. El envío lo resuelve la cola en
 * IndexedDB (lib/outbox.ts); aquí solo se garantiza que la interfaz cargue.
 *
 * Estrategias, distintas a propósito según el recurso:
 *
 *   - Navegación: red primero, caché como respaldo. Una aplicación de emergencias debe
 *     mostrar la versión más reciente cuando puede; servir una copia vieja teniendo
 *     conexión sería peor que tardar medio segundo más.
 *   - Estáticos: caché primero. Son inmutables (Next les pone hash en el nombre), así que
 *     revalidarlos solo gasta batería y datos.
 *   - API: nunca se cachea. Devolver despachos de hace una hora como si fueran actuales
 *     induciría a error a quien coordina el rescate.
 */

const VERSION = 'v1';
const CACHE_APP = `emergencias-app-${VERSION}`;
const RESPALDO = '/reportar';

self.addEventListener('install', (evento) => {
  evento.waitUntil(
    caches.open(CACHE_APP).then((cache) => cache.addAll(['/', RESPALDO])),
  );
  // Activa esta versión sin esperar a que se cierren las pestañas abiertas.
  self.skipWaiting();
});

self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    caches
      .keys()
      .then((nombres) =>
        Promise.all(
          nombres.filter((n) => n.startsWith('emergencias-app-') && n !== CACHE_APP).map((n) => caches.delete(n)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (evento) => {
  const solicitud = evento.request;

  if (solicitud.method !== 'GET') return;

  const url = new URL(solicitud.url);

  // Nunca cachear llamadas a la API ni a Supabase: los datos operativos caducan enseguida.
  if (url.pathname.startsWith('/v1/') || url.hostname.includes('execute-api') || url.hostname.includes('supabase')) {
    return;
  }

  if (solicitud.mode === 'navigate') {
    evento.respondWith(
      fetch(solicitud)
        .then((respuesta) => {
          const copia = respuesta.clone();
          caches.open(CACHE_APP).then((cache) => cache.put(solicitud, copia));
          return respuesta;
        })
        .catch(async () => (await caches.match(solicitud)) ?? (await caches.match(RESPALDO)) ?? Response.error()),
    );
    return;
  }

  if (url.origin === self.location.origin) {
    evento.respondWith(
      caches.match(solicitud).then(
        (enCache) =>
          enCache ??
          fetch(solicitud).then((respuesta) => {
            if (respuesta.ok) {
              const copia = respuesta.clone();
              caches.open(CACHE_APP).then((cache) => cache.put(solicitud, copia));
            }
            return respuesta;
          }),
      ),
    );
  }
});
