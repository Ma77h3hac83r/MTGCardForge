import { afterEach, describe, expect, it, vi } from "vitest";
import { buildArtistSearchUrl, fetchArtistCards, getArtistStats, streamArtistCards } from "@/lib/artistSearch";

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

  it("adds frame filter syntax to artist search URLs", () => {
    const url = new URL(buildArtistSearchUrl("Rebecca Guay", ["full", "extended"]));

    expect(url.searchParams.get("q")).toBe('artist:"Rebecca Guay" game:paper (is:full OR is:extended)');
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

  it("streams artist cards page by page", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        response(200, {
          object: "list",
          has_more: true,
          next_page: "https://api.scryfall.com/cards/search?page=2",
          data: [
            {
              id: "first",
              name: "First Card",
              set: "tst",
              set_name: "Test",
              collector_number: "1",
              prices: {},
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        response(200, {
          object: "list",
          has_more: false,
          data: [
            {
              id: "second",
              name: "Second Card",
              set: "tst",
              set_name: "Test",
              collector_number: "2",
              prices: {},
            },
          ],
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const pages: Array<{ names: string[]; done: boolean }> = [];
    await streamArtistCards("Test Artist", "all", (update) => {
      pages.push({ names: update.cards.map((entry) => entry.name), done: update.done });
    });

    expect(pages).toEqual([
      { names: ["First Card"], done: false },
      { names: ["First Card", "Second Card"], done: true },
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
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
