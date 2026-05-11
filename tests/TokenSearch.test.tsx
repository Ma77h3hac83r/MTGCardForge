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
});
