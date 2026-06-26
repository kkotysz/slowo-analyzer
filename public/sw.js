const CACHE_NAME = "slowo-analyzer-v8";
const BASE_PATH = new URL("./", self.location.href).pathname;
const versionedAppShellAssetNames = ["slowa.txt", "hasla.txt", "answer-metadata.json", "opening-moves.json"];

function appShellPath(path) {
  return new URL(path, self.location.href).pathname;
}

const APP_SHELL = [
  appShellPath("./"),
  ...versionedAppShellAssetNames.map((path) => appShellPath(path)),
  appShellPath("manifest.webmanifest"),
];
const VERSIONED_APP_SHELL_PATHS = new Set(versionedAppShellAssetNames.map((path) => appShellPath(path)));

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))),
    ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      const url = new URL(request.url);
      if (url.origin === self.location.origin && VERSIONED_APP_SHELL_PATHS.has(url.pathname)) {
        return caches.match(url.pathname, { ignoreSearch: true }).then((versionedCached) => {
          if (versionedCached) return versionedCached;
          return fetch(request).then((response) => {
            if (response.ok) {
              const copy = response.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
            }
            return response;
          });
        });
      }

      return fetch(request).then((response) => {
        if (response.ok && url.origin === self.location.origin && url.pathname.startsWith(BASE_PATH)) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        }
        return response;
      });
    }),
  );
});
