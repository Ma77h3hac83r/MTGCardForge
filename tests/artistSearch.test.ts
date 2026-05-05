import { afterEach, describe, expect, it, vi } from "vitest";
import { buildArtistSearchUrl, fetchArtistCards, getArtistStats } from "@/lib/artistSearch";

function response(status: number, payload: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: vi.fn().mockResolvedValue(payload),
  };
}

describe("artistSearch", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("builds artist-only Scryfall search URLs", () => {
    const url = new URL(buildArtistSearchUrl("Rebecca Guay"));

    expect(url.origin + url.pathname).toBe("https://api.scryfall.com/cards/search");
    expect(url.searchParams.get("q")).toBe('artist:"Rebecca Guay" game:paper');
    expect(url.searchParams.get("unique")).toBe("art");
    expect(url.searchParams.get("order")).toBe("released");
    expect(url.searchParams.get("dir")).toBe("desc");
    expect(url.searchParams.get("include_extras")).toBe("true");
  });

  it("fetches and normalizes artist cards", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      response(200, {
        object: "list",
        has_more: false,
        data: [
          {
            id: "card",
            name: "Test Card",
            set: "tst",
            set_name: "Test Set",
            collector_number: "1",
            type_line: "Creature",
            artist: "Rebecca Guay",
            colors: ["G"],
            prices: {},
          },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const cards = await fetchArtistCards("Rebecca Guay");

    expect(cards).toHaveLength(1);
    expect(cards[0].artist).toBe("Rebecca Guay");
    expect(cards[0].setCode).toBe("TST");
  });

  it("summarizes artist card stats", () => {
    expect(
      getArtistStats([
        card("one", "A", ["W"]),
        card("two", "B", ["U", "B"]),
        card("three", "A", ["W"]),
      ]),
    ).toEqual({
      cardCount: 3,
      setCount: 2,
      colorCount: 3,
    });
  });
});

function card(id: string, setCode: string, colors: string[]) {
  return {
    id,
    layout: "normal",
    name: id,
    setName: setCode,
    setCode,
    collectorNumber: "1",
    rarity: "common",
    typeLine: "Creature",
    manaCost: null,
    oracleText: null,
    power: null,
    toughness: null,
    colors,
    legalFormats: [],
    artist: "Artist",
    prices: { usd: null, usdFoil: null, usdEtched: null, eur: null, tix: null },
    images: [],
    printsSearchUri: null,
    scryfallUri: "https://scryfall.com",
    tcgplayerUri: null,
    allParts: [],
  };
}
