import { getSafeScryfallApiUrl, normalizeScryfallCard, type CardSearchResult, type ScryfallCard } from "@/lib/scryfall";

type ScryfallList<T> = {
  data?: T[];
  has_more?: boolean;
  next_page?: string;
};

type ScryfallCollectionResponse = {
  data?: ScryfallCard[];
  not_found?: unknown[];
};

export type DeckInputCard = {
  name: string;
  quantity: number;
};

export type DeckResolvedCard = DeckInputCard & {
  card: CardSearchResult | null;
};

export type DeckGroupKey =
  | "planeswalker"
  | "creature"
  | "artifact"
  | "enchantment"
  | "instant"
  | "sorcery"
  | "other"
  | "lands"
  | "basic-land";

export const DECK_GROUPS: Array<{ key: DeckGroupKey; label: string }> = [
  { key: "planeswalker", label: "Planeswalker" },
  { key: "creature", label: "Creature" },
  { key: "artifact", label: "Artifact" },
  { key: "enchantment", label: "Enchantment" },
  { key: "instant", label: "Instant" },
  { key: "sorcery", label: "Sorcery" },
  { key: "other", label: "Other" },
  { key: "lands", label: "Lands" },
  { key: "basic-land", label: "Basic Land" },
];

export async function parseDeckInput(input: string, signal?: AbortSignal) {
  const trimmedInput = input.trim();

  if (!trimmedInput) {
    return [];
  }

  if (isDeckUrl(trimmedInput)) {
    return fetchDeckUrlCards(trimmedInput, signal);
  }

  return parseDeckList(trimmedInput);
}

export function parseDeckList(input: string) {
  const cards = input
    .split(/\r?\n/)
    .map(parseDeckLine)
    .filter((card): card is DeckInputCard => Boolean(card));

  return mergeCardQuantities(cards);
}

export async function resolveDeckCards(cards: DeckInputCard[], signal?: AbortSignal) {
  const cardNames = cards.map((card) => card.name);
  const cheapestPrintings = await fetchCheapestPrintings(cardNames, signal);
  const missingNames = cards
    .filter((card) => !cheapestPrintings.has(getCardNameKey(card.name)))
    .map((card) => card.name);
  const alternateNamePrintings = missingNames.length
    ? await fetchAlternateNamePrintings(missingNames, signal)
    : new Map<string, CardSearchResult>();
  const fallbackNames = missingNames.filter((name) => !alternateNamePrintings.has(getCardNameKey(name)));
  const fallbackCards = fallbackNames.length
    ? await fetchExactFallbackCards(fallbackNames, signal)
    : new Map<string, CardSearchResult>();
  const fuzzyNames = fallbackNames.filter((name) => !fallbackCards.has(getCardNameKey(name)));
  const fuzzyCards = fuzzyNames.length
    ? await fetchFuzzyFallbackCards(fuzzyNames, signal)
    : new Map<string, CardSearchResult>();

  return cards.map((card) => ({
    ...card,
    card:
      cheapestPrintings.get(getCardNameKey(card.name)) ??
      alternateNamePrintings.get(getCardNameKey(card.name)) ??
      fallbackCards.get(getCardNameKey(card.name)) ??
      fuzzyCards.get(getCardNameKey(card.name)) ??
      null,
  }));
}

export async function fetchCheapestPrinting(cardName: string, signal?: AbortSignal) {
  const response = await fetch(buildCheapestPrintingUrl(cardName), {
    signal,
    headers: {
      Accept: "application/json",
    },
  });

  if (response.ok) {
    const payload = (await response.json()) as ScryfallList<ScryfallCard>;
    const cheapestCard = payload.data?.[0];

    if (cheapestCard) {
      return normalizeScryfallCard(cheapestCard);
    }
  }

  return fetchExactFallback(cardName, signal);
}

