import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildSetCardsQuery,
  fetchSetCards,
  formatSetSuggestion,
  resolveSetWithSubsets,
  sortSetSuggestions,
  type ScryfallSet,
} from "@/lib/setSearch";

const sets: ScryfallSet[] = [
  {
    id: "sos",
    code: "sos",
    name: "Secrets of Scryfall",
    set_type: "expansion",
    card_count: 280,
    released_at: "2026-01-01",
  },
  {
    id: "soa",
    code: "soa",
    name: "Secrets of Scryfall Alchemy",
    set_type: "alchemy",
    card_count: 30,
    parent_set_code: "sos",
    released_at: "2026-01-15",
  },
  {
    id: "asos",
    code: "asos",
    name: "Secrets of Scryfall Art Series",
    set_type: "memorabilia",
    card_count: 80,
    parent_set_code: "sos",
    released_at: "2026-01-01",
  },
  {
    id: "psos",
    code: "psos",
    name: "Secrets of Scryfall Promos",
    set_type: "promo",
    card_count: 60,
    parent_set_code: "sos",
    released_at: "2026-01-01",
  },
  {
    id: "soc",
    code: "soc",
    name: "Secrets of Scryfall Commander",
    set_type: "commander",
    card_count: 80,
    parent_set_code: "sos",
    released_at: "2026-01-01",
  },
  {
    id: "tsos",
    code: "tsos",
    name: "Secrets of Scryfall Tokens",
    set_type: "token",
    card_count: 40,
    parent_set_code: "sos",
    released_at: "2026-01-01",
  },
  {
    id: "ltr",
    code: "ltr",
    name: "The Lord of the Rings",
    set_type: "expansion",
    card_count: 300,
    released_at: "2023-06-23",
  },
];

describe("setSearch", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("resolves a parent set with all child subsets", () => {
    const resolved = resolveSetWithSubsets(sets, "SOS");

    expect(resolved?.rootSet.code).toBe("sos");
    expect(resolved?.relatedSets.map((set) => set.code)).toEqual([
      "sos",
      "soc",
      "soa",
      "psos",
      "tsos",
    ]);
  });

  it("resolves a child subset back to its parent and siblings", () => {
    const resolved = resolveSetWithSubsets(sets, "PSOS");

    expect(resolved?.rootSet.code).toBe("sos");
    expect(resolved?.relatedSets.map((set) => set.code)).toEqual([
      "sos",
      "soc",
      "soa",
      "psos",
      "tsos",
    ]);
  });

  it("resolves an autocompleted set name and code label", () => {
    const resolved = resolveSetWithSubsets(sets, formatSetSuggestion(sets[0]));

    expect(resolved?.rootSet.code).toBe("sos");
  });

  it("builds paper-only set queries with filters", () => {
    const resolved = resolveSetWithSubsets(sets, "SOS");

    expect(buildSetCardsQuery(resolved?.relatedSets ?? [], "promo")).toBe(
      "(set:sos OR set:soc OR set:soa OR set:psos OR set:tsos) game:paper -is:minigame is:promo",
    );
    expect(buildSetCardsQuery(resolved?.relatedSets ?? [], ["default", "extended"])).toBe(
      "(set:sos OR set:soc OR set:soa OR set:psos OR set:tsos) game:paper -is:minigame (is:default OR is:extended)",
    );
    expect(buildSetCardsQuery(resolved?.relatedSets ?? [], "token")).toContain("is:token");
    expect(buildSetCardsQuery(resolved?.relatedSets ?? [], "extended")).toContain("is:extended");
    expect(buildSetCardsQuery(resolved?.relatedSets ?? [], "showcase")).toContain("is:showcase");
  });

  it("sorts exact and prefix set suggestions first", () => {
    expect(sortSetSuggestions(sets, "so").map((set) => set.code)).toEqual([
      "soa",
      "sos",
      "soc",
      "asos",
      "psos",
      "tsos",
    ]);
  });

  it("sorts fetched cards using related set order before collector number", async () => {
    const resolved = resolveSetWithSubsets(sets, "SOS");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({
          object: "list",
          has_more: false,
          data: [
            {
              id: "commander",
              name: "Commander Card",
              set: "soc",
              collector_number: "1",
              prices: {},
            },
            {
              id: "base-two",
              name: "Base Card 2",
              set: "sos",
              collector_number: "2",
              prices: {},
            },
            {
              id: "base-one",
              name: "Base Card 1",
              set: "sos",
              collector_number: "1",
              prices: {},
            },
          ],
        }),
      }),
    );

    const result = await fetchSetCards(resolved?.relatedSets ?? [], "all");

    expect(result.cards.map((card) => card.name)).toEqual([
      "Base Card 1",
      "Base Card 2",
      "Commander Card",
    ]);
  });
});
