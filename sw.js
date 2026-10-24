/* StoryCanvas Service Worker
 * 策略：
 *  - 导航/入口 HTML：network-first（保证线上更新能及时拿到），失败时回落缓存（离线可开）。
 *  - 其余同源静态资源：stale-while-revalidate（先用缓存，后台刷新）。
 *  - 跨域请求与 POST 等直接放行。
 */
const CACHE = 'storycanvas-v2';
const SHELL = [
  './',
  './index.html',
  './manifest.json',
  './css/style.css',
  './js/util.js',
  './js/store.js',
  './js/gen.js',
  './js/nodes.js',
  './js/edges.js',
  './js/canvas.js',
  './js/inspector.js',
  './js/timeline.js',
  './js/app.js',
  './js/exportkit.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/favicon-64.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;

  const isNav = req.mode === 'navigate' ||
    (req.headers.get('accept') || '').includes('text/html');

  if (isNav) {
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put('./index.html', copy));
          return res;
        })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  e.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
