import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TokenSearch } from "@/components/TokenSearch";

function response(status: number, payload: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: vi.fn().mockResolvedValue(payload),
  };
}

const tokenCard = {
  id: "bird-token",
  layout: "token",
  name: "Bird",
  set: "tst",
  set_name: "Test Tokens",
  collector_number: "1",
  type_line: "Token Creature - Bird",
  power: "1",
  toughness: "1",
  colors: ["W"],
  prices: {},
  prints_search_uri: "https://api.scryfall.com/cards/search?q=bird+is%3Atoken",
  scryfall_uri: "https://scryfall.com/card/tst/1/bird",
  all_parts: [
    {
      id: "producer",
      component: "combo_piece",
      name: "Bird Maker",
      type_line: "Creature",
      uri: "https://api.scryfall.com/cards/producer",
    },
  ],
};

const producerCard = {
  id: "producer",
  name: "Bird Maker",
  set: "tst",
  set_name: "Test",
  collector_number: "2",
  type_line: "Creature",
  prices: {},
  scryfall_uri: "https://scryfall.com/card/tst/2/bird-maker",
};

const sourceCardWithTwoTokens = {
  id: "source",
  name: "Token Maker",
  set: "tst",
  set_name: "Test",
  collector_number: "3",
  type_line: "Creature",
  prices: {},
  scryfall_uri: "https://scryfall.com/card/tst/3/token-maker",
  all_parts: [
    {
      id: "angel-token",
      component: "token",
      name: "Angel",
      type_line: "Token Creature - Angel",
      uri: "https://api.scryfall.com/cards/angel-token",
    },
    {
      id: "demon-token",
      component: "token",
      name: "Demon",
      type_line: "Token Creature - Demon",
      uri: "https://api.scryfall.com/cards/demon-token",
    },
  ],
};

const angelToken = {
  id: "angel-token",
  layout: "token",
  name: "Angel",
  set: "tst",
  set_name: "Test Tokens",
  collector_number: "4",
  type_line: "Token Creature - Angel",
  power: "4",
  toughness: "4",
  colors: ["W"],
  prices: {},
  prints_search_uri: "https://api.scryfall.com/cards/search?q=angel+is%3Atoken",
  scryfall_uri: "https://scryfall.com/card/tst/4/angel",
  all_parts: [
    {
      id: "old-producer",
      component: "combo_piece",
      name: "Old Producer",
      type_line: "Creature",
      uri: "https://api.scryfall.com/cards/old-producer",
    },
  ],
};

const demonToken = {
  id: "demon-token",
  layout: "token",
  name: "Demon",
  set: "tst",
  set_name: "Test Tokens",
  collector_number: "5",
  type_line: "Token Creature - Demon",
  power: "5",
  toughness: "5",
  colors: ["B"],
  prices: {},
  prints_search_uri: "https://api.scryfall.com/cards/search?q=demon+is%3Atoken",
  scryfall_uri: "https://scryfall.com/card/tst/5/demon",
  all_parts: [],
};

