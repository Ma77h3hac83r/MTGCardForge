const JSON_HEADERS = {
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Origin": "*",
  "Content-Type": "application/json; charset=utf-8",
};

const SCRYFALL_API_HOST = "api.scryfall.com";
const DEFAULT_PROXY_TTL_SECONDS = 900;
const CATALOG_TTL_SECONDS = 86400;
const CARD_IDENTITY_TTL_SECONDS = 3600;
const PRICE_QUERY_TTL_SECONDS = 300;
const RANDOM_PRINTINGS_TTL_SECONDS = 300;
const STALE_WHILE_REVALIDATE_SECONDS = 86400;
const RANDOM_PRINTING_URL = "https://api.scryfall.com/cards/random?q=game%3Apaper";

export async function handleScryfallProxyRequest(request) {
  if (request.method === "OPTIONS") {
    return new Response(null, { headers: JSON_HEADERS, status: 204 });
  }

  if (request.method !== "GET") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  const requestUrl = new URL(request.url);
  const targetUrl = getSafeScryfallApiUrl(requestUrl.searchParams.get("url"));

  if (!targetUrl) {
    return jsonResponse({ error: "Missing or unsupported Scryfall URL." }, 400);
  }

  return cachedJsonFetch(request, targetUrl, getProxyTtlSeconds(targetUrl));
}

export async function handleRandomPrintingsRequest(request) {
  if (request.method === "OPTIONS") {
    return new Response(null, { headers: JSON_HEADERS, status: 204 });
  }

  if (request.method !== "GET") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  const cache = getDefaultCache();
  const cachedResponse = await cache?.match(request);

  if (cachedResponse) {
    return cachedResponse;
  }

  const requestUrl = new URL(request.url);
  const count = clampNumber(Number.parseInt(requestUrl.searchParams.get("count") ?? "4", 10), 1, 8);
  const results = await Promise.allSettled(
    Array.from({ length: count }, () =>
      fetch(RANDOM_PRINTING_URL, {
        headers: { Accept: "application/json" },
        signal: request.signal,
      }),
    ),
  );
  const cards = [];
  const seenIds = new Set();

  for (const result of results) {
    if (result.status !== "fulfilled" || !result.value.ok) {
      continue;
    }

    const card = await result.value.json();

    if (card?.id && !seenIds.has(card.id)) {
      seenIds.add(card.id);
      cards.push(card);
    }
  }

  const response = jsonResponse(
    { data: cards },
    cards.length ? 200 : 502,
    RANDOM_PRINTINGS_TTL_SECONDS,
  );

  if (cards.length) {
    await cache?.put(request, response.clone());
  }

  return response;
}

export function getProxyTtlSeconds(targetUrl) {
  try {
    const url = new URL(targetUrl);
    const path = url.pathname.replace(/\/+$/, "") || "/";

    if (path === "/sets" || path.startsWith("/catalog/")) {
      return CATALOG_TTL_SECONDS;
    }

    if (path === "/cards/search") {
      const query = `${url.searchParams.get("q") ?? ""} ${url.searchParams.get("order") ?? ""}`.toLowerCase();

      if (query.includes("usd") || url.searchParams.get("order") === "usd") {
        return PRICE_QUERY_TTL_SECONDS;
      }

      return DEFAULT_PROXY_TTL_SECONDS;
    }

    if (path === "/cards/named") {
      return CARD_IDENTITY_TTL_SECONDS;
    }

    // Scryfall card ids are UUIDs; avoid matching /cards/search etc.
    if (/^\/cards\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(path)) {
      return CARD_IDENTITY_TTL_SECONDS;
    }

    if (path === "/cards/random") {
      return RANDOM_PRINTINGS_TTL_SECONDS;
    }

    return DEFAULT_PROXY_TTL_SECONDS;
  } catch {
    return DEFAULT_PROXY_TTL_SECONDS;
  }
}

async function cachedJsonFetch(request, targetUrl, ttlSeconds) {
  const cache = getDefaultCache();
  const cachedResponse = await cache?.match(request);

  if (cachedResponse) {
    return cachedResponse;
  }

  const response = await fetch(targetUrl, {
    headers: {
      Accept: "application/json",
      "User-Agent": "MTGCardForge/1.0",
    },
    signal: request.signal,
  });
  const proxiedResponse = new Response(response.body, {
    headers: {
      ...JSON_HEADERS,
      "Cache-Control": response.ok ? buildCacheControl(ttlSeconds) : "no-store",
    },
    status: response.status,
  });

  if (response.ok) {
    await cache?.put(request, proxiedResponse.clone());
  }

  return proxiedResponse;
}

function buildCacheControl(ttlSeconds) {
  const staleWhileRevalidate = Math.max(ttlSeconds, STALE_WHILE_REVALIDATE_SECONDS);
  return `public, max-age=${ttlSeconds}, s-maxage=${ttlSeconds}, stale-while-revalidate=${staleWhileRevalidate}`;
}

function getSafeScryfallApiUrl(value) {
  if (!value) {
    return null;
  }

  try {
    const url = new URL(value);

    if (url.protocol !== "https:" || url.hostname !== SCRYFALL_API_HOST) {
      return null;
    }

    return url.toString();
  } catch {
    return null;
  }
}

function clampNumber(value, min, max) {
  if (!Number.isFinite(value)) {
    return min;
  }

  return Math.min(Math.max(value, min), max);
}

function getDefaultCache() {
  return globalThis.caches?.default;
}

function jsonResponse(payload, status = 200, ttlSeconds = 0) {
  return new Response(JSON.stringify(payload), {
    headers: {
      ...JSON_HEADERS,
      "Cache-Control": ttlSeconds ? buildCacheControl(ttlSeconds) : "no-store",
    },
    status,
  });
}
