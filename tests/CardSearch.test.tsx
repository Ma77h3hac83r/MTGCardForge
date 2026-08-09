import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CardSearch } from "@/components/CardSearch";

const lightningBolt = {
  id: "bolt",
  name: "Lightning Bolt",
  set_name: "Magic 2010",
  set: "m10",
  collector_number: "146",
  rarity: "common",
  type_line: "Instant",
  mana_cost: "{R}",
  oracle_text: "Lightning Bolt deals 3 damage to any target.",
  artist: "Christopher Moeller",
  prices: { usd: "1.25", usd_foil: null, usd_etched: null, eur: null, tix: null },
  image_uris: { normal: "https://cards.scryfall.io/bolt.jpg" },
  prints_search_uri: "https://api.scryfall.com/cards/search?q=%21%22Lightning%20Bolt%22&unique=prints",
  scryfall_uri: "https://scryfall.com/card/m10/146/lightning-bolt",
  purchase_uris: { tcgplayer: "https://www.tcgplayer.com/bolt" },
};

const fourthEditionBolt = {
  ...lightningBolt,
  id: "bolt-4ed",
  set_name: "Fourth Edition",
  set: "4ed",
  collector_number: "208",
  rarity: "common",
  prices: { usd: "2.75", usd_foil: "6.25", usd_etched: "9.50", eur: null, tix: null },
  image_uris: { normal: "https://cards.scryfall.io/bolt-4ed.jpg" },
  scryfall_uri: "https://scryfall.com/card/4ed/208/lightning-bolt",
};

const foilOnlyBolt = {
  ...lightningBolt,
  id: "bolt-foil",
  set_name: "Promo Pack",
  set: "pip",
  collector_number: "888",
  rarity: "rare",
  prices: { usd: null, usd_foil: "7.50", usd_etched: null, eur: null, tix: null },
  image_uris: { normal: "https://cards.scryfall.io/bolt-foil.jpg" },
  scryfall_uri: "https://scryfall.com/card/pip/888/lightning-bolt",
};

function response(status: number, payload: unknown) {
  return {
    ok: status >= 200 && status < 300,
    payload,
    status,
    json: vi.fn().mockResolvedValue(payload),
  };
}

function deferredResponse() {
  let resolve!: (value: ReturnType<typeof response>) => void;
  const promise = new Promise<ReturnType<typeof response>>((nextResolve) => {
    resolve = nextResolve;
  });

  return { promise, resolve };
}

