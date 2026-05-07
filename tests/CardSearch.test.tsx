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
    status,
    json: vi.fn().mockResolvedValue(payload),
  };
}

function mockFetchSequence(...responses: Array<ReturnType<typeof response>>) {
  const fetchMock = vi.fn();
  responses.forEach((item) => fetchMock.mockResolvedValueOnce(item));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
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
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "https://api.scryfall.com/cards/autocomplete?q=sol",
      expect.any(Object),
    );

    fireEvent.mouseDown(screen.getByRole("option", { name: "Sol Ring" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenNthCalledWith(
        2,
        "https://api.scryfall.com/cards/named?exact=Sol%20Ring",
        expect.any(Object),
      );
    });
    expect(await screen.findByText("1 printing")).toBeInTheDocument();
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
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "https://api.scryfall.com/cards/named?exact=Lightning%20Bolt",
      expect.any(Object),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "https://api.scryfall.com/cards/search?q=%21%22Lightning+Bolt%22+game%3Apaper&unique=prints",
      expect.any(Object),
    );
    expect(screen.getByRole("link", { name: /tcgplayer/i })).toHaveAttribute(
      "href",
      "https://www.tcgplayer.com/bolt",
    );
    expect(screen.getByRole("link", { name: /tcgplayer/i })).toHaveTextContent("$1.25");
    expect(screen.getByText("3 printings")).toBeInTheDocument();
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
    expect(await screen.findByText("2 printings")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("checkbox", { name: /^standard$/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenNthCalledWith(
        3,
        expect.stringContaining("is%3Adefault"),
        expect.any(Object),
      );
    });
    expect(await screen.findByText("1 printing")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("checkbox", { name: /borderless/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenNthCalledWith(
        4,
        expect.stringContaining("is%3Afull"),
        expect.any(Object),
      );
    });
    expect(await screen.findByText(/no printings matched this filter/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("checkbox", { name: /extended/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenNthCalledWith(
        5,
        expect.stringContaining("is%3Adefault+OR+is%3Afull+OR+is%3Aextended"),
        expect.any(Object),
      );
    });

    fireEvent.click(screen.getByRole("checkbox", { name: /showcase/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenNthCalledWith(
        6,
        expect.stringContaining("is%3Adefault+OR+is%3Afull+OR+is%3Aextended+OR+is%3Ashowcase"),
        expect.any(Object),
      );
    });

    fireEvent.click(screen.getByRole("checkbox", { name: /^etched$/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenNthCalledWith(
        7,
        expect.stringContaining("is%3Adefault+OR+is%3Afull+OR+is%3Aextended+OR+is%3Ashowcase+OR+is%3Aetched"),
        expect.any(Object),
      );
    });

    fireEvent.click(screen.getByRole("checkbox", { name: /halo foil/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenNthCalledWith(
        8,
        expect.stringContaining("is%3Adefault+OR+is%3Afull+OR+is%3Aextended+OR+is%3Ashowcase+OR+is%3Aetched+OR+is%3Ahalo"),
        expect.any(Object),
      );
    });

    fireEvent.click(screen.getByRole("checkbox", { name: /^retro$/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenNthCalledWith(
        9,
        expect.stringContaining("is%3Adefault+OR+is%3Afull+OR+is%3Aextended+OR+is%3Ashowcase+OR+is%3Aetched+OR+is%3Ahalo+OR+is%3Aretro"),
        expect.any(Object),
      );
    });

    fireEvent.click(screen.getByRole("checkbox", { name: /^all$/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenNthCalledWith(
        10,
        expect.not.stringContaining("is%3A"),
        expect.any(Object),
      );
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
    expect(await screen.findByText("2 printings")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /standard mtg/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenNthCalledWith(
        3,
        expect.stringContaining("-is%3Auniversesbeyond+-set%3Asld+-set%3Apssc+-set%3Aslp+-set%3Aslc+-set%3Aslx+-set%3Aslu"),
        expect.any(Object),
      );
    });
    expect(await screen.findByText("1 printing")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /universes beyond/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenNthCalledWith(
        4,
        expect.stringContaining("is%3Auniversesbeyond"),
        expect.any(Object),
      );
    });
    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      expect.stringContaining("-set%3Asld+-set%3Apssc+-set%3Aslp+-set%3Aslc+-set%3Aslx+-set%3Aslu"),
      expect.any(Object),
    );

    fireEvent.click(screen.getByRole("button", { name: /secret lair/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenNthCalledWith(
        5,
        expect.stringContaining("%28set%3Asld+OR+set%3Apssc+OR+set%3Aslp+OR+set%3Aslc+OR+set%3Aslx+OR+set%3Aslu%29"),
        expect.any(Object),
      );
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
