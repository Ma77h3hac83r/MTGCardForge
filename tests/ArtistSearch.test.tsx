import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ArtistSearch } from "@/components/ArtistSearch";

const artistCard = {
  id: "artist-card",
  name: "Gaea's Blessing",
  set: "dom",
  set_name: "Dominaria",
  collector_number: "161",
  rarity: "uncommon",
  type_line: "Sorcery",
  mana_cost: "{1}{G}",
  artist: "Rebecca Guay",
  colors: ["G"],
  prices: {},
  image_uris: { normal: "https://cards.scryfall.io/gaeas-blessing.jpg" },
  scryfall_uri: "https://scryfall.com/card/dom/161/gaeas-blessing",
};

function response(status: number, payload: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: vi.fn().mockResolvedValue(payload),
  };
}

describe("ArtistSearch", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    window.history.replaceState(null, "", "/");
  });

  it("shows artist autocomplete suggestions and searches selected names", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        response(200, {
          object: "catalog",
          data: ["Mark Zug", "Rebecca Guay", "Rebecca On"],
        }),
      )
      .mockResolvedValueOnce(
        response(200, {
          object: "list",
          has_more: false,
          data: [artistCard],
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    render(<ArtistSearch />);
    fireEvent.change(screen.getByLabelText(/search by artist name/i), {
      target: { value: "reb" },
    });

    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 300));
    });

    expect(await screen.findByRole("option", { name: "Rebecca Guay" })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "https://api.scryfall.com/catalog/artist-names",
      expect.any(Object),
    );

    fireEvent.mouseDown(screen.getByRole("option", { name: "Rebecca Guay" }));

    expect(await screen.findByRole("heading", { name: "Rebecca Guay" })).toBeInTheDocument();
    const searchUrl = new URL(String(fetchMock.mock.calls[1][0]));
    expect(searchUrl.searchParams.get("q")).toBe('artist:"Rebecca Guay" game:paper');
  });

  it("searches artist names and renders the artist card gallery", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      response(200, {
        object: "list",
        has_more: false,
        data: [artistCard],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<ArtistSearch />);
    fireEvent.change(screen.getByLabelText(/search by artist name/i), {
      target: { value: "Rebecca Guay" },
    });
    fireEvent.submit(screen.getByRole("search"));

    expect(await screen.findByRole("heading", { name: "Rebecca Guay" })).toBeInTheDocument();
    expect(screen.getByText("Gaea's Blessing")).toBeInTheDocument();
    expect(screen.getByText("DOM #161")).toBeInTheDocument();
    expect(window.location.search).toBe("?artist=Rebecca+Guay");

    const calledUrl = new URL(String(fetchMock.mock.calls[0][0]));
    expect(calledUrl.searchParams.get("q")).toBe('artist:"Rebecca Guay" game:paper');
  });

  it("loads artist links from the artist query parameter", async () => {
    window.history.replaceState(null, "", "/artists?artist=Rebecca%20Guay");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        response(200, {
          object: "list",
          has_more: false,
          data: [artistCard],
        }),
      ),
    );

    render(<ArtistSearch />);

    await waitFor(() => expect(screen.getByLabelText(/search by artist name/i)).toHaveValue("Rebecca Guay"));
    expect(await screen.findByRole("heading", { name: "Rebecca Guay" })).toBeInTheDocument();
  });
});
