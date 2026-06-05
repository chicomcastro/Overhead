// Service worker do Overhead: cacheia o app shell para jogar offline.
// Estratégia: cache-first com fallback à rede; navegações offline caem no
// index.html cacheado. Bump CACHE ao mudar os assets para invalidar o cache.
const CACHE = "overhead-v1";
const ASSETS = [
  "./",
  "./index.html",
  "./style.css",
  "./game.js",
  "./manifest.webmanifest",
  "./icon.svg",
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  e.respondWith(
    caches.match(req).then((hit) => {
      if (hit) return hit;
      return fetch(req)
        .then((res) => {
          // guarda cópias de respostas same-origin bem-sucedidas
          if (res && res.ok && res.type === "basic") {
            const copy = res.clone();
            caches.open(CACHE).then((c) => { try { c.put(req, copy); } catch (err) {} });
          }
          return res;
        })
        .catch(() => (req.mode === "navigate" ? caches.match("./index.html") : undefined));
    })
  );
});
