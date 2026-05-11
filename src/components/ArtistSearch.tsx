import { Search } from "lucide-react";
import { useEffect, useState } from "react";
import { AppNav } from "@/components/AppNav";
import { AdvancedCardFilterSections, CheckboxFilterGroup, FilteredResultsLayout } from "@/components/CardFilters";
import { CardTile } from "@/components/CardDisplay";
import { ManaLoading } from "@/components/ManaLoading";
import { SearchHotkeyHint } from "@/components/SearchHotkeyHint";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { fetchArtistNameSuggestions } from "@/lib/autocomplete";
import {
  filterCardsByAdvancedFilters,
  toggleFilterValue,
  type ColorFilter,
  type PriceFilter,
  type RarityFilter,
} from "@/lib/cardFilters";
import {
  ARTIST_FRAME_FILTERS,
  fetchArtistCards,
  type ArtistFrameFilter,
} from "@/lib/artistSearch";
import type { CardSearchResult } from "@/lib/scryfall";

type SearchState = "idle" | "loading" | "results" | "empty" | "error";

export function ArtistSearch() {
  const [query, setQuery] = useState("");
  const [artistName, setArtistName] = useState("");
  const [state, setState] = useState<SearchState>("idle");
  const [cards, setCards] = useState<CardSearchResult[]>([]);
  const [activeFrameFilters, setActiveFrameFilters] = useState<ArtistFrameFilter[]>(["all"]);
  const [activeRarities, setActiveRarities] = useState<RarityFilter[]>([]);
  const [activeColors, setActiveColors] = useState<ColorFilter[]>([]);
  const [activePrices, setActivePrices] = useState<PriceFilter[]>([]);
  const [cardsLoading, setCardsLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const artist = params.get("artist");

    if (artist) {
      setQuery(artist);
      void searchArtist(artist, { updateUrl: false });
    }
  }, []);

  useEffect(() => {
    const trimmedQuery = query.trim();

    if (trimmedQuery.length < 2 || state === "loading") {
      setSuggestions([]);
      setSuggestionsOpen(false);
      return;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      try {
        const sortedSuggestions = await fetchArtistNameSuggestions(trimmedQuery, controller.signal);
        setSuggestions(sortedSuggestions);
        setSuggestionsOpen(sortedSuggestions.length > 0);
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }

        setSuggestions([]);
        setSuggestionsOpen(false);
      }
    }, 250);

    return () => {
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [query, state]);

  async function searchArtist(nextQuery = query, options: { updateUrl?: boolean } = {}) {
    const trimmedQuery = nextQuery.trim();

    if (!trimmedQuery) {
      setState("idle");
      setArtistName("");
      setCards([]);
      setActiveFrameFilters(["all"]);
      setActiveRarities([]);
      setActiveColors([]);
      setActivePrices([]);
      setCardsLoading(false);
      setSuggestions([]);
      setSuggestionsOpen(false);
      setMessage("");
      return;
    }

    const controller = new AbortController();
    setState("loading");
    setArtistName(trimmedQuery);
    setCards([]);
    setActiveFrameFilters(["all"]);
    setActiveRarities([]);
    setActiveColors([]);
    setActivePrices([]);
    setCardsLoading(false);
    setSuggestions([]);
    setSuggestionsOpen(false);
    setMessage("");

    if (options.updateUrl !== false) {
      const url = new URL(window.location.href);
      url.searchParams.set("artist", trimmedQuery);
      window.history.replaceState(null, "", url);
    }

    try {
      const artistCards = await fetchArtistCards(trimmedQuery, controller.signal, "all");
      setCards(artistCards);
      setState(artistCards.length ? "results" : "empty");
      setMessage(artistCards.length ? "" : `No paper cards found for artist "${trimmedQuery}".`);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return;
      }

      setState("error");
      setMessage(error instanceof Error ? error.message : "Unable to search artists.");
    }
  }

  async function updateFrameFilters(nextFilters: ArtistFrameFilter[]) {
    if (!artistName || areSameFilters(nextFilters, activeFrameFilters)) {
      return;
    }

    const controller = new AbortController();
    setActiveFrameFilters(nextFilters);
    setCards([]);
    setCardsLoading(true);

    try {
      const artistCards = await fetchArtistCards(artistName, controller.signal, nextFilters);
      setCards(artistCards);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return;
      }

      setCards([]);
    } finally {
      setCardsLoading(false);
    }
  }

  function toggleFrameFilter(nextFilter: ArtistFrameFilter) {
    const nextFilters = getNextFrameFilters(activeFrameFilters, nextFilter);
    void updateFrameFilters(nextFilters);
  }

  function toggleRarity(nextRarity: RarityFilter) {
    setActiveRarities((currentRarities) => toggleFilterValue(currentRarities, nextRarity));
  }

  function toggleColor(nextColor: ColorFilter) {
    setActiveColors((currentColors) => toggleFilterValue(currentColors, nextColor));
  }

  function togglePrice(nextPrice: PriceFilter) {
    setActivePrices((currentPrices) => toggleFilterValue(currentPrices, nextPrice));
  }

  return (
    <>
      <AppNav>
        <div className="flex w-full max-w-sm items-center justify-center gap-2">
          <form
            className="relative w-full max-w-xs"
            onSubmit={(event) => {
              event.preventDefault();
              void searchArtist();
            }}
            role="search"
          >
            <label className="sr-only" htmlFor="artist-search">
              Search by artist name
            </label>
            <Input
              id="artist-search"
              aria-autocomplete="list"
              aria-controls="artist-search-suggestions"
              aria-expanded={suggestionsOpen}
              autoComplete="off"
              className="pr-12"
              placeholder="Artist name"
              role="combobox"
              value={query}
              onBlur={() => {
                window.setTimeout(() => setSuggestionsOpen(false), 120);
              }}
              onChange={(event) => {
                setQuery(event.target.value);
                setSuggestionsOpen(true);
              }}
              onFocus={() => {
                if (suggestions.length) {
                  setSuggestionsOpen(true);
                }
              }}
            />
            {suggestionsOpen && (
              <div
                className="absolute left-0 right-0 top-12 z-30 overflow-hidden rounded-lg border bg-card shadow-lg"
                id="artist-search-suggestions"
                role="listbox"
              >
                {suggestions.map((suggestion) => (
                  <button
                    className="block w-full px-3 py-2 text-left text-sm transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
                    key={suggestion}
                    onMouseDown={(event) => {
                      event.preventDefault();
                      setQuery(suggestion);
                      void searchArtist(suggestion);
                    }}
                    role="option"
                    type="button"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            )}
            <Button
              aria-label="Search"
              className="absolute right-1 top-1/2 h-9 w-9 -translate-y-1/2"
              size="icon"
              type="submit"
              variant="ghost"
            >
              <Search aria-hidden="true" className="h-4 w-4" />
            </Button>
          </form>
          <SearchHotkeyHint targetId="artist-search" />
        </div>
      </AppNav>

      <section className="mx-auto w-full max-w-7xl space-y-8 px-4 py-8 sm:px-6 lg:px-8">
        <ArtistStatus message={message} state={state} />

        {state === "results" && (
          <>
            <ArtistStats artistName={artistName} cardCount={cards.length} />
            <ArtistCards
              activeColors={activeColors}
              activeFrameFilters={activeFrameFilters}
              activePrices={activePrices}
              activeRarities={activeRarities}
              cards={cards}
              isLoading={cardsLoading}
              onColorToggle={toggleColor}
              onFrameToggle={toggleFrameFilter}
              onPriceToggle={togglePrice}
              onRarityToggle={toggleRarity}
            />
          </>
        )}
      </section>
    </>
  );
}

function ArtistStatus({ state, message }: { state: SearchState; message: string }) {
  if (state === "idle") {
    return (
      <div className="rounded-lg border border-dashed bg-card p-6 text-sm text-muted-foreground">
        Search an artist name to view their paper Magic card artwork.
      </div>
    );
  }

  if (state === "loading") {
    return (
      <div aria-live="polite" className="grid gap-6">
        <ManaLoading />
        <div className="h-32 animate-pulse rounded-lg border bg-card" />
        <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {Array.from({ length: 10 }).map((_, index) => (
            <div className="aspect-[5/7] animate-pulse rounded-lg border bg-card" key={index} />
          ))}
        </div>
      </div>
    );
  }

  if (state === "empty" || state === "error") {
    return (
      <div className="rounded-lg border bg-card p-5 text-sm text-muted-foreground" role="status">
        {message}
      </div>
    );
  }

  return null;
}

function ArtistStats({ artistName, cardCount }: { artistName: string; cardCount: number }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle aria-label={artistName} className="text-2xl">
          {artistName} <span className="text-base font-medium text-muted-foreground">({cardCount} cards)</span>
        </CardTitle>
      </CardHeader>
    </Card>
  );
}

function ArtistCards({
  activeColors,
  activeFrameFilters,
  activePrices,
  activeRarities,
  cards,
  isLoading,
  onColorToggle,
  onFrameToggle,
  onPriceToggle,
  onRarityToggle,
}: {
  activeColors: ColorFilter[];
  activeFrameFilters: ArtistFrameFilter[];
  activePrices: PriceFilter[];
  activeRarities: RarityFilter[];
  cards: CardSearchResult[];
  isLoading: boolean;
  onColorToggle: (color: ColorFilter) => void;
  onFrameToggle: (filter: ArtistFrameFilter) => void;
  onPriceToggle: (price: PriceFilter) => void;
  onRarityToggle: (rarity: RarityFilter) => void;
}) {
  const filteredCards = filterCardsByAdvancedFilters(cards, {
    colors: activeColors,
    prices: activePrices,
    rarities: activeRarities,
  });
  const filterPanel = (
    <>
      <CheckboxFilterGroup
        disabled={isLoading}
        label="Frame"
        onToggle={onFrameToggle}
        options={ARTIST_FRAME_FILTERS}
        selectedValues={activeFrameFilters}
      />
      <AdvancedCardFilterSections
        activeFilters={{
          colors: activeColors,
          prices: activePrices,
          rarities: activeRarities,
        }}
        disabled={isLoading}
        onColorToggle={onColorToggle}
        onPriceToggle={onPriceToggle}
        onRarityToggle={onRarityToggle}
      />
    </>
  );

  return (
    <section className="space-y-4">
      <FilteredResultsLayout filters={filterPanel}>
        {isLoading ? (
          <div className="space-y-4">
            <ManaLoading />
            <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {Array.from({ length: 10 }).map((_, index) => (
                <div className="aspect-[5/7] animate-pulse rounded-lg border bg-card" key={index} />
              ))}
            </div>
          </div>
        ) : filteredCards.length ? (
          <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {filteredCards.map((card) => (
              <CardTile card={card} key={card.id} showManaCost showName showType />
            ))}
          </div>
        ) : (
          <div className="rounded-lg border bg-card p-5 text-sm text-muted-foreground">
            No cards matched this filter.
          </div>
        )}
      </FilteredResultsLayout>
    </section>
  );
}

function getNextFrameFilters(activeFilters: ArtistFrameFilter[], nextFilter: ArtistFrameFilter) {
  if (nextFilter === "all") {
    return ["all"];
  }

  const filtersWithoutAll = activeFilters.filter((filter) => filter !== "all");
  const nextFilters = filtersWithoutAll.includes(nextFilter)
    ? filtersWithoutAll.filter((filter) => filter !== nextFilter)
    : [...filtersWithoutAll, nextFilter];

  return nextFilters.length ? nextFilters : ["all"];
}

function areSameFilters<TValue extends string>(first: TValue[], second: TValue[]) {
  return first.length === second.length && first.every((filter) => second.includes(filter));
}
