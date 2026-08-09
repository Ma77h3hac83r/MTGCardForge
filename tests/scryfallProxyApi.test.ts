import { describe, expect, it } from "vitest";
import { getProxyTtlSeconds } from "../public/scryfallProxyApi.mjs";

describe("scryfallProxyApi TTL policy", () => {
  it("caches catalogs and sets for a day", () => {
    expect(getProxyTtlSeconds("https://api.scryfall.com/sets")).toBe(86400);
    expect(getProxyTtlSeconds("https://api.scryfall.com/catalog/artist-names")).toBe(86400);
  });

  it("caches named and id card lookups longer than search defaults", () => {
    expect(getProxyTtlSeconds("https://api.scryfall.com/cards/named?exact=Sol%20Ring")).toBe(3600);
    expect(getProxyTtlSeconds("https://api.scryfall.com/cards/00000000-0000-0000-0000-000000000001")).toBe(3600);
  });

  it("uses short TTL for price-sensitive search queries", () => {
    expect(
      getProxyTtlSeconds(
        "https://api.scryfall.com/cards/search?q=%28%21%22Sol+Ring%22%29+game%3Apaper+usd%3E%3D0&order=usd",
      ),
    ).toBe(300);
  });

  it("uses the default TTL for general search queries", () => {
    expect(
      getProxyTtlSeconds("https://api.scryfall.com/cards/search?q=set%3Asos+game%3Apaper&unique=prints&order=set"),
    ).toBe(900);
  });
});
