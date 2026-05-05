import { getSafeScryfallApiUrl, normalizeScryfallCards, type CardSearchResult, type ScryfallCard } from "@/lib/scryfall";

export type SetSearchFilter =
  | "all"
  | "default"
  | "full"
  | "extended"
  | "showcase"
  | "etched"
  | "halo"
  | "retro"
  | "promo"
  | "token";

export type ScryfallSet = {
  id: string;
  code: string;
  name: string;
  set_type: string;
  card_count: number;
  parent_set_code?: string | null;
  released_at?: string | null;
  icon_svg_uri?: string;
  scryfall_uri?: string;
};

export type SetSearchResult = {
  rootSet: ScryfallSet;
  relatedSets: ScryfallSet[];
  cards: CardSearchResult[];
  query: string;
};

type ScryfallList<T> = {
  data?: T[];
  has_more?: boolean;
  next_page?: string;
};

export const SET_CARD_FILTERS: Array<{ label: string; value: SetSearchFilter; syntax: string | null }> = [
  { label: "All", value: "all", syntax: null },
  { label: "Standard", value: "default", syntax: "is:default" },
  { label: "Borderless", value: "full", syntax: "is:full" },
  { label: "Extended", value: "extended", syntax: "is:extended" },
  { label: "Showcase", value: "showcase", syntax: "is:showcase" },
  { label: "Etched", value: "etched", syntax: "is:etched" },
  { label: "Halo Foil", value: "halo", syntax: "is:halo" },
  { label: "Retro", value: "retro", syntax: "is:retro" },
  { label: "Promo", value: "promo", syntax: "is:promo" },
  { label: "Token", value: "token", syntax: "is:token" },
];

export async function fetchAllSets(signal?: AbortSignal) {
  const response = await fetch("https://api.scryfall.com/sets", {
    signal,
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error("Unable to load Scryfall sets.");
  }

  const payload = (await response.json()) as ScryfallList<ScryfallSet>;
  return payload.data ?? [];
}

export function resolveSetWithSubsets(sets: ScryfallSet[], query: string) {
  const normalizedQuery = query.trim().toLowerCase();

  if (!normalizedQuery) {
    return null;
  }

  const selectedSet = sets.find(
    (set) => set.code.toLowerCase() === normalizedQuery || set.name.toLowerCase() === normalizedQuery,
  );

  if (!selectedSet) {
    return null;
  }

  const rootCode = selectedSet.parent_set_code?.toLowerCase() ?? selectedSet.code.toLowerCase();
  const rootSet = sets.find((set) => set.code.toLowerCase() === rootCode) ?? selectedSet;
  const relatedSets = sets
    .filter((set) => {
      const code = set.code.toLowerCase();
      const parentCode = set.parent_set_code?.toLowerCase();
      const normalizedRootCode = rootSet.code.toLowerCase();
      const isRelatedSet = code === normalizedRootCode || parentCode === normalizedRootCode;
      const isArtSet = code === `a${normalizedRootCode}`;

      return isRelatedSet && !isArtSet;
    })
    .sort((first, second) => {
      const firstRank = getSubsetSortRank(first, rootSet);
      const secondRank = getSubsetSortRank(second, rootSet);

      if (firstRank !== secondRank) {
        return firstRank - secondRank;
      }

      return first.code.localeCompare(second.code);
    });

  return { rootSet, relatedSets };
}

export function sortSetSuggestions(sets: ScryfallSet[], query: string) {
  const normalizedQuery = query.trim().toLowerCase();

  if (normalizedQuery.length < 2) {
    return [];
  }

  return sets
    .filter((set) => {
      const code = set.code.toLowerCase();
      const name = set.name.toLowerCase();
      return code.includes(normalizedQuery) || name.includes(normalizedQuery);
    })
    .sort((first, second) => {
      const firstRank = getSetSuggestionRank(first, normalizedQuery);
      const secondRank = getSetSuggestionRank(second, normalizedQuery);

      if (firstRank !== secondRank) {
        return firstRank - secondRank;
      }

      return (second.released_at ?? "").localeCompare(first.released_at ?? "");
    })
    .slice(0, 12);
}

export async function fetchSetCards(
  relatedSets: ScryfallSet[],
  filters: SetSearchFilter | SetSearchFilter[],
  signal?: AbortSignal,
) {
  const query = buildSetCardsQuery(relatedSets, filters);
  const cards = await fetchAllCardPages(
    `https://api.scryfall.com/cards/search?q=${encodeURIComponent(query)}&unique=prints&order=set`,
    signal,
  );

  return { cards: sortCardsByRelatedSetOrder(normalizeScryfallCards(cards), relatedSets), query };
}

export function buildSetCardsQuery(relatedSets: ScryfallSet[], filters: SetSearchFilter | SetSearchFilter[]) {
  const setQuery = relatedSets.map((set) => `set:${set.code}`).join(" OR ");
  const filterSyntax = buildFilterSyntax(filters);

  return [`(${setQuery})`, "game:paper", "-is:minigame", filterSyntax]
    .filter(Boolean)
    .join(" ");
}

function buildFilterSyntax(filters: SetSearchFilter | SetSearchFilter[]) {
  const selectedFilters = Array.isArray(filters) ? filters : [filters];
  const syntaxes = selectedFilters
    .filter((filter) => filter !== "all")
    .map((filter) => SET_CARD_FILTERS.find((item) => item.value === filter)?.syntax)
    .filter((syntax): syntax is string => Boolean(syntax));

  if (!syntaxes.length) {
    return null;
  }

  return syntaxes.length === 1 ? syntaxes[0] : `(${syntaxes.join(" OR ")})`;
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

    if (!response.ok) {
      throw new Error("Unable to load cards for this set.");
    }

    const payload = (await response.json()) as ScryfallList<ScryfallCard>;
    cards.push(...(payload.data ?? []));
    nextUrl = payload.has_more ? payload.next_page : undefined;
  }

  return cards;
}

