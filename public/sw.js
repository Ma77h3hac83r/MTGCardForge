/* MTG Card Forge service worker: shell pages + recent Scryfall images. */
const SHELL_CACHE = "mtg-shell-v1";
const IMAGE_CACHE = "mtg-images-v1";
const IMAGE_CACHE_LIMIT = 80;

const SHELL_URLS = [
  "/",
  "/printings",
  "/printings/",
  "/sets",
  "/sets/",
  "/tokens",
  "/tokens/",
  "/artists",
  "/artists/",
  "/deck",
  "/deck/",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL_URLS).catch(() => undefined))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== SHELL_CACHE && key !== IMAGE_CACHE)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;

  if (request.method !== "GET") {
    return;
  }

  const url = new URL(request.url);

  if (isScryfallImage(url)) {
    event.respondWith(cacheFirstImage(request));
    return;
  }

  if (url.origin === self.location.origin) {
    if (request.mode === "navigate" || isDocumentRequest(request)) {
      event.respondWith(networkFirstShell(request));
      return;
    }

    if (isStaticAsset(url)) {
      event.respondWith(staleWhileRevalidate(request, SHELL_CACHE));
    }
  }
});

function isScryfallImage(url) {
  return (
    url.protocol === "https:" &&
    (url.hostname === "cards.scryfall.io" ||
      url.hostname.endsWith(".scryfall.io") ||
      url.hostname === "c1.scryfall.com")
  );
}

function isDocumentRequest(request) {
  const accept = request.headers.get("accept") ?? "";
  return accept.includes("text/html");
}

function isStaticAsset(url) {
  return (
    url.pathname.startsWith("/_astro/") ||
    url.pathname.endsWith(".css") ||
    url.pathname.endsWith(".js") ||
    url.pathname.endsWith(".woff2") ||
    url.pathname.endsWith(".woff") ||
    url.pathname.endsWith(".png") ||
    url.pathname.endsWith(".svg") ||
    url.pathname.endsWith(".ico")
  );
}

async function networkFirstShell(request) {
  const cache = await caches.open(SHELL_CACHE);

  try {
    const response = await fetch(request);

    if (response.ok) {
      await cache.put(request, response.clone());
    }

    return response;
  } catch {
    const cached = await cache.match(request);

    if (cached) {
      return cached;
    }

    const fallback = await cache.match("/") || (await cache.match("/index.html"));

    if (fallback) {
      return fallback;
    }

    return new Response("Offline", {
      status: 503,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const networkPromise = fetch(request)
    .then((response) => {
      if (response.ok) {
        void cache.put(request, response.clone());
      }

      return response;
    })
    .catch(() => cached);

  return cached || networkPromise;
}

async function cacheFirstImage(request) {
  const cache = await caches.open(IMAGE_CACHE);
  const cached = await cache.match(request);

  if (cached) {
    return cached;
  }

  try {
    const response = await fetch(request);

    if (response.ok) {
      await cache.put(request, response.clone());
      await trimImageCache(cache);
    }

    return response;
  } catch {
    return new Response("", { status: 504, statusText: "Offline image unavailable" });
  }
}

async function trimImageCache(cache) {
  const keys = await cache.keys();

  if (keys.length <= IMAGE_CACHE_LIMIT) {
    return;
  }

  const excess = keys.length - IMAGE_CACHE_LIMIT;

  for (let index = 0; index < excess; index += 1) {
    await cache.delete(keys[index]);
  }
}
