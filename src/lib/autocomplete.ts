import { scryfallFetch } from "@/lib/apiProxy";
import { CATALOG_CACHE_KEYS, getCachedValue, setCachedValue } from "@/lib/catalogCache";

type ScryfallCatalogResponse = {
  object: string;
  data?: string[];
  details?: string;
};

let artistNamesPromise: Promise<string[]> | null = null;

export async function fetchCardNameSuggestions(query: string, signal?: AbortSignal, options: { includeExtras?: boolean } = {}) {
  const trimmedQuery = query.trim();

  if (trimmedQuery.length < 2) {
    return [];
  }

  const url = new URL("https://api.scryfall.com/cards/autocomplete");
  url.searchParams.set("q", trimmedQuery);

  if (options.includeExtras) {
    url.searchParams.set("include_extras", "true");
  }

  const response = await scryfallFetch(url.toString(), { signal });

  if (!response.ok) {
    return [];
  }

  const payload = (await response.json()) as ScryfallCatalogResponse;
  return sortAutocompleteSuggestions(payload.data ?? [], trimmedQuery);
}

export async function fetchArtistNameSuggestions(query: string, signal?: AbortSignal) {
  const trimmedQuery = query.trim();

  if (trimmedQuery.length < 2) {
    return [];
  }

  const names = await fetchArtistNames(signal);
  return sortAutocompleteSuggestions(
    names.filter((name) => name.toLowerCase().includes(trimmedQuery.toLowerCase())),
    trimmedQuery,
  );
}

export function sortAutocompleteSuggestions(names: string[], query: string) {
  const normalizedQuery = query.trim().toLowerCase();

  return [...names]
    .sort((first, second) => {
      const firstRank = getAutocompleteRank(first, normalizedQuery);
      const secondRank = getAutocompleteRank(second, normalizedQuery);

      if (firstRank !== secondRank) {
        return firstRank - secondRank;
      }

      return first.localeCompare(second);
    })
    .slice(0, 12);
}

async function fetchArtistNames(signal?: AbortSignal) {
  const cachedNames = getCachedValue<string[]>(CATALOG_CACHE_KEYS.artistNames);

  if (cachedNames?.length) {
    return cachedNames;
  }

  artistNamesPromise ??= fetchArtistNamesFromNetwork()
    .then((names) => {
      if (names.length) {
        setCachedValue(CATALOG_CACHE_KEYS.artistNames, names);
      }

      return names;
    })
    .catch((error) => {
      artistNamesPromise = null;

      if (error instanceof DOMException && error.name === "AbortError") {
        return [];
      }

      return [];
    });

  if (signal?.aborted) {
    return [];
  }

  if (!signal) {
    return artistNamesPromise;
  }

  try {
    return await Promise.race([
      artistNamesPromise,
      new Promise<string[]>((_, reject) => {
        signal.addEventListener(
          "abort",
          () => reject(new DOMException("Aborted", "AbortError")),
          { once: true },
        );
      }),
    ]);
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      return [];
    }

    return [];
  }
}

async function fetchArtistNamesFromNetwork() {
  const response = await scryfallFetch("https://api.scryfall.com/catalog/artist-names");

  if (!response.ok) {
    return [];
  }

  const payload = (await response.json()) as ScryfallCatalogResponse;
  return payload.data ?? [];
}

function getAutocompleteRank(name: string, normalizedQuery: string) {
  const normalizedName = name.toLowerCase();

  if (normalizedName.startsWith(normalizedQuery)) {
    return 0;
  }

  if (normalizedName.includes(normalizedQuery)) {
    return 1;
  }

  return 2;
}