function mockFetchSequence(...responses: Array<ReturnType<typeof response>>) {
  const pendingResponses = [...responses];
  const fetchMock = vi.fn((input: RequestInfo | URL) => {
    const url = String(input);

    if (url.includes("/cards/autocomplete") && !isCatalogResponse(pendingResponses[0])) {
      return Promise.resolve(response(200, { object: "catalog", data: [] }));
    }

    const nextResponse = pendingResponses.shift();

    if (!nextResponse) {
      return Promise.reject(new Error(`Unexpected fetch request: ${url}`));
    }

    return Promise.resolve(nextResponse);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function isCatalogResponse(item: ReturnType<typeof response> | undefined) {
  return Boolean(
    item &&
      typeof item.payload === "object" &&
      item.payload &&
      "object" in item.payload &&
      item.payload.object === "catalog",
  );
}

function fetchUrls(fetchMock: ReturnType<typeof vi.fn>) {
  return fetchMock.mock.calls.map((call) => String(call[0]));
}

function printingsUrls(fetchMock: ReturnType<typeof vi.fn>) {
  return fetchUrls(fetchMock).filter((url) => url.startsWith("https://api.scryfall.com/cards/search"));
}

function expectFetchUrl(fetchMock: ReturnType<typeof vi.fn>, expectedUrl: string) {
  expect(fetchUrls(fetchMock)).toContain(expectedUrl);
}

function expectFetchUrlContaining(fetchMock: ReturnType<typeof vi.fn>, expectedValue: string) {
  expect(fetchUrls(fetchMock).some((url) => url.includes(expectedValue))).toBe(true);
}

function submitSearch(query: string) {
  render(<CardSearch />);
  fireEvent.change(screen.getByLabelText(/search by exact card name/i), {
    target: { value: query },
  });
  fireEvent.submit(screen.getByRole("search"));
}

async function typeForAutocomplete(query: string) {
  render(<CardSearch />);
  fireEvent.change(screen.getByLabelText(/search by exact card name/i), {
    target: { value: query },
  });

  await act(async () => {
    await new Promise((resolve) => window.setTimeout(resolve, 300));
  });
}

describe("CardSearch", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders the navbar and idle state before searching", () => {
    render(<CardSearch />);

    expect(screen.getByRole("link", { name: /mtg card forge/i })).toBeInTheDocument();
    expect(screen.getByText(/search an exact magic card name/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /press slash to focus this field/i })).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "/" });

    expect(screen.getByLabelText(/search by exact card name/i)).toHaveFocus();
  });

  it("renders loading placeholders while an exact lookup is pending", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise(() => {
            // Intentionally unresolved so the loading state remains visible.
          }),
      ),
    );

    submitSearch("Lightning Bolt");

    expect(document.querySelectorAll(".animate-pulse")).toHaveLength(2);
  });

  it("keeps newer exact search results when an older request resolves later", async () => {
    const oldExact = deferredResponse();
    const oldPrintings = deferredResponse();
    const newExact = deferredResponse();
    const newPrintings = deferredResponse();
    const oldCard = {
      ...lightningBolt,
      id: "old-card",
      name: "Old Spell",
      prints_search_uri: "https://api.scryfall.com/cards/search?q=%21%22Old%20Spell%22&unique=prints",
    };
    const newCard = {
      ...lightningBolt,
      id: "new-card",
      name: "New Spell",
      collector_number: "999",
      prints_search_uri: "https://api.scryfall.com/cards/search?q=%21%22New%20Spell%22&unique=prints",
    };
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);

      if (url.includes("/cards/named") && url.includes("Old%20Spell")) {
        return oldExact.promise;
      }

      if (url.includes("/cards/named") && url.includes("New%20Spell")) {
        return newExact.promise;
      }

      if (url.includes("/cards/search") && url.includes("Old+Spell")) {
        return oldPrintings.promise;
      }

      if (url.includes("/cards/search") && url.includes("New+Spell")) {
        return newPrintings.promise;
      }

      return Promise.reject(new Error(`Unexpected fetch request: ${url}`));
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<CardSearch />);
    fireEvent.change(screen.getByLabelText(/search by exact card name/i), {
      target: { value: "Old Spell" },
    });
    fireEvent.submit(screen.getByRole("search"));
    fireEvent.change(screen.getByLabelText(/search by exact card name/i), {
      target: { value: "New Spell" },
    });
    fireEvent.submit(screen.getByRole("search"));

    newExact.resolve(response(200, newCard));
    await waitFor(() => expectFetchUrlContaining(fetchMock, "New+Spell"));
    newPrintings.resolve(response(200, { object: "list", total_cards: 1, data: [newCard] }));

    expect(await screen.findByRole("heading", { name: "New Spell" })).toBeInTheDocument();

    oldExact.resolve(response(200, oldCard));
    oldPrintings.resolve(response(200, { object: "list", total_cards: 1, data: [oldCard] }));

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "New Spell" })).toBeInTheDocument();
    });
    expect(screen.queryByRole("heading", { name: "Old Spell" })).not.toBeInTheDocument();
  });

  it("shows autocomplete suggestions with prefix matches before contains matches", async () => {
    const fetchMock = mockFetchSequence(
      response(200, {
        object: "catalog",
        data: ["Banners Raised", "Sol Ring", "Solitude", "Temple of Sol"],
      }),
      response(200, lightningBolt),
      response(200, {
        object: "list",
        total_cards: 1,
        data: [lightningBolt],
      }),
    );

    await typeForAutocomplete("sol");

    const options = await screen.findAllByRole("option");
    expect(options.map((option) => option.textContent)).toEqual([
      "Sol Ring",
      "Solitude",
      "Temple of Sol",
      "Banners Raised",
    ]);
    expectFetchUrl(fetchMock, "https://api.scryfall.com/cards/autocomplete?q=sol");

    fireEvent.mouseDown(screen.getByRole("option", { name: "Sol Ring" }));

    await waitFor(() => {
      expectFetchUrl(fetchMock, "https://api.scryfall.com/cards/named?exact=Sol%20Ring");
    });
    expect(await screen.findByText("M10 #146")).toBeInTheDocument();
  });

  it("looks up an exact card name and renders card details plus printings", async () => {
    const fetchMock = mockFetchSequence(
      response(200, lightningBolt),
      response(200, {
        object: "list",
        total_cards: 3,
        data: [lightningBolt, fourthEditionBolt, foilOnlyBolt],
      }),
    );

    submitSearch("Lightning Bolt");

    expect(await screen.findByRole("heading", { name: "Lightning Bolt" })).toBeInTheDocument();
    expectFetchUrl(fetchMock, "https://api.scryfall.com/cards/named?exact=Lightning%20Bolt");
    expectFetchUrl(
      fetchMock,
      "https://api.scryfall.com/cards/search?q=%21%22Lightning+Bolt%22+game%3Apaper&unique=prints",
    );
    expect(screen.getByRole("link", { name: /tcgplayer/i })).toHaveAttribute(
      "href",
      "https://www.tcgplayer.com/bolt",
    );
    expect(screen.getByRole("link", { name: /tcgplayer/i })).toHaveTextContent("$1.25");
    expect(screen.getByRole("link", { name: "Magic 2010 (M10)" })).toHaveAttribute("href", "/sets?set=M10");
    expect(screen.getByText("M10 #146")).toBeInTheDocument();
    expect(screen.getByText("4ED #208")).toBeInTheDocument();
    expect(screen.getByText("$2.75")).toBeInTheDocument();
    expect(screen.getByText("$6.25")).toBeInTheDocument();
    expect(screen.getByText("$9.50")).toBeInTheDocument();
    expect(screen.getByText("PIP #888")).toBeInTheDocument();
    expect(screen.getByText("$7.50")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Christopher Moeller" })).toHaveAttribute(
      "href",
      "/artists?artist=Christopher%20Moeller",
    );
    expect(screen.getAllByText("Base").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Foil").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Rainbow").length).toBeGreaterThan(0);
  });

  it("loads a clicked printing into the card details section", async () => {
    Object.defineProperty(window, "scrollTo", {
      configurable: true,
      value: vi.fn(),
    });
    mockFetchSequence(
      response(200, lightningBolt),
      response(200, {
        object: "list",
        total_cards: 2,
        data: [lightningBolt, fourthEditionBolt],
      }),
    );

    submitSearch("Lightning Bolt");
    expect(await screen.findByText("Magic 2010 (M10)")).toBeInTheDocument();

    fireEvent.click(screen.getByText("4ED #208").closest("button") as HTMLButtonElement);

    expect(screen.getByText("Fourth Edition (4ED)")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /4ed #208/i })).toHaveAttribute("aria-current", "true");
    expect(screen.queryByRole("link", { name: /4ed #208/i })).not.toBeInTheDocument();
  });

  it("filters printings with Scryfall frame search syntax", async () => {
    const fetchMock = mockFetchSequence(
      response(200, lightningBolt),
      response(200, {
        object: "list",
        total_cards: 2,
        data: [lightningBolt, fourthEditionBolt],
      }),
      response(200, {
        object: "list",
        total_cards: 1,
        data: [lightningBolt],
      }),
      response(200, {
        object: "list",
        total_cards: 0,
        data: [],
      }),
      response(200, {
        object: "list",
        total_cards: 1,
        data: [lightningBolt],
      }),
      response(200, {
        object: "list",
        total_cards: 2,
        data: [lightningBolt, foilOnlyBolt],
      }),
      response(200, {
        object: "list",
        total_cards: 1,
        data: [fourthEditionBolt],
      }),
      response(200, {
        object: "list",
        total_cards: 1,
        data: [fourthEditionBolt],
      }),
      response(200, {
        object: "list",
        total_cards: 1,
        data: [foilOnlyBolt],
      }),
      response(200, {
        object: "list",
        total_cards: 1,
        data: [lightningBolt],
      }),
    );

    submitSearch("Lightning Bolt");
    expect(await screen.findByText("M10 #146")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("checkbox", { name: /^standard$/i }));

    await waitFor(() => {
      expectFetchUrlContaining(fetchMock, "is%3Adefault");
    });

    fireEvent.click(screen.getByRole("checkbox", { name: /borderless/i }));

    await waitFor(() => {
      expectFetchUrlContaining(fetchMock, "is%3Afull");
    });
    expect(await screen.findByText(/no printings matched this filter/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("checkbox", { name: /extended/i }));

    await waitFor(() => {
      expectFetchUrlContaining(fetchMock, "is%3Adefault+OR+is%3Afull+OR+is%3Aextended");
    });

    fireEvent.click(screen.getByRole("checkbox", { name: /showcase/i }));

    await waitFor(() => {
      expectFetchUrlContaining(fetchMock, "is%3Adefault+OR+is%3Afull+OR+is%3Aextended+OR+is%3Ashowcase");
    });

    fireEvent.click(screen.getByRole("checkbox", { name: /^etched$/i }));

    await waitFor(() => {
      expectFetchUrlContaining(
        fetchMock,
        "is%3Adefault+OR+is%3Afull+OR+is%3Aextended+OR+is%3Ashowcase+OR+is%3Aetched",
      );
    });

    fireEvent.click(screen.getByRole("checkbox", { name: /halo foil/i }));

    await waitFor(() => {
      expectFetchUrlContaining(
        fetchMock,
        "is%3Adefault+OR+is%3Afull+OR+is%3Aextended+OR+is%3Ashowcase+OR+is%3Aetched+OR+is%3Ahalo",
      );
    });

    fireEvent.click(screen.getByRole("checkbox", { name: /^retro$/i }));

    await waitFor(() => {
      expectFetchUrlContaining(
        fetchMock,
        "is%3Adefault+OR+is%3Afull+OR+is%3Aextended+OR+is%3Ashowcase+OR+is%3Aetched+OR+is%3Ahalo+OR+is%3Aretro",
      );
    });

    fireEvent.click(screen.getByRole("checkbox", { name: /^all$/i }));

    await waitFor(() => {
      expect(printingsUrls(fetchMock).at(-1)).not.toContain("is%3A");
    });
  });

  it("filters printings with Scryfall set type search syntax", async () => {
    const fetchMock = mockFetchSequence(
      response(200, lightningBolt),
      response(200, {
        object: "list",
        total_cards: 2,
        data: [lightningBolt, fourthEditionBolt],
      }),
      response(200, {
        object: "list",
        total_cards: 1,
        data: [lightningBolt],
      }),
      response(200, {
        object: "list",
        total_cards: 1,
        data: [fourthEditionBolt],
      }),
      response(200, {
        object: "list",
        total_cards: 0,
        data: [],
      }),
    );

    submitSearch("Lightning Bolt");
    expect(await screen.findByText("M10 #146")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("checkbox", { name: /standard mtg/i }));

    await waitFor(() => {
      expectFetchUrlContaining(
        fetchMock,
        "-is%3Auniversesbeyond+-set%3Asld+-set%3Apssc+-set%3Aslp+-set%3Aslc+-set%3Aslx+-set%3Aslu",
      );
    });

    fireEvent.click(screen.getByRole("checkbox", { name: /ub/i }));

    await waitFor(() => {
      expectFetchUrlContaining(fetchMock, "is%3Auniversesbeyond");
    });
    expectFetchUrlContaining(fetchMock, "-set%3Asld+-set%3Apssc+-set%3Aslp+-set%3Aslc+-set%3Aslx+-set%3Aslu");

    fireEvent.click(screen.getByRole("checkbox", { name: /sl/i }));

    await waitFor(() => {
      expectFetchUrlContaining(fetchMock, "%28set%3Asld+OR+set%3Apssc+OR+set%3Aslp+OR+set%3Aslc+OR+set%3Aslx+OR+set%3Aslu%29");
    });
  });

  it("renders no-result copy for exact-name misses", async () => {
    mockFetchSequence(
      response(404, {
        object: "error",
        details: "No cards found matching the exact name.",
      }),
    );

    submitSearch("Bolt");

    expect(await screen.findByText(/no exact card name found for "Bolt"/i)).toBeInTheDocument();
  });

  it("renders API error messages", async () => {
    mockFetchSequence(
      response(500, {
        object: "error",
        details: "Scryfall is unavailable.",
      }),
    );

    submitSearch("Lightning Bolt");

    expect(await screen.findByRole("alert")).toHaveTextContent("Scryfall is unavailable.");
  });

  it("renders rate-limit messages", async () => {
    mockFetchSequence(
      response(429, {
        object: "error",
        details: "Too many requests.",
      }),
    );

    submitSearch("Lightning Bolt");

    expect(await screen.findByRole("alert")).toHaveTextContent(/rate limiting/i);
  });

  it("keeps card details visible if the printings request returns no data", async () => {
    mockFetchSequence(response(200, lightningBolt), response(500, { object: "error" }));

    submitSearch("Lightning Bolt");

    const detailPanel = await screen.findByRole("heading", { name: "Lightning Bolt" });
    expect(detailPanel).toBeInTheDocument();
    expect(screen.getByText(/no printings matched this filter/i)).toBeInTheDocument();
  });
});
