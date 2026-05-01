import { getSafeScryfallApiUrl, normalizeScryfallCard, normalizeScryfallCards, type CardSearchResult, type ScryfallCard, type ScryfallRelatedCard } from "@/lib/scryfall";

type ScryfallList<T> = {
  data?: T[];
  has_more?: boolean;
  next_page?: string;
};

export type TokenSearchMode = "card" | "token";

export type TokenSearchResult = {
  mode: TokenSearchMode;
  sourceCard: CardSearchResult | null;
  tokens: CardSearchResult[];
};

export function getTokenParts(card: CardSearchResult) {
  return card.allParts.filter((part) => part.component === "token");
}

export function getProducerParts(token: CardSearchResult) {
  return token.allParts.filter((part) => part.component !== "token");
}

export async function searchTokenOrCard(query: string, signal?: AbortSignal): Promise<TokenSearchResult> {
  const trimmedQuery = query.trim();

  if (!trimmedQuery) {
    return { mode: "token", sourceCard: null, tokens: [] };
  }

  const exactCard = await fetchExactCard(trimmedQuery, signal);

  if (exactCard) {
    const sourceCard = normalizeScryfallCard(exactCard);

    if (!isTokenCard(sourceCard)) {
      const tokenParts = getTokenParts(sourceCard);

      if (tokenParts.length > 0) {
        const tokens = await fetchRelatedCards(tokenParts, signal);
        return { mode: "card", sourceCard, tokens };
      }
    }
  }

  const tokens = await searchTokens(trimmedQuery, signal);
  return { mode: "token", sourceCard: null, tokens };
}

export async function searchTokens(query: string, signal?: AbortSignal) {
  const cards = await fetchAllCardPages(buildTokenSearchUrl(query), signal);
  return dedupeTokenVariants(normalizeScryfallCards(cards));
}

export async function fetchTokenPrintings(token: CardSearchResult, signal?: AbortSignal) {
  if (!token.printsSearchUri) {
    return [];
  }

  const cards = await fetchAllCardPages(token.printsSearchUri, signal);
  return normalizeScryfallCards(cards);
}

export async function fetchTokenProducers(token: CardSearchResult, signal?: AbortSignal) {
  return fetchRelatedCards(getProducerParts(token), signal);
}

export async function fetchCardPrintings(card: CardSearchResult, signal?: AbortSignal) {
  if (!card.printsSearchUri) {
    return [];
  }

  const cards = await fetchAllCardPages(card.printsSearchUri, signal);
  return normalizeScryfallCards(cards);
}

export function buildTokenSearchUrl(query: string) {
  return `https://api.scryfall.com/cards/search?q=${encodeURIComponent(`${query.trim()} is:token game:paper`)}&unique=prints&order=name`;
}

function isTokenCard(card: CardSearchResult) {
  return card.layout === "token" || card.typeLine.toLowerCase().startsWith("token ");
}

function dedupeTokenVariants(tokens: CardSearchResult[]) {
  return Array.from(
    new Map(tokens.map((token) => [getTokenVariantKey(token), token])).values(),
  );
}

function getTokenVariantKey(token: CardSearchResult) {
  return [
    token.name,
    token.typeLine,
    token.oracleText ?? "",
    token.power ?? "",
    token.toughness ?? "",
    [...token.colors].sort().join(","),
  ].join("|");
}

async function fetchExactCard(query: string, signal?: AbortSignal) {
  const response = await fetch(
    `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(query)}`,
    {
      signal,
      headers: {
        Accept: "application/json",
      },
    },
  );

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new Error("Unable to search Scryfall.");
  }

  return (await response.json()) as ScryfallCard;
}

async function fetchRelatedCards(parts: ScryfallRelatedCard[], signal?: AbortSignal) {
  const uniqueParts = Array.from(new Map(parts.map((part) => [part.id, part])).values());
  const cards = await Promise.all(
    uniqueParts.map(async (part) => {
      const safeUri = getSafeScryfallApiUrl(part.uri);

      if (!safeUri) {
        return null;
      }

      const response = await fetch(safeUri, {
        signal,
        headers: {
          Accept: "application/json",
        },
      });

      if (!response.ok) {
        return null;
      }

      return normalizeScryfallCard((await response.json()) as ScryfallCard);
    }),
  );

  return cards.filter((card): card is CardSearchResult => Boolean(card));
}

async function fetchAllCardPages(url: string, signal?: AbortSignal) {
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

    if (!response.ok) {
      throw new Error("Unable to load Scryfall cards.");
    }

    const payload = (await response.json()) as ScryfallList<ScryfallCard>;
    cards.push(...(payload.data ?? []));
    nextUrl = payload.has_more ? payload.next_page : undefined;
  }

  return cards;
}
