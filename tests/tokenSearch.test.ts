import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildTokenSearchUrl,
  fetchTokensAndEmblemsForCards,
  getProducerParts,
  getTokenOrEmblemParts,
  getTokenParts,
  searchTokenOrCard,
  searchTokens,
} from "@/lib/tokenSearch";
import type { CardSearchResult } from "@/lib/scryfall";

const card = {
  id: "card",
  layout: "normal",
  name: "Bird Maker",
  setName: "Test",
  setCode: "TST",
  collectorNumber: "1",
  rarity: "rare",
  typeLine: "Creature",
  manaCost: "{W}",
  oracleText: "Create a 1/1 white Bird creature token with flying.",
  power: "1",
  toughness: "1",
  colors: ["W"],
  legalFormats: [],
  artist: null,
  prices: { usd: null, usdFoil: null, usdEtched: null, eur: null, tix: null },
  images: [],
  printsSearchUri: null,
  scryfallUri: "https://scryfall.com/card/test",
  tcgplayerUri: null,
  allParts: [
    {
      id: "token",
      component: "token",
      name: "Bird Token",
      type_line: "Token Creature - Bird",
      uri: "https://api.scryfall.com/cards/token",
    },
    {
      id: "producer",
      component: "combo_piece",
      name: "Bird Maker",
      type_line: "Creature",
      uri: "https://api.scryfall.com/cards/producer",
    },
    {
      id: "emblem",
      component: "combo_piece",
      name: "Serra the Benevolent Emblem",
      type_line: "Emblem - Serra",
      uri: "https://api.scryfall.com/cards/emblem",
    },
  ],
} satisfies CardSearchResult;

describe("tokenSearch", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("builds paper token search URLs", () => {
    expect(buildTokenSearchUrl("bird")).toBe(
      "https://api.scryfall.com/cards/search?q=bird%20is%3Atoken%20game%3Apaper&unique=prints&order=name",
    );
  });

  it("splits token and producer related parts", () => {
    expect(getTokenParts(card).map((part) => part.id)).toEqual(["token"]);
    expect(getProducerParts(card).map((part) => part.id)).toEqual(["producer"]);
    expect(getTokenOrEmblemParts(card).map((part) => part.id)).toEqual(["token", "emblem"]);
  });

  it("fetches unique tokens and emblems produced by a set of cards", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue(scryfallToken("bird-1", "1/1")),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue(scryfallEmblem("emblem")),
      });
    vi.stubGlobal("fetch", fetchMock);

    const tokens = await fetchTokensAndEmblemsForCards([card, card]);

    expect(tokens.map((token) => token.name)).toEqual(["Bird", "Serra the Benevolent Emblem"]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenCalledWith("https://api.scryfall.com/cards/token", expect.any(Object));
    expect(fetchMock).toHaveBeenCalledWith("https://api.scryfall.com/cards/emblem", expect.any(Object));
  });

  it("keeps token variants with different stats and colors while removing duplicate printings", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({
          object: "list",
          has_more: false,
          data: [
            scryfallToken("bird-1", "1/1"),
            scryfallToken("bird-1-reprint", "1/1"),
            scryfallToken("bird-1-blue", "1/1", ["U"]),
            scryfallToken("bird-2", "2/2"),
            scryfallToken("bird-3", "3/3"),
          ],
        }),
      }),
    );

    const tokens = await searchTokens("bird");

    expect(tokens.map((token) => `${token.colors.join("")} ${token.power}/${token.toughness}`)).toEqual([
      "W 1/1",
      "U 1/1",
      "W 2/2",
      "W 3/3",
    ]);
  });

  it("uses token search instead of all_parts when the exact-name result is itself a token", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: vi.fn().mockResolvedValue({
            ...scryfallToken("bird-exact", "2/2"),
            all_parts: [
              {
                id: "bird-exact",
                component: "token",
                name: "Bird",
                type_line: "Token Creature - Bird",
                uri: "https://api.scryfall.com/cards/bird-exact",
              },
            ],
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: vi.fn().mockResolvedValue({
            object: "list",
            has_more: false,
            data: [
              scryfallToken("bird-1", "1/1"),
              scryfallToken("bird-2", "2/2"),
              scryfallToken("bird-3", "3/3"),
            ],
          }),
        }),
    );

    const result = await searchTokenOrCard("Bird");

    expect(result.mode).toBe("token");
    expect(result.sourceCard).toBeNull();
    expect(result.tokens.map((token) => `${token.power}/${token.toughness}`)).toEqual(["1/1", "2/2", "3/3"]);
  });

  it("returns emblems created by exact card searches", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: vi.fn().mockResolvedValue({
            id: "serra",
            name: "Serra the Benevolent",
            layout: "normal",
            type_line: "Legendary Planeswalker - Serra",
            all_parts: [
              {
                id: "angel-token",
                component: "token",
                name: "Angel",
                type_line: "Token Creature - Angel",
                uri: "https://api.scryfall.com/cards/angel-token",
              },
              {
                id: "serra-emblem",
                component: "combo_piece",
                name: "Serra the Benevolent Emblem",
                type_line: "Emblem - Serra",
                uri: "https://api.scryfall.com/cards/serra-emblem",
              },
            ],
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: vi.fn().mockResolvedValue(scryfallToken("angel-token", "4/4")),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: vi.fn().mockResolvedValue(scryfallEmblem("serra-emblem")),
        }),
    );

    const result = await searchTokenOrCard("Serra the Benevolent");

    expect(result.mode).toBe("card");
    expect(result.tokens.map((token) => token.typeLine)).toEqual(["Token Creature - Bird", "Emblem - Serra"]);
  });
});

function scryfallToken(id: string, stats: string, colors = ["W"]) {
  const [power, toughness] = stats.split("/");

  return {
    id,
    name: "Bird",
    layout: "token",
    set: "tst",
    set_name: "Test Tokens",
    collector_number: id,
    type_line: "Token Creature - Bird",
    oracle_text: "Flying",
    power,
    toughness,
    colors,
    prices: {},
    prints_search_uri: "https://api.scryfall.com/cards/search?q=bird",
    scryfall_uri: `https://scryfall.com/card/tst/${id}/bird`,
  };
}

function scryfallEmblem(id: string) {
  return {
    id,
    name: "Serra the Benevolent Emblem",
    layout: "emblem",
    set: "tmh1",
    set_name: "Modern Horizons Tokens",
    collector_number: id,
    type_line: "Emblem - Serra",
    oracle_text: "If you control a creature, damage that would reduce your life total to less than 1 reduces it to 1 instead.",
    prices: {},
    scryfall_uri: `https://scryfall.com/card/tmh1/${id}/serra-the-benevolent-emblem`,
  };
}
