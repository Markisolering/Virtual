// Service worker: snabb start, offlinestöd och uppdateringar.
//
// BUILD_ID byts ut mot ett unikt id vid varje bygge (se vite.config.js). Därför ser webbläsaren
// en ny service worker efter varje publicering, och appen kan fråga om den ska uppdateras.
// Den nya versionen tar över först när användaren trycker på "Uppdatera" (meddelandet SKIP_WAITING).
const BUILD = '__BUILD_ID__';
const SHELL = `shell-${BUILD}`;
// Personmodellerna är stora (ca 25 MB) och ändras sällan, så de ligger i en egen cache som överlever
// uppdateringar. Animationerna har en egen cache. Höj respektive version om filerna i
// public/avatars eller public/anims byts ut, så hämtas bara de filerna på nytt.
const AVATARS = 'models-v1'; // hette så innan animationerna fick en egen cache
const ANIMS = 'anims-v2';
const AVATARS_HQ = 'avatars-hq-v1'; // närbildsmodellerna
const SCANHEAD = 'scanhead-v1'; // huvudstudions skannade huvud (public/scanhead)
const KEEP = [SHELL, AVATARS, ANIMS, AVATARS_HQ, SCANHEAD];

self.addEventListener('install', (event) => {
  event.waitUntil(
    Promise.all([
      caches.open(SHELL).then((c) => c.addAll(['./', './manifest.webmanifest'])),
      caches.open(ANIMS).then((c) => c.addAll(['./anims/f.glb', './anims/m.glb'])),
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
      .then((keys) => Promise.all(keys.filter((k) => !KEEP.includes(k)).map((k) => caches.delete(k))))
      // Gamla animationer kan ligga kvar i personcachen från tidigare versioner
      .then(() => caches.open(AVATARS))
      .then((c) => c.keys().then((reqs) => Promise.all(reqs.filter((r) => r.url.includes('/anims/')).map((r) => c.delete(r)))))
      .then(() => self.clients.claim()),
  );
});

function cacheFirst(req, cacheName) {
  return caches.open(cacheName).then((cache) =>
    cache.match(req).then(
      (hit) =>
        hit ||
        fetch(req).then((res) => {
          if (res.ok) cache.put(req, res.clone());
          return res;
        }),
    ),
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
  if (path.includes('/scanhead/')) {
    event.respondWith(cacheFirst(req, SCANHEAD));
  } else if (path.includes('/avatars-hq/') && !path.endsWith('.json')) {
    event.respondWith(cacheFirst(req, AVATARS_HQ));
  } else if (path.includes('/anims/')) {
    event.respondWith(cacheFirst(req, ANIMS));
  } else if (path.includes('/avatars/') && !path.endsWith('.json')) {
    event.respondWith(cacheFirst(req, AVATARS));
  } else if (/\/(assets|icons)\//.test(path)) {
    // Byggda filer har innehållshash i namnet och ändras aldrig
    event.respondWith(cacheFirst(req, SHELL));
  } else {
    event.respondWith(networkFirst(req));
  }
});
