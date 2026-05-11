import { getScryfallApiFetchUrl } from "@/lib/apiProxy";

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

  const response = await fetch(getScryfallApiFetchUrl(url.toString()), {
    signal,
    headers: {
      Accept: "application/json",
    },
  });

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
  artistNamesPromise ??= fetch(getScryfallApiFetchUrl("https://api.scryfall.com/catalog/artist-names"), {
    signal,
    headers: {
      Accept: "application/json",
    },
  })
    .then(async (response) => {
      if (!response.ok) {
        return [];
      }

      const payload = (await response.json()) as ScryfallCatalogResponse;
      return payload.data ?? [];
    })
    .catch((error) => {
      artistNamesPromise = null;

      if (error instanceof DOMException && error.name === "AbortError") {
        return [];
      }

      return [];
    });

  return artistNamesPromise;
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