describe("TokenSearch", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("does not show a tokens-created section for a single token search result", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn()
        .mockResolvedValueOnce(response(404, { object: "error" }))
        .mockResolvedValueOnce(response(200, { object: "list", has_more: false, data: [tokenCard] }))
        .mockResolvedValueOnce(response(200, { object: "list", has_more: false, data: [tokenCard] }))
        .mockResolvedValueOnce(response(200, producerCard)),
    );

    render(<TokenSearch />);
    fireEvent.change(screen.getByLabelText(/search by token or token-making card/i), {
      target: { value: "Bird" },
    });
    fireEvent.submit(screen.getByRole("search"));

    expect(await screen.findByText("Token Details")).toBeInTheDocument();
    expect(screen.queryByText("Colors")).not.toBeInTheDocument();
    expect(screen.queryByText("Token Versions")).not.toBeInTheDocument();
    expect(screen.queryByText("Tokens Created")).not.toBeInTheDocument();
    expect(screen.queryByText("Other Printings")).not.toBeInTheDocument();
    expect(screen.getByText("Cards That Make This Token")).toBeInTheDocument();
  });

  it("shows autocomplete suggestions including extras and searches selected names", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response(200, { object: "catalog", data: ["Serra the Benevolent", "Serra the Benevolent Emblem"] }))
      .mockResolvedValueOnce(response(404, { object: "error" }))
      .mockResolvedValueOnce(response(200, { object: "list", has_more: false, data: [tokenCard] }))
      .mockResolvedValueOnce(response(200, { object: "list", has_more: false, data: [tokenCard] }))
      .mockResolvedValueOnce(response(200, producerCard));
    vi.stubGlobal("fetch", fetchMock);

    render(<TokenSearch />);
    fireEvent.change(screen.getByLabelText(/search by token or token-making card/i), {
      target: { value: "serra" },
    });

    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 300));
    });

    expect(await screen.findByRole("option", { name: "Serra the Benevolent" })).toBeInTheDocument();
    const autocompleteUrl = new URL(String(fetchMock.mock.calls[0][0]));
    expect(autocompleteUrl.origin + autocompleteUrl.pathname).toBe("https://api.scryfall.com/cards/autocomplete");
    expect(autocompleteUrl.searchParams.get("q")).toBe("serra");
    expect(autocompleteUrl.searchParams.get("include_extras")).toBe("true");

    fireEvent.mouseDown(screen.getByRole("option", { name: "Serra the Benevolent Emblem" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenNthCalledWith(
        2,
        "https://api.scryfall.com/cards/named?exact=Serra%20the%20Benevolent%20Emblem",
        expect.any(Object),
      );
    });
  });

  it("clears stale token details when a new selected token fails to load details", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);

      if (url.includes("/cards/named")) {
        return Promise.resolve(response(200, sourceCardWithTwoTokens));
      }

      if (url === "https://api.scryfall.com/cards/angel-token") {
        return Promise.resolve(response(200, angelToken));
      }

      if (url === "https://api.scryfall.com/cards/demon-token") {
        return Promise.resolve(response(200, demonToken));
      }

      if (url.includes("angel+is%3Atoken")) {
        return Promise.resolve(response(200, { object: "list", has_more: false, data: [
          angelToken,
          {
            ...angelToken,
            id: "angel-reprint",
            collector_number: "6",
            scryfall_uri: "https://scryfall.com/card/tst/6/angel",
          },
        ] }));
      }

      if (url === "https://api.scryfall.com/cards/old-producer") {
        return Promise.resolve(response(200, {
          id: "old-producer",
          name: "Old Producer",
          set: "tst",
          set_name: "Test",
          collector_number: "7",
          type_line: "Creature",
          prices: {},
          scryfall_uri: "https://scryfall.com/card/tst/7/old-producer",
        }));
      }

      if (url.includes("demon+is%3Atoken")) {
        return Promise.resolve(response(500, { object: "error", details: "Failed" }));
      }

      return Promise.reject(new Error(`Unexpected fetch request: ${url}`));
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<TokenSearch />);
    fireEvent.change(screen.getByLabelText(/search by token or token-making card/i), {
      target: { value: "Token Maker" },
    });
    fireEvent.submit(screen.getByRole("search"));

    expect(await screen.findByText("Cards That Make This Token")).toBeInTheDocument();
    expect(screen.getByText("Other Printings")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Demon").closest("tr") as HTMLTableRowElement);

    expect(await screen.findByRole("alert")).toHaveTextContent("Unable to load details for Demon.");
    expect(screen.getByRole("heading", { name: "Demon" })).toBeInTheDocument();
    expect(screen.queryByText("Old Producer")).not.toBeInTheDocument();
    expect(screen.queryByText("Other Printings")).not.toBeInTheDocument();
    expect(screen.queryByText("Cards That Make This Token")).not.toBeInTheDocument();
  });
});