export async function fetchCheapestPrintings(cardNames: string[], signal?: AbortSignal) {
  const printings = new Map<string, CardSearchResult>();
  const uniqueNames = Array.from(new Set(cardNames.map((name) => name.trim()).filter(Boolean)));

  for (const [index, chunk] of chunkArray(uniqueNames, 20).entries()) {
    if (index > 0) {
      await waitForScryfall(signal);
    }

    const cards = await fetchAllSearchPages(buildCheapestPrintingsUrl(chunk), signal);

    for (const card of cards) {
      const normalizedCard = normalizeScryfallCard(card);
      const key = getCardNameKey(normalizedCard.name);

      if (!printings.has(key)) {
        printings.set(key, normalizedCard);
      }
    }
  }

  return printings;
}

export function buildCheapestPrintingUrl(cardName: string) {
  return buildCheapestPrintingsUrl([cardName]);
}

export function buildCheapestPrintingsUrl(cardNames: string[]) {
  const url = new URL("https://api.scryfall.com/cards/search");
  const exactNameQuery = cardNames.map((cardName) => `!${quoteScryfallValue(cardName)}`).join(" or ");
  url.searchParams.set("q", `(${exactNameQuery}) game:paper usd>=0`);
  url.searchParams.set("unique", "prints");
  url.searchParams.set("order", "usd");
  url.searchParams.set("dir", "asc");

  return url.toString();
}

export function buildAlternateNameSearchUrl(cardName: string) {
  const url = new URL("https://api.scryfall.com/cards/search");
  url.searchParams.set("q", `${quoteScryfallValue(cardName)} game:paper usd>=0`);
  url.searchParams.set("unique", "prints");
  url.searchParams.set("order", "usd");
  url.searchParams.set("dir", "asc");

  return url.toString();
}

export function groupDeckCards(cards: DeckResolvedCard[]) {
  return DECK_GROUPS.map((group) => ({
    ...group,
    cards: cards.filter((deckCard) => getDeckGroup(deckCard.card) === group.key),
  })).filter((group) => group.cards.length > 0);
}

export function getDeckGroup(card: CardSearchResult | null): DeckGroupKey {
  const typeLine = card?.typeLine.toLowerCase() ?? "";

  if (/\bbasic\b/.test(typeLine) && /\bland\b/.test(typeLine)) {
    return "basic-land";
  }

  if (/\bland\b/.test(typeLine)) {
    return "lands";
  }

  if (/\bplaneswalker\b/.test(typeLine)) {
    return "planeswalker";
  }

  if (/\bcreature\b/.test(typeLine)) {
    return "creature";
  }

  if (/\bartifact\b/.test(typeLine)) {
    return "artifact";
  }

  if (/\benchantment\b/.test(typeLine)) {
    return "enchantment";
  }

  if (/\binstant\b/.test(typeLine)) {
    return "instant";
  }

  if (/\bsorcery\b/.test(typeLine)) {
    return "sorcery";
  }

  return "other";
}

function parseDeckLine(line: string) {
  const normalizedLine = line
    .replace(/^SB:\s*/i, "")
    .replace(/\s+#.*$/, "")
    .trim();

  if (!normalizedLine || isDeckHeading(normalizedLine)) {
    return null;
  }

  const match = normalizedLine.match(/^(\d+)\s*x?\s+(.+)$/i);

  if (!match) {
    return null;
  }

  const quantity = Number.parseInt(match[1], 10);
  const name = cleanCardName(match[2]);

  if (!quantity || !name) {
    return null;
  }

  return { name, quantity };
}

function cleanCardName(name: string) {
  return name
    .replace(/[★☆]/g, "")
    .replace(/(?:\s+\*\w+\*)+$/i, "")
    .replace(/\s+\{[^}]+\}\s*$/i, "")
    .replace(/\s+\[[^\]]+\]\s*$/, "")
    .replace(/\s+\([A-Z0-9]{2,8}\)\s+[\w-]+$/i, "")
    .replace(/\s+\([A-Z0-9]{2,8}\)$/i, "")
    .trim();
}

