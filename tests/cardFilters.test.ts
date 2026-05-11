import { describe, expect, it } from "vitest";
import { filterCardsByAdvancedFilters } from "@/lib/cardFilters";
import type { CardSearchResult } from "@/lib/scryfall";

const baseCard: CardSearchResult = {
  id: "base",
  layout: "normal",
  name: "Base Card",
  setName: "Test Set",
  setCode: "TST",
  collectorNumber: "1",
  rarity: "rare",
  typeLine: "Creature",
  manaCost: null,
  oracleText: null,
  power: null,
  toughness: null,
  colors: ["W"],
  legalFormats: [],
  artist: null,
  prices: {
    usd: "1.00",
    usdFoil: null,
    usdEtched: null,
    eur: null,
    tix: null,
  },
  images: [],
  printsSearchUri: null,
  scryfallUri: "https://scryfall.com/card/base",
  tcgplayerUri: null,
  allParts: [],
};

describe("cardFilters", () => {
  it("filters cards by rarity, exact color identity, and price availability", () => {
    const foilCard = {
      ...baseCard,
      id: "foil",
      name: "Foil Card",
      rarity: "mythic",
      colors: ["U"],
      prices: {
        ...baseCard.prices,
        usd: null,
        usdFoil: "2.00",
      },
    };
    const colorlessEtchedCard = {
      ...baseCard,
      id: "etched",
      name: "Etched Card",
      rarity: "rare",
      colors: [],
      prices: {
        ...baseCard.prices,
        usd: null,
        usdEtched: "3.00",
      },
    };

    expect(
      filterCardsByAdvancedFilters([baseCard, foilCard, colorlessEtchedCard], {
        colors: ["colorless"],
        prices: ["etched"],
        rarities: ["rare"],
      }).map((card) => card.name),
    ).toEqual(["Etched Card"]);
  });
});
