import { describe, expect, it } from "vitest";
import { getPriceEntries, normalizeScryfallCard } from "@/lib/scryfall";

describe("normalizeScryfallCard", () => {
  it("normalizes a single-face card with prices and purchase links", () => {
    const card = normalizeScryfallCard({
      id: "bolt",
      name: "Lightning Bolt",
      set_name: "Magic 2010",
      set: "m10",
      collector_number: "146",
      rarity: "common",
      type_line: "Instant",
      mana_cost: "{R}",
      oracle_text: "Lightning Bolt deals 3 damage to any target.",
      colors: ["R"],
      legalities: { modern: "legal", commander: "legal", standard: "not_legal" },
      artist: "Christopher Moeller",
      prices: { usd: "1.25", usd_foil: "5.00", eur: "0.80" },
      image_uris: {
        small: "https://cards.scryfall.io/small.jpg",
        normal: "https://cards.scryfall.io/normal.jpg",
        large: "https://cards.scryfall.io/large.jpg",
      },
      scryfall_uri: "https://scryfall.com/card/m10/146/lightning-bolt",
      purchase_uris: { tcgplayer: "https://www.tcgplayer.com/bolt" },
    });

    expect(card.name).toBe("Lightning Bolt");
    expect(card.setCode).toBe("M10");
    expect(card.manaCost).toBe("{R}");
    expect(card.legalFormats).toEqual(["modern", "commander"]);
    expect(card.images).toHaveLength(1);
    expect(card.images[0]?.normal).toBe("https://cards.scryfall.io/normal.jpg");
    expect(card.tcgplayerUri).toBe("https://www.tcgplayer.com/bolt");
    expect(getPriceEntries(card.prices)).toEqual([{ label: "USD", value: "$1.25" }]);
  });

  it("uses card faces when top-level image and oracle fields are absent", () => {
    const card = normalizeScryfallCard({
      id: "dfc",
      name: "Search for Azcanta // Azcanta, the Sunken Ruin",
      set_name: "Ixalan",
      set: "xln",
      collector_number: "74",
      rarity: "rare",
      prices: { usd: "9.50" },
      card_faces: [
        {
          name: "Search for Azcanta",
          mana_cost: "{1}{U}",
          type_line: "Legendary Enchantment",
          oracle_text: "At the beginning of your upkeep, look at the top card of your library.",
          image_uris: { normal: "https://cards.scryfall.io/front.jpg" },
        },
        {
          name: "Azcanta, the Sunken Ruin",
          type_line: "Legendary Land",
          oracle_text: "{T}: Add {U}.",
          image_uris: { normal: "https://cards.scryfall.io/back.jpg" },
        },
      ],
    });

    expect(card.typeLine).toBe("Legendary Enchantment // Legendary Land");
    expect(card.manaCost).toBe("{1}{U}");
    expect(card.oracleText).toContain(" // ");
    expect(card.images.map((image) => image.label)).toEqual([
      "Search for Azcanta",
      "Azcanta, the Sunken Ruin",
    ]);
  });

  it("returns empty images and no price entries when optional fields are missing", () => {
    const card = normalizeScryfallCard({
      id: "missing",
      name: "Mystery Card",
    });

    expect(card.images).toEqual([]);
    expect(card.prices).toEqual({
      usd: null,
      usdFoil: null,
      usdEtched: null,
      eur: null,
      tix: null,
    });
    expect(getPriceEntries(card.prices)).toEqual([]);
  });

  it("drops unsafe external URLs from API payloads", () => {
    const card = normalizeScryfallCard({
      id: "unsafe",
      name: "Unsafe Card",
      image_uris: {
        normal: "https://example.invalid/card.jpg",
      },
      prints_search_uri: "https://example.invalid/cards/search?q=unsafe",
      purchase_uris: {
        tcgplayer: "javascript:alert(1)",
      },
      scryfall_uri: "https://example.invalid/card/unsafe",
    });

    expect(card.images).toEqual([]);
    expect(card.printsSearchUri).toBeNull();
    expect(card.tcgplayerUri).toBeNull();
    expect(card.scryfallUri).toBe("https://scryfall.com/card/unsafe");
  });
});
