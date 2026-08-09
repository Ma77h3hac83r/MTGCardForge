import { afterEach, describe, expect, it } from "vitest";
import {
  CATALOG_CACHE_KEYS,
  clearCachedValue,
  clearCatalogCacheMemory,
  getCachedValue,
  setCachedValue,
} from "@/lib/catalogCache";

describe("catalogCache", () => {
  afterEach(() => {
    clearCatalogCacheMemory();
    clearCachedValue(CATALOG_CACHE_KEYS.sets);
    clearCachedValue(CATALOG_CACHE_KEYS.artistNames);
    clearCachedValue("test-key");
  });

  it("stores and returns values from memory/localStorage", () => {
    setCachedValue("test-key", ["Alpha", "Beta"]);

    expect(getCachedValue<string[]>("test-key")).toEqual(["Alpha", "Beta"]);
  });

  it("expires values after the configured TTL", () => {
    setCachedValue("test-key", ["Stale"], 1);

    const originalNow = Date.now;
    Date.now = () => originalNow() + 10;

    try {
      expect(getCachedValue<string[]>("test-key")).toBeNull();
    } finally {
      Date.now = originalNow;
    }
  });
});
