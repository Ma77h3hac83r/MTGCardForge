import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SetSearch } from "@/components/SetSearch";

const setsPayload = {
  object: "list",
  data: [
    {
      id: "sos",
      code: "sos",
      name: "Secrets of Scryfall",
      set_type: "expansion",
      card_count: 2,
      released_at: "2026-01-01",
    },
    {
      id: "soc",
      code: "soc",
      name: "Secrets Commander",
      set_type: "commander",
      card_count: 1,
      parent_set_code: "sos",
      released_at: "2026-01-01",
    },
  ],
};

const cardsPayload = {
  object: "list",
  has_more: false,
  data: [
    {
      id: "soc-card",
      name: "Commander Card",
      set: "soc",
      set_name: "Secrets Commander",
      collector_number: "1",
      rarity: "rare",
      colors: ["W"],
      prices: {},
    },
    {
      id: "sos-card",
      name: "Base Card",
      set: "sos",
      set_name: "Secrets of Scryfall",
      collector_number: "1",
      rarity: "mythic",
      colors: ["U"],
      prices: { usd: "1.00", usd_foil: "2.00", usd_etched: "3.00" },
    },
  ],
};

function response(status: number, payload: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: vi.fn().mockResolvedValue(payload),
  };
}

describe("SetSearch", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("groups cards by set and provides a jump dropdown", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(response(200, setsPayload)).mockResolvedValueOnce(response(200, cardsPayload)));

    render(<SetSearch />);

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    fireEvent.change(screen.getByLabelText(/search by set code or set name/i), {
      target: { value: "SOS" },
    });
    fireEvent.submit(screen.getByRole("search"));

    await screen.findByText("Secrets of Scryfall");
    expect(screen.getByText("Secrets of Scryfall (SOS)")).toBeInTheDocument();
    expect(screen.getByText("Secrets Commander (SOC)")).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: /set sections/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "SOS" })).toHaveAttribute("href", "#set-section-sos");
    expect(screen.getByRole("link", { name: "SOC" })).toHaveAttribute("href", "#set-section-soc");
    expect(screen.getByText("$1.00")).toBeInTheDocument();
    expect(screen.getByText("$2.00")).toBeInTheDocument();
    expect(screen.getByText("$3.00")).toBeInTheDocument();
    expect(document.getElementById("set-section-sos")).not.toBeNull();
    expect(document.getElementById("set-section-soc")).not.toBeNull();
  });

  it("autofills and searches set suggestions from set names", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response(200, setsPayload))
      .mockResolvedValueOnce(response(200, cardsPayload));
    vi.stubGlobal("fetch", fetchMock);

    render(<SetSearch />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    fireEvent.change(screen.getByLabelText(/search by set code or set name/i), {
      target: { value: "scryfall" },
    });

    const option = await screen.findByRole("option", { name: /secrets of scryfall \(sos\)/i });
    fireEvent.pointerDown(option);

    expect(screen.getByLabelText(/search by set code or set name/i)).toHaveValue("Secrets of Scryfall (SOS)");
    expect(await screen.findByText("Secrets of Scryfall (SOS)")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "https://api.scryfall.com/cards/search?q=(set%3Asos%20OR%20set%3Asoc)%20game%3Apaper%20-is%3Aminigame&unique=prints&order=set",
      expect.any(Object),
    );
  });

  it("autofills and searches set suggestions from set codes", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response(200, setsPayload))
      .mockResolvedValueOnce(response(200, cardsPayload));
    vi.stubGlobal("fetch", fetchMock);

    render(<SetSearch />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    fireEvent.change(screen.getByLabelText(/search by set code or set name/i), {
      target: { value: "soc" },
    });

    const option = await screen.findByRole("option", { name: /secrets commander \(soc\)/i });
    fireEvent.pointerDown(option);

    expect(screen.getByLabelText(/search by set code or set name/i)).toHaveValue("Secrets Commander (SOC)");
    expect(await screen.findByText("Secrets of Scryfall (SOS)")).toBeInTheDocument();
  });

  it("filters loaded set cards by rarity and color checkboxes", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(response(200, setsPayload)).mockResolvedValueOnce(response(200, cardsPayload)));

    render(<SetSearch />);

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    fireEvent.change(screen.getByLabelText(/search by set code or set name/i), {
      target: { value: "SOS" },
    });
    fireEvent.submit(screen.getByRole("search"));

    expect(await screen.findByText("2 cards")).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("Rare"));
    expect(screen.getByText("1 card")).toBeInTheDocument();
    expect(screen.queryByText("$1.00")).not.toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("White"));
    expect(screen.getByText("1 card")).toBeInTheDocument();
    expect(screen.queryByText("$1.00")).not.toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("Blue"));
    expect(screen.getByText("No cards matched this filter.")).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("Rare"));
    expect(screen.getByText("No cards matched this filter.")).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("White"));
    expect(screen.getByText("1 card")).toBeInTheDocument();
    expect(screen.getByText("$1.00")).toBeInTheDocument();
  });
});
