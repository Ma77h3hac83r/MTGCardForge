import { getSafeScryfallApiUrl, normalizeScryfallCards, type CardSearchResult, type ScryfallCard } from "@/lib/scryfall";

type ScryfallList<T> = {
  data?: T[];
  has_more?: boolean;
  next_page?: string;
};

export async function fetchArtistCards(artistName: string, signal?: AbortSignal) {
  const cards = await fetchAllArtistPages(buildArtistSearchUrl(artistName), signal);
  return normalizeScryfallCards(cards);
}

export function buildArtistSearchUrl(artistName: string) {
  const query = `artist:${quoteScryfallValue(artistName.trim())} game:paper`;
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
