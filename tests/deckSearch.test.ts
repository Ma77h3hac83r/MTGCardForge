import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildAlternateNameSearchUrl,
  buildCheapestPrintingUrl,
  buildCheapestPrintingsUrl,
  fetchCheapestPrintings,
  getDeckGroup,
  groupDeckCards,
  parseDeckInput,
  parseDeckList,
  resolveDeckCards,
} from "@/lib/deckSearch";
import type { CardSearchResult } from "@/lib/scryfall";

function response(status: number, payload: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: vi.fn().mockResolvedValue(payload),
  };
}

describe("deckSearch", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("parses deck list quantities and card names", () => {
    expect(
      parseDeckList(`
Commander
1 Sol Ring (CMM) 400
1 Aether Vial (SLD) 1640★ *F*
1 Chrome Mox (2XM) 345 *E*
1 Angel's Grace (PLST) TSP-3
1 Patchwork Banner (PMEI) 2024-7
2x Counterspell
SB: 1 Lightning Bolt # note
1 Island
1 Island
`),
    ).toEqual([
      { name: "Sol Ring", quantity: 1 },
      { name: "Aether Vial", quantity: 1 },
      { name: "Chrome Mox", quantity: 1 },
      { name: "Angel's Grace", quantity: 1 },
      { name: "Patchwork Banner", quantity: 1 },
      { name: "Counterspell", quantity: 2 },
      { name: "Lightning Bolt", quantity: 1 },
      { name: "Island", quantity: 2 },
    ]);
  });

  it("merges pasted card names that only differ by punctuation", () => {
    expect(parseDeckList("1 Giada, Font of Hope\n2 Giada Font of Hope")).toEqual([
      { name: "Giada, Font of Hope", quantity: 3 },
    ]);
  });

  it("builds cheapest paper printing URLs ordered by USD", () => {
    const url = new URL(buildCheapestPrintingUrl("Sol Ring"));

    expect(url.origin + url.pathname).toBe("https://api.scryfall.com/cards/search");
    expect(url.searchParams.get("q")).toBe('(!"Sol Ring") game:paper usd>=0');
    expect(url.searchParams.get("unique")).toBe("prints");
    expect(url.searchParams.get("order")).toBe("usd");
    expect(url.searchParams.get("dir")).toBe("asc");
  });

  it("builds batched cheapest paper printing URLs", () => {
    const url = new URL(buildCheapestPrintingsUrl(["Sol Ring", "Island"]));

    expect(url.searchParams.get("q")).toBe('(!"Sol Ring" or !"Island") game:paper usd>=0');
    expect(url.searchParams.get("order")).toBe("usd");
  });

  it("builds alternate-name fallback URLs", () => {
    const url = new URL(buildAlternateNameSearchUrl("Castle Shimura"));

    expect(url.searchParams.get("q")).toBe('"Castle Shimura" game:paper usd>=0');
    expect(url.searchParams.get("unique")).toBe("prints");
    expect(url.searchParams.get("order")).toBe("usd");
  });

  it("resolves cards to the cheapest returned printings in batches", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        response(200, {
          object: "list",
          data: [
            {
              id: "sol-ring",
              name: "Sol Ring",
              set: "cmm",
              set_name: "Commander Masters",
              collector_number: "400",
              type_line: "Artifact",
              prices: { usd: "0.99" },
            },
            {
              id: "island",
              name: "Island",
              set: "one",
              set_name: "Phyrexia: All Will Be One",
              collector_number: "267",
              type_line: "Basic Land - Island",
              prices: { usd: "0.05" },
            },
          ],
        }),
      ),
    );

    const cards = await resolveDeckCards([
      { name: "Sol Ring", quantity: 1 },
      { name: "Island", quantity: 2 },
    ]);

    expect(cards[0].card?.setCode).toBe("CMM");
    expect(cards[0].card?.prices.usd).toBe("0.99");
    expect(cards[1].card?.setCode).toBe("ONE");
    expect(cards[1].card?.prices.usd).toBe("0.05");
  });

  it("keeps the first USD-sorted printing per card name", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        response(200, {
          object: "list",
          data: [
            {
              id: "cheap-ring",
              name: "Sol Ring",
              set: "cmm",
              set_name: "Commander Masters",
              collector_number: "400",
              type_line: "Artifact",
              prices: { usd: "0.99" },
            },
            {
              id: "expensive-ring",
              name: "Sol Ring",
              set: "sld",
              set_name: "Secret Lair Drop",
              collector_number: "1",
              type_line: "Artifact",
              prices: { usd: "9.99" },
            },
          ],
        }),
      ),
    );

    const cards = await fetchCheapestPrintings(["Sol Ring"]);

    expect(cards.get("sol ring")?.id).toBe("cheap-ring");
  });

  it("resolves alternate Universes Beyond names through phrase search", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        response(404, {
          object: "error",
          details: "No cards found.",
        }),
      )
      .mockResolvedValueOnce(
        response(200, {
          object: "list",
          data: [
            {
              id: "castle-shimura",
              name: "Eiganjo Castle",
              set: "sld",
              set_name: "Secret Lair Drop",
              collector_number: "2230",
              type_line: "Legendary Land",
              prices: { usd: "7.75" },
            },
          ],
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const cards = await resolveDeckCards([{ name: "Castle Shimura", quantity: 1 }]);

    expect(cards[0].card?.name).toBe("Eiganjo Castle");
    expect(cards[0].card?.setCode).toBe("SLD");
    expect(new URL(String(fetchMock.mock.calls[1][0])).searchParams.get("q")).toBe(
      '"Castle Shimura" game:paper usd>=0',
    );
  });

  it("resolves card names with omitted punctuation through fuzzy fallback", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        response(404, {
          object: "error",
          details: "No cards found.",
        }),
      )
      .mockResolvedValueOnce(
        response(404, {
          object: "error",
          details: "No cards found.",
        }),
      )
      .mockResolvedValueOnce(
        response(200, {
          data: [],
          not_found: [{ name: "Giada Font of Hope" }],
        }),
      )
      .mockResolvedValueOnce(
        response(200, {
          id: "giada",
          name: "Giada, Font of Hope",
          set: "snc",
          set_name: "Streets of New Capenna",
          collector_number: "14",
          type_line: "Legendary Creature - Angel",
          prices: { usd: "1.25" },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const cards = await resolveDeckCards([{ name: "Giada Font of Hope", quantity: 1 }]);

    expect(cards[0].card?.name).toBe("Giada, Font of Hope");
    expect(fetchMock.mock.calls[3][0]).toBe("https://api.scryfall.com/cards/named?fuzzy=Giada%20Font%20of%20Hope");
  });

  it("parses Moxfield deck URLs", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        response(200, {
          commanders: {
            commander: { quantity: 1, card: { name: "Atraxa, Praetors' Voice" } },
          },
          mainboard: {
            ring: { quantity: 1, card: { name: "Sol Ring" } },
          },
        }),
      ),
    );

    await expect(parseDeckInput("https://www.moxfield.com/decks/abc123")).resolves.toEqual([
      { name: "Atraxa, Praetors' Voice", quantity: 1 },
      { name: "Sol Ring", quantity: 1 },
    ]);
  });

  it("parses Archidekt deck URLs", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        response(200, {
          cards: [
            { quantity: 2, card: { oracleCard: { name: "Counterspell" } } },
            { quantity: 1, card: { name: "Sol Ring" } },
          ],
        }),
      ),
    );

    await expect(parseDeckInput("https://archidekt.com/decks/123456/test")).resolves.toEqual([
      { name: "Counterspell", quantity: 2 },
      { name: "Sol Ring", quantity: 1 },
    ]);
  });

  it("groups cards by requested deck sections", () => {
    const groups = groupDeckCards([
      resolved("Jace", "Legendary Planeswalker - Jace"),
      resolved("Goblin", "Creature - Goblin"),
      resolved("Sol Ring", "Artifact"),
      resolved("Island", "Basic Land - Island"),
    ]);

    expect(groups.map((group) => group.label)).toEqual(["Planeswalker", "Creature", "Artifact", "Basic Land"]);
    expect(getDeckGroup(card("Dual Land", "Land"))).toBe("lands");
  });
});

function resolved(name: string, typeLine: string) {
  return {
    name,
    quantity: 1,
    card: card(name, typeLine),
  };
}

function card(name: string, typeLine: string): CardSearchResult {
  return {
    id: name,
    layout: "normal",
    name,
    setName: "Test",
    setCode: "TST",
    collectorNumber: "1",
    rarity: "common",
    typeLine,
    manaCost: null,
    oracleText: null,
    power: null,
    toughness: null,
    colors: [],
    legalFormats: [],
    artist: null,
    prices: { usd: null, usdFoil: null, usdEtched: null, eur: null, tix: null },
    images: [],
    printsSearchUri: null,
    scryfallUri: "https://scryfall.com",
    tcgplayerUri: null,
    allParts: [],
  };
}
