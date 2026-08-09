import { normalizeScryfallCards, type CardSearchResult } from "@/lib/scryfall";
import { fetchAllScryfallCardPages, fetchScryfallCardPage, waitForScryfall } from "@/lib/scryfallPages";

export type ArtistFrameFilter = "all" | "default" | "full" | "extended" | "showcase" | "etched" | "halo" | "retro";

export type ProgressiveArtistCardsPage = {
  cards: CardSearchResult[];
  nextPage: string | null;
  hasMore: boolean;
};

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

export async function fetchArtistCardsPage(
  artistName: string,
  signal?: AbortSignal,
  filters: ArtistFrameFilter | ArtistFrameFilter[] = "all",
  pageUrl?: string | null,
): Promise<ProgressiveArtistCardsPage> {
  const page = await fetchScryfallCardPage(pageUrl ?? buildArtistSearchUrl(artistName, filters), signal, {
    emptyOn404: true,
    errorMessage: "Unable to load cards for this artist.",
    rateLimitMessage: "Scryfall is rate limiting requests. Wait a moment and search again.",
  });

  return {
    cards: normalizeScryfallCards(page.cards),
    nextPage: page.nextPage,
    hasMore: Boolean(page.nextPage),
  };
}

export async function fetchArtistCards(
  artistName: string,
  signal?: AbortSignal,
  filters: ArtistFrameFilter | ArtistFrameFilter[] = "all",
) {
  const cards = await fetchAllScryfallCardPages(buildArtistSearchUrl(artistName, filters), signal, {
    emptyOn404: true,
    errorMessage: "Unable to load cards for this artist.",
    rateLimitMessage: "Scryfall is rate limiting requests. Wait a moment and search again.",
  });
  return normalizeScryfallCards(cards);
}

/** Streams artist cards page-by-page so the UI can render after the first response. */
export async function streamArtistCards(
  artistName: string,
  filters: ArtistFrameFilter | ArtistFrameFilter[],
  onPage: (update: { cards: CardSearchResult[]; done: boolean }) => void,
  signal?: AbortSignal,
) {
  let nextUrl: string | null = buildArtistSearchUrl(artistName, filters);
  let accumulated: CardSearchResult[] = [];
  let isFirstPage = true;

  while (nextUrl) {
    if (!isFirstPage) {
      await waitForScryfall(signal);
    }

    const page = await fetchScryfallCardPage(nextUrl, signal, {
      emptyOn404: true,
      errorMessage: "Unable to load cards for this artist.",
      rateLimitMessage: "Scryfall is rate limiting requests. Wait a moment and search again.",
    });
    accumulated = [...accumulated, ...normalizeScryfallCards(page.cards)];
    nextUrl = page.nextPage;
    onPage({ cards: accumulated, done: !nextUrl });
    isFirstPage = false;
  }

  if (isFirstPage) {
    onPage({ cards: [], done: true });
  }
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
