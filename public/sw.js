// Service worker de L’Atelier de français : l'appli s'ouvre même sans réseau.
// - L'interface (pages, styles, police, images) est gardée sur le téléphone dès la première visite.
// - Les voix de Léo sont gardées au fur et à mesure qu'on les écoute (pas de gros téléchargement imposé).
// - Les appels à l'API ne sont jamais mis en cache : les réponses sont toujours vérifiées par le serveur.
// Changer VERSION à chaque mise en ligne pour que les téléphones prennent la nouvelle interface.
const VERSION = "fq-2026-11-12a";
const SHELL = [
  "/",
  "/app.js",
  "/game.js",
  "/oral.js",
  "/oral-content.js",
  "/style.css",
  "/theme.css",
  "/quest.css",
  "/voyage.css",
  "/fonts/inter-latin-wght-normal.woff2",
  "/fonts/baloo-2-latin-wght-normal.woff2",
  "/assets/leo-avatar.webp",
  "/assets/icon-192.png",
  "/audio-young/manifest.json",
  "/audio-young/lipsync.json",
  "/manifest.webmanifest",
];
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(VERSION)
      .then((c) => c.addAll(SHELL))
      .then(() => self.skipWaiting()),
  );
});
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});
self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== location.origin) return;
  if (url.pathname.startsWith("/v1/") || url.pathname.startsWith("/demo/") || url.pathname === "/health")
    return;
  // Voix : une fois écoutée, elle reste disponible hors ligne.
  if (url.pathname.startsWith("/audio-young/") && url.pathname.endsWith(".mp3")) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(VERSION).then((c) => c.put(req, copy));
            }
            return res;
          }),
      ),
    );
    return;
  }
  // Interface : réponse immédiate depuis le téléphone, mise à jour en arrière-plan.
  const key = req.mode === "navigate" ? "/" : req;
  event.respondWith(
    caches.match(key).then((hit) => {
      const fresh = fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(VERSION).then((c) => c.put(key, copy));
          }
          return res;
        })
        .catch(() => hit);
      return hit || fresh;
    }),
  );
});
