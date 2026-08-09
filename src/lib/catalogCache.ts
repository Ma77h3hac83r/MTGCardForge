const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;

type CacheEnvelope<T> = {
  savedAt: number;
  ttlMs: number;
  value: T;
};

const memoryCache = new Map<string, CacheEnvelope<unknown>>();

export const CATALOG_CACHE_KEYS = {
  sets: "mtg-card-forge:catalog:sets:v1",
  artistNames: "mtg-card-forge:catalog:artist-names:v1",
} as const;

export function getCachedValue<T>(key: string): T | null {
  const memoryEntry = memoryCache.get(key) as CacheEnvelope<T> | undefined;

  if (memoryEntry && !isExpired(memoryEntry)) {
    return memoryEntry.value;
  }

  if (memoryEntry) {
    memoryCache.delete(key);
  }

  const storage = getStorage();

  if (!storage) {
    return null;
  }

  try {
    const raw = storage.getItem(key);

    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as CacheEnvelope<T>;

    if (!parsed || typeof parsed.savedAt !== "number" || parsed.value === undefined) {
      storage.removeItem(key);
      return null;
    }

    if (isExpired(parsed)) {
      storage.removeItem(key);
      return null;
    }

    memoryCache.set(key, parsed);
    return parsed.value;
  } catch {
    storage.removeItem(key);
    return null;
  }
}

export function setCachedValue<T>(key: string, value: T, ttlMs = DEFAULT_TTL_MS) {
  const entry: CacheEnvelope<T> = {
    savedAt: Date.now(),
    ttlMs,
    value,
  };

  memoryCache.set(key, entry);

  const storage = getStorage();

  if (!storage) {
    return;
  }

  try {
    storage.setItem(key, JSON.stringify(entry));
  } catch {
    // Quota or private-mode failures should not break network fetches.
  }
}

export function clearCachedValue(key: string) {
  memoryCache.delete(key);
  getStorage()?.removeItem(key);
}

/** Test helper: clears in-memory entries without touching storage. */
export function clearCatalogCacheMemory() {
  memoryCache.clear();
}

function isExpired(entry: CacheEnvelope<unknown>) {
  return Date.now() - entry.savedAt > entry.ttlMs;
}

function getStorage(): Storage | null {
  try {
    if (typeof globalThis.localStorage === "undefined") {
      return null;
    }

    return globalThis.localStorage;
  } catch {
    return null;
  }
}