function isDeckHeading(line: string) {
  return /^(commander|companion|deck|mainboard|sideboard|maybeboard|planeswalker|creature|artifact|enchantment|instant|sorcery|land|lands|basic land|basic lands|other)$/i.test(
    line,
  );
}

function mergeCardQuantities(cards: DeckInputCard[]) {
  const mergedCards = new Map<string, DeckInputCard>();

  for (const card of cards) {
    const key = getCardNameKey(card.name);
    const existingCard = mergedCards.get(key);

    if (existingCard) {
      existingCard.quantity += card.quantity;
    } else {
      mergedCards.set(key, { ...card });
    }
  }

  return Array.from(mergedCards.values());
}

function isDeckUrl(input: string) {
  try {
    const url = new URL(input);
    const isWebUrl = url.protocol === "https:";
    return isWebUrl && (/(^|\.)moxfield\.com$/i.test(url.hostname) || /(^|\.)archidekt\.com$/i.test(url.hostname));
  } catch {
    return false;
  }
}

async function fetchDeckUrlCards(input: string, signal?: AbortSignal) {
  const url = new URL(input);

  if (/(^|\.)moxfield\.com$/i.test(url.hostname)) {
    return fetchMoxfieldCards(url, signal);
  }

  if (/(^|\.)archidekt\.com$/i.test(url.hostname)) {
    return fetchArchidektCards(url, signal);
  }

  return [];
}

