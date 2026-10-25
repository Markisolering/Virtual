// Service worker: snabb start, offlinestöd och uppdateringar.
//
// BUILD_ID byts ut mot ett unikt id vid varje bygge (se vite.config.js). Därför ser webbläsaren
// en ny service worker efter varje publicering, och appen kan fråga om den ska uppdateras.
// Den nya versionen tar över först när användaren trycker på "Uppdatera" (meddelandet SKIP_WAITING).
const BUILD = '__BUILD_ID__';
const SHELL = `shell-${BUILD}`;
// Modellerna är stora (ca 25 MB) och ändras sällan, så de ligger i en egen cache som överlever
// uppdateringar. Höj versionen här om filerna i public/avatars eller public/anims byts ut.
const MODELS = 'models-v1';

self.addEventListener('install', (event) => {
  event.waitUntil(
    Promise.all([
      caches.open(SHELL).then((c) => c.addAll(['./', './manifest.webmanifest'])),
      caches.open(MODELS).then((c) => c.addAll(['./anims/f.glb', './anims/m.glb'])),
    ]),
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== SHELL && k !== MODELS).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

function cacheFirst(req, cacheName) {
  return caches.match(req).then(
    (hit) =>
      hit ||
      fetch(req).then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(cacheName).then((c) => c.put(req, copy));
        }
        return res;
      }),
  );
}

function networkFirst(req) {
  return fetch(req)
    .then((res) => {
      if (res.ok) {
        const copy = res.clone();
        caches.open(SHELL).then((c) => c.put(req, copy));
      }
      return res;
    })
    .catch(() => caches.match(req).then((hit) => hit || caches.match('./')));
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return; // t.ex. anrop till Claude går alltid direkt till nätet

  const path = url.pathname;
  if (/\/(avatars|anims)\//.test(path) && !path.endsWith('.json')) {
    event.respondWith(cacheFirst(req, MODELS));
  } else if (/\/(assets|icons)\//.test(path)) {
    // Byggda filer har innehållshash i namnet och ändras aldrig
    event.respondWith(cacheFirst(req, SHELL));
  } else {
    event.respondWith(networkFirst(req));
  }
});
