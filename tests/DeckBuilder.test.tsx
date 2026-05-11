import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DeckBuilder } from "@/components/DeckBuilder";

function response(status: number, payload: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: vi.fn().mockResolvedValue(payload),
  };
}

describe("DeckBuilder", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders without a navbar search field", () => {
    render(<DeckBuilder />);

    expect(screen.queryByRole("search")).not.toBeInTheDocument();
    expect(screen.getByLabelText(/deck input/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /press slash to focus this field/i })).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "/" });

    expect(screen.getByLabelText(/deck input/i)).toHaveFocus();
  });

  it("loads a pasted deck list and groups cards by type", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        response(404, {
          object: "error",
        }),
      )
      .mockResolvedValueOnce(
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
              mana_cost: "{1}",
              prices: { usd: "0.99" },
              image_uris: { normal: "https://cards.scryfall.io/sol-ring.jpg" },
            },
            {
              id: "island",
              name: "Island",
              set: "one",
              set_name: "Phyrexia: All Will Be One",
              collector_number: "267",
              type_line: "Basic Land - Island",
              mana_cost: "",
              prices: { usd: "0.05" },
              image_uris: { normal: "https://cards.scryfall.io/island.jpg" },
            },
          ],
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    render(<DeckBuilder />);
    fireEvent.change(screen.getByLabelText(/deck input/i), {
      target: { value: "1 Sol Ring\n2 Island" },
    });
    fireEvent.click(screen.getByRole("button", { name: /load deck/i }));

    expect(await screen.findByRole("heading", { name: /card type breakdown/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /load new deck/i })).toBeInTheDocument();
    expect(screen.queryByLabelText(/deck input/i)).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /artifact\s*1/i })).toHaveAttribute("href", "#deck-section-artifact");
    expect(screen.getByRole("link", { name: /basic land\s*2/i })).toHaveAttribute("href", "#deck-section-basic-land");
    expect(screen.getByText("Artifact (1)")).toBeInTheDocument();
    expect(screen.getByText("Basic Land (2)")).toBeInTheDocument();
    expect(screen.getByText("Sol Ring")).toBeInTheDocument();
    expect(screen.getByText("Island")).toBeInTheDocument();
    expect(screen.getByText("$0.99")).toBeInTheDocument();
    expect(screen.getByText("$0.05")).toBeInTheDocument();
    expect(screen.queryByText("CMM #400")).not.toBeInTheDocument();
    expect(screen.queryByText("ONE #267")).not.toBeInTheDocument();
    expect(screen.queryByText("{1}")).not.toBeInTheDocument();

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
    expect(new URL(String(fetchMock.mock.calls[0][0])).searchParams.get("order")).toBe("usd");
    expect(new URL(String(fetchMock.mock.calls[0][0])).searchParams.get("q")).toBe(
      '(!"Sol Ring" or !"Island") game:paper usd>=0',
    );
  });

  it("adds produced tokens after the basic land section", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        response(200, {
          object: "list",
          data: [
            {
              id: "bird-maker",
              name: "Bird Maker",
              set: "tst",
              set_name: "Test",
              collector_number: "1",
              type_line: "Creature",
              prices: { usd: "0.50" },
              image_uris: { normal: "https://cards.scryfall.io/bird-maker.jpg" },
              all_parts: [
                {
                  id: "bird-token",
                  component: "token",
                  name: "Bird",
                  type_line: "Token Creature - Bird",
                  uri: "https://api.scryfall.com/cards/bird-token",
                },
              ],
            },
            {
              id: "island",
              name: "Island",
              set: "one",
              set_name: "Phyrexia: All Will Be One",
              collector_number: "267",
              type_line: "Basic Land - Island",
              prices: { usd: "0.05" },
              image_uris: { normal: "https://cards.scryfall.io/island.jpg" },
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        response(200, {
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
          image_uris: { normal: "https://cards.scryfall.io/bird-token.jpg" },
          scryfall_uri: "https://scryfall.com/card/tst/1/bird",
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    render(<DeckBuilder />);
    fireEvent.change(screen.getByLabelText(/deck input/i), {
      target: { value: "1 Bird Maker\n1 Island" },
    });
    fireEvent.click(screen.getByRole("button", { name: /load deck/i }));

    expect(await screen.findByText("Tokens (1)")).toBeInTheDocument();
    expect(screen.getByText("Bird")).toBeInTheDocument();
    expect(screen.getByText("Token Creature - Bird")).toBeInTheDocument();
    expect(screen.getAllByText("Tokens").length).toBeGreaterThan(0);

    const pageText = document.body.textContent ?? "";
    expect(pageText.indexOf("Basic Land (1)")).toBeGreaterThan(-1);
    expect(pageText.indexOf("Tokens (1)")).toBeGreaterThan(pageText.indexOf("Basic Land (1)"));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
    expect(fetchMock.mock.calls[1][0]).toBe("https://api.scryfall.com/cards/bird-token");
  });
});