async function fetchMoxfieldCards(url: URL, signal?: AbortSignal) {
  const deckId = url.pathname.match(/\/decks\/([^/?#]+)/i)?.[1];

  if (!deckId || !/^[A-Za-z0-9_-]+$/.test(deckId)) {
    return [];
  }

  const response = await fetch(`https://api.moxfield.com/v2/decks/all/${encodeURIComponent(deckId)}`, {
    signal,
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error("Unable to load this Moxfield deck.");
  }

  const payload = (await response.json()) as {
    mainboard?: Record<string, MoxfieldDeckEntry>;
    commanders?: Record<string, MoxfieldDeckEntry>;
    companions?: Record<string, MoxfieldDeckEntry>;
  };

  return mergeCardQuantities([
    ...getMoxfieldBoardCards(payload.commanders),
    ...getMoxfieldBoardCards(payload.mainboard),
    ...getMoxfieldBoardCards(payload.companions),
  ]);
}

async function fetchArchidektCards(url: URL, signal?: AbortSignal) {
  const deckId = url.pathname.match(/\/decks\/(\d+)/i)?.[1];

  if (!deckId) {
    return [];
  }

  const response = await fetch(`https://archidekt.com/api/decks/${deckId}/`, {
    signal,
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error("Unable to load this Archidekt deck.");
  }

  const payload = (await response.json()) as {
    cards?: ArchidektDeckEntry[];
  };

  return mergeCardQuantities(
    (payload.cards ?? [])
      .map((entry) => ({
        name: getArchidektCardName(entry),
        quantity: entry.quantity ?? 1,
      }))
      .filter((card): card is DeckInputCard => Boolean(card.name)),
  );
}

type MoxfieldDeckEntry = {
  quantity?: number;
  card?: {
    name?: string;
  };
};

function getMoxfieldBoardCards(board: Record<string, MoxfieldDeckEntry> | undefined) {
  return Object.values(board ?? {})
    .map((entry) => ({
      name: entry.card?.name ?? "",
      quantity: entry.quantity ?? 1,
    }))
    .filter((card): card is DeckInputCard => Boolean(card.name));
}

type ArchidektDeckEntry = {
  quantity?: number;
  card?: {
    oracleCard?: {
      name?: string;
    };
    name?: string;
  };
};

function getArchidektCardName(entry: ArchidektDeckEntry) {
  return entry.card?.oracleCard?.name ?? entry.card?.name ?? "";
}

async function fetchExactFallback(cardName: string, signal?: AbortSignal) {
  const card = await fetchNamedCard(cardName, "exact", signal);
  return card ? normalizeScryfallCard(card) : null;
}

async function fetchNamedCard(cardName: string, mode: "exact" | "fuzzy", signal?: AbortSignal) {
  const response = await fetch(`https://api.scryfall.com/cards/named?${mode}=${encodeURIComponent(cardName)}`, {
    signal,
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    return null;
  }

  return (await response.json()) as ScryfallCard;
}

async function fetchExactFallbackCards(cardNames: string[], signal?: AbortSignal) {
  const cards = new Map<string, CardSearchResult>();
  const uniqueNames = Array.from(new Set(cardNames.map((name) => name.trim()).filter(Boolean)));

  for (const [index, chunk] of chunkArray(uniqueNames, 75).entries()) {
    if (index > 0) {
      await waitForScryfall(signal);
    }

    const response = await fetch("https://api.scryfall.com/cards/collection", {
      method: "POST",
      signal,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        identifiers: chunk.map((name) => ({ name })),
      }),
    });

    if (!response.ok) {
      continue;
    }

    const payload = (await response.json()) as ScryfallCollectionResponse;

    for (const card of payload.data ?? []) {
      const normalizedCard = normalizeScryfallCard(card);
      cards.set(getCardNameKey(normalizedCard.name), normalizedCard);
    }
  }

  return cards;
}

async function fetchFuzzyFallbackCards(cardNames: string[], signal?: AbortSignal) {
  const cards = new Map<string, CardSearchResult>();
  const uniqueNames = Array.from(new Set(cardNames.map((name) => name.trim()).filter(Boolean)));

  for (const [index, cardName] of uniqueNames.entries()) {
    if (index > 0) {
      await waitForScryfall(signal);
    }

    const fuzzyCard = await fetchNamedCard(cardName, "fuzzy", signal);

    if (fuzzyCard) {
      const normalizedCard = normalizeScryfallCard(fuzzyCard);
      cards.set(getCardNameKey(cardName), normalizedCard);
      cards.set(getCardNameKey(normalizedCard.name), normalizedCard);
    }
  }

  return cards;
}

async function fetchAlternateNamePrintings(cardNames: string[], signal?: AbortSignal) {
  const printings = new Map<string, CardSearchResult>();

  for (const [index, cardName] of cardNames.entries()) {
    if (index > 0) {
      await waitForScryfall(signal);
    }

    const cards = await fetchAllSearchPages(buildAlternateNameSearchUrl(cardName), signal);
    const alternatePrinting = cards[0];

    if (alternatePrinting) {
      printings.set(getCardNameKey(cardName), normalizeScryfallCard(alternatePrinting));
    }
  }

  return printings;
}

async function fetchAllSearchPages(url: string, signal?: AbortSignal) {
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
      return cards;
    }

    if (response.status === 429) {
      throw new Error("Scryfall is rate limiting requests. Wait a moment and load the deck again.");
    }

    if (!response.ok) {
      return cards;
    }

    const payload = (await response.json()) as ScryfallList<ScryfallCard>;
    cards.push(...(payload.data ?? []));
    nextUrl = payload.has_more ? payload.next_page : undefined;
  }

  return cards;
}

function chunkArray<T>(items: T[], chunkSize: number) {
  const chunks: T[][] = [];

  for (let index = 0; index < items.length; index += chunkSize) {
    chunks.push(items.slice(index, index + chunkSize));
  }

  return chunks;
}

function getCardNameKey(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function quoteScryfallValue(value: string) {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function waitForScryfall(signal?: AbortSignal) {
  if (signal?.aborted) {
    return Promise.reject(new DOMException("Aborted", "AbortError"));
  }

  return new Promise<void>((resolve, reject) => {
    const timeout = globalThis.setTimeout(resolve, 100);

    signal?.addEventListener(
      "abort",
      () => {
        globalThis.clearTimeout(timeout);
        reject(new DOMException("Aborted", "AbortError"));
      },
      { once: true },
    );
  });
}
