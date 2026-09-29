// Makes the app open without internet.
// Strategy: try the network first (so updates arrive), fall back to the saved copy.
const CACHE = 'alone-time-v6';
const FILES = [
  './', 'index.html', 'styles.css', 'manifest.webmanifest', 'icon.svg',
  'icon-180.png', 'icon-192.png', 'icon-512.png',
  'src/app.js', 'src/training.js', 'src/store.js', 'src/chart.js', 'src/progression.js', 'src/backup.js', 'src/suggestion.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true })),
  );
});
