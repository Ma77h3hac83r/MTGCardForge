import { scryfallFetch } from "@/lib/apiProxy";
import { getSafeScryfallApiUrl, type ScryfallCard } from "@/lib/scryfall";

type ScryfallListResponse = {
  data?: ScryfallCard[];
  has_more?: boolean;
  next_page?: string;
  total_cards?: number;
};

export type ScryfallCardPage = {
  cards: ScryfallCard[];
  nextPage: string | null;
  totalCards: number | null;
};

const DEFAULT_PAGE_GAP_MS = 100;

export async function fetchScryfallCardPage(
  url: string,
  signal?: AbortSignal,
  options: {
    emptyOn404?: boolean;
    errorMessage?: string;
    rateLimitMessage?: string;
  } = {},
): Promise<ScryfallCardPage> {
  const safeUrl = getSafeScryfallApiUrl(url);

  if (!safeUrl) {
    throw new Error("Scryfall returned an unexpected pagination URL.");
  }

  const response = await scryfallFetch(safeUrl, { signal });

  if (options.emptyOn404 && response.status === 404) {
    return { cards: [], nextPage: null, totalCards: 0 };
  }

  if (response.status === 429) {
    throw new Error(options.rateLimitMessage ?? "Scryfall is rate limiting requests. Wait a moment and try again.");
  }

  if (!response.ok) {
    throw new Error(options.errorMessage ?? "Unable to load cards from Scryfall.");
  }

  const payload = (await response.json()) as ScryfallListResponse;

  return {
    cards: payload.data ?? [],
    nextPage: payload.has_more ? (payload.next_page ?? null) : null,
    totalCards: typeof payload.total_cards === "number" ? payload.total_cards : null,
  };
}

export async function fetchAllScryfallCardPages(
  url: string,
  signal?: AbortSignal,
  options: {
    emptyOn404?: boolean;
    errorMessage?: string;
    rateLimitMessage?: string;
    pageGapMs?: number;
  } = {},
) {
  const cards: ScryfallCard[] = [];
  let nextUrl: string | null = url;
  let isFirstPage = true;

  while (nextUrl) {
    if (!isFirstPage) {
      await waitForScryfall(signal, options.pageGapMs);
    }

    const page = await fetchScryfallCardPage(nextUrl, signal, options);
    cards.push(...page.cards);
    nextUrl = page.nextPage;
    isFirstPage = false;
  }

  return cards;
}

export async function waitForScryfall(signal?: AbortSignal, delayMs = DEFAULT_PAGE_GAP_MS) {
  if (signal?.aborted) {
    return Promise.reject(new DOMException("Aborted", "AbortError"));
  }

  return new Promise<void>((resolve, reject) => {
    const timeout = globalThis.setTimeout(resolve, delayMs);

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
