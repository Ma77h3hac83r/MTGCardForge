import { getSafeScryfallApiUrl } from "@/lib/scryfall";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

export function getScryfallApiFetchUrl(url: string) {
  const safeUrl = getSafeScryfallApiUrl(url);

  if (!safeUrl || typeof window === "undefined" || LOCAL_HOSTS.has(window.location.hostname)) {
    return safeUrl ?? url;
  }

  return `/api/scryfall?url=${encodeURIComponent(safeUrl)}`;
}