function getSetSuggestionRank(set: ScryfallSet, normalizedQuery: string) {
  const code = set.code.toLowerCase();
  const name = set.name.toLowerCase();

  if (code === normalizedQuery || name === normalizedQuery) {
    return 0;
  }

  if (code.startsWith(normalizedQuery) || name.startsWith(normalizedQuery)) {
    return 1;
  }

  return 2;
}

function getSubsetSortRank(set: ScryfallSet, rootSet: ScryfallSet) {
  const code = set.code.toLowerCase();
  const rootCode = rootSet.code.toLowerCase();
  const setType = set.set_type.toLowerCase();

  if (code === rootCode) {
    return 0;
  }

  if (setType === "commander" || code.endsWith("c")) {
    return 1;
  }

  if (code === `p${rootCode}` || code.startsWith("p")) {
    return 3;
  }

  if (code === `t${rootCode}` || code.startsWith("t")) {
    return 4;
  }

  if (["alchemy", "masterpiece", "memorabilia", "minigame", "arsenal", "box"].includes(setType)) {
    return 2;
  }

  return 5;
}

function sortCardsByRelatedSetOrder(cards: CardSearchResult[], relatedSets: ScryfallSet[]) {
  const setOrder = new Map(
    relatedSets.map((set, index) => [set.code.toUpperCase(), index]),
  );

  return [...cards].sort((first, second) => {
    const firstSetRank = setOrder.get(first.setCode) ?? Number.MAX_SAFE_INTEGER;
    const secondSetRank = setOrder.get(second.setCode) ?? Number.MAX_SAFE_INTEGER;

    if (firstSetRank !== secondSetRank) {
      return firstSetRank - secondSetRank;
    }

    return compareCollectorNumbers(first.collectorNumber, second.collectorNumber);
  });
}

function compareCollectorNumbers(first: string, second: string) {
  const firstNumber = Number.parseInt(first, 10);
  const secondNumber = Number.parseInt(second, 10);

  if (!Number.isNaN(firstNumber) && !Number.isNaN(secondNumber) && firstNumber !== secondNumber) {
    return firstNumber - secondNumber;
  }

  return first.localeCompare(second, undefined, { numeric: true });
}
