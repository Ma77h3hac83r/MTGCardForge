import { dedupedFetch } from "@/lib/dedupedFetch";
import { getSafeScryfallApiUrl } from "@/lib/scryfall";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

export function getScryfallApiFetchUrl(url: string) {
  const safeUrl = getSafeScryfallApiUrl(url);

  if (!safeUrl || typeof window === "undefined" || LOCAL_HOSTS.has(window.location.hostname)) {
    return safeUrl ?? url;
  }

  return `/api/scryfall?url=${encodeURIComponent(safeUrl)}`;
}

/** Scryfall GET (and de-duped) fetch through the local/prod proxy path. */
export function scryfallFetch(url: string, init: RequestInit = {}) {
  return dedupedFetch(getScryfallApiFetchUrl(url), {
    ...init,
    headers: {
      Accept: "application/json",
      ...normalizeHeaders(init.headers),
    },
  });
}

function normalizeHeaders(headers?: HeadersInit): Record<string, string> {
  if (!headers) {
    return {};
  }

  if (headers instanceof Headers) {
    return Object.fromEntries(headers.entries());
  }

  if (Array.isArray(headers)) {
    return Object.fromEntries(headers);
  }

  return { ...headers };
}
