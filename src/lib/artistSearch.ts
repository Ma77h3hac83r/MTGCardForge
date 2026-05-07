import { getSafeScryfallApiUrl, normalizeScryfallCards, type CardSearchResult, type ScryfallCard } from "@/lib/scryfall";

type ScryfallList<T> = {
  data?: T[];
  has_more?: boolean;
  next_page?: string;
};

export type ArtistFrameFilter = "all" | "default" | "full" | "extended" | "showcase" | "etched" | "halo" | "retro";

export const ARTIST_FRAME_FILTERS: Array<{ label: string; value: ArtistFrameFilter; syntax: string | null }> = [
  { label: "All", value: "all", syntax: null },
  { label: "Standard", value: "default", syntax: "is:default" },
  { label: "Borderless", value: "full", syntax: "is:full" },
  { label: "Extended", value: "extended", syntax: "is:extended" },
  { label: "Showcase", value: "showcase", syntax: "is:showcase" },
  { label: "Etched", value: "etched", syntax: "is:etched" },
  { label: "Halo Foil", value: "halo", syntax: "is:halo" },
  { label: "Retro", value: "retro", syntax: "is:retro" },
];

export async function fetchArtistCards(
  artistName: string,
  signal?: AbortSignal,
  filters: ArtistFrameFilter | ArtistFrameFilter[] = "all",
) {
  const cards = await fetchAllArtistPages(buildArtistSearchUrl(artistName, filters), signal);
  return normalizeScryfallCards(cards);
}

export function buildArtistSearchUrl(
  artistName: string,
  filters: ArtistFrameFilter | ArtistFrameFilter[] = "all",
) {
  const filterSyntax = buildFilterSyntax(filters);
  const query = [`artist:${quoteScryfallValue(artistName.trim())}`, "game:paper", filterSyntax]
    .filter(Boolean)
    .join(" ");
  const url = new URL("https://api.scryfall.com/cards/search");
  url.searchParams.set("q", query);
  url.searchParams.set("unique", "art");
  url.searchParams.set("order", "released");
  url.searchParams.set("dir", "desc");
  url.searchParams.set("include_extras", "true");

  return url.toString();
}

export function getArtistStats(cards: CardSearchResult[]) {
  return {
    cardCount: cards.length,
    setCount: new Set(cards.map((card) => card.setCode).filter(Boolean)).size,
    colorCount: new Set(cards.flatMap((card) => card.colors)).size,
  };
}

function quoteScryfallValue(value: string) {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function buildFilterSyntax(filters: ArtistFrameFilter | ArtistFrameFilter[]) {
  const selectedFilters = Array.isArray(filters) ? filters : [filters];
  const syntaxes = selectedFilters
    .filter((filter) => filter !== "all")
    .map((filter) => ARTIST_FRAME_FILTERS.find((item) => item.value === filter)?.syntax)
    .filter((syntax): syntax is string => Boolean(syntax));

  if (!syntaxes.length) {
    return null;
  }

  return syntaxes.length === 1 ? syntaxes[0] : `(${syntaxes.join(" OR ")})`;
}

async function fetchAllArtistPages(url: string, signal?: AbortSignal) {
  const cards: ScryfallCard[] = [];
  let nextUrl: string | undefined = url;

  while (nextUrl) {
    const safeNextUrl = getSafeScryfallApiUrl(nextUrl);

    if (!safeNextUrl) {
      throw new Error("Scryfall returned an unexpected pagination URL.");
    }

    const response = await fetch(safeNextUrl, {
      signal,
      headers: {
        Accept: "application/json",
      },
    });

    if (response.status === 404) {
      return [];
    }

    if (response.status === 429) {
      throw new Error("Scryfall is rate limiting requests. Wait a moment and search again.");
    }

    if (!response.ok) {
      throw new Error("Unable to load cards for this artist.");
    }

    const payload = (await response.json()) as ScryfallList<ScryfallCard>;
    cards.push(...(payload.data ?? []));
    nextUrl = payload.has_more ? payload.next_page : undefined;
  }

  return cards;
}
