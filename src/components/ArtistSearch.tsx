import { Search } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { AppNav } from "@/components/AppNav";
import { AdvancedCardFilterSections, CheckboxFilterGroup, FilteredResultsLayout } from "@/components/CardFilters";
import { CardTile } from "@/components/CardDisplay";
import { ManaLoading } from "@/components/ManaLoading";
import { SearchCombobox } from "@/components/SearchCombobox";
import { SearchHotkeyHint } from "@/components/SearchHotkeyHint";
import { VirtualizedCardGrid } from "@/components/VirtualizedCardGrid";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { useDebouncedAsync } from "@/hooks/useDebouncedAsync";
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
  streamArtistCards,
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
  const [loadingMore, setLoadingMore] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [message, setMessage] = useState("");
  const searchControllerRef = useRef<AbortController | null>(null);
  const cardsControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const artist = params.get("artist");

    if (artist) {
      setQuery(artist);
      void searchArtist(artist, { updateUrl: false });
    }
  }, []);

  const trimmedQuery = query.trim();
  const suggestionsEnabled = trimmedQuery.length >= 2 && state !== "loading";

  useEffect(() => {
    if (!suggestionsEnabled) {
      setSuggestions([]);
      setSuggestionsOpen(false);
    }
  }, [suggestionsEnabled]);

  useDebouncedAsync(
    suggestionsEnabled,
    [trimmedQuery],
    (signal) => fetchArtistNameSuggestions(trimmedQuery, signal),
    (sortedSuggestions) => {
      setSuggestions(sortedSuggestions);
      setSuggestionsOpen(sortedSuggestions.length > 0);
    },
    () => {
      setSuggestions([]);
      setSuggestionsOpen(false);
    },
  );

  async function searchArtist(nextQuery = query, options: { updateUrl?: boolean } = {}) {
    const trimmedQuery = nextQuery.trim();

    if (!trimmedQuery) {
      searchControllerRef.current?.abort();
      cardsControllerRef.current?.abort();
      setState("idle");
      setArtistName("");
      setCards([]);
      setActiveFrameFilters(["all"]);
      setActiveRarities([]);
      setActiveColors([]);
      setActivePrices([]);
      setCardsLoading(false);
      setLoadingMore(false);
      setSuggestions([]);
      setSuggestionsOpen(false);
      setMessage("");
      return;
    }

    const controller = new AbortController();
    searchControllerRef.current?.abort();
    cardsControllerRef.current?.abort();
    searchControllerRef.current = controller;
    setState("loading");
    setArtistName(trimmedQuery);
    setCards([]);
    setActiveFrameFilters(["all"]);
    setActiveRarities([]);
    setActiveColors([]);
    setActivePrices([]);
    setCardsLoading(false);
    setLoadingMore(false);
    setSuggestions([]);
    setSuggestionsOpen(false);
    setMessage("");

    if (options.updateUrl !== false) {
      const url = new URL(window.location.href);
      url.searchParams.set("artist", trimmedQuery);
      window.history.replaceState(null, "", url);
    }

    let latestCards: CardSearchResult[] = [];

    try {
      await streamArtistCards(
        trimmedQuery,
        "all",
        (update) => {
          if (searchControllerRef.current !== controller) {
            return;
          }

          latestCards = update.cards;
          setCards(update.cards);
          setLoadingMore(!update.done);

          if (update.cards.length) {
            setState("results");
            setMessage("");
          } else if (update.done) {
            setState("empty");
            setMessage(`No paper cards found for artist "${trimmedQuery}".`);
          }
        },
        controller.signal,
      );

      if (searchControllerRef.current !== controller) {
        return;
      }

      if (!latestCards.length) {
        setState("empty");
        setMessage(`No paper cards found for artist "${trimmedQuery}".`);
      }
    } catch (error) {
      if (searchControllerRef.current !== controller || (error instanceof DOMException && error.name === "AbortError")) {
        return;
      }

      setLoadingMore(false);
      if (!latestCards.length) {
        setState("error");
        setMessage(error instanceof Error ? error.message : "Unable to search artists.");
      }
    } finally {
      if (searchControllerRef.current === controller) {
        setLoadingMore(false);
        searchControllerRef.current = null;
      }
    }
  }

  async function updateFrameFilters(nextFilters: ArtistFrameFilter[]) {
    if (!artistName || areSameFilters(nextFilters, activeFrameFilters)) {
      return;
    }

    const controller = new AbortController();
    cardsControllerRef.current?.abort();
    cardsControllerRef.current = controller;
    setActiveFrameFilters(nextFilters);
    setCards([]);
    setCardsLoading(true);
    setLoadingMore(false);

    try {
      await streamArtistCards(
        artistName,
        nextFilters,
        (update) => {
          if (cardsControllerRef.current !== controller) {
            return;
          }

          setCards(update.cards);
          setCardsLoading(false);
          setLoadingMore(!update.done);
        },
        controller.signal,
      );
    } catch (error) {
      if (cardsControllerRef.current !== controller || (error instanceof DOMException && error.name === "AbortError")) {
        return;
      }

      setCards((currentCards) => (currentCards.length ? currentCards : []));
    } finally {
      if (cardsControllerRef.current === controller) {
        setCardsLoading(false);
        setLoadingMore(false);
        cardsControllerRef.current = null;
      }
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
            <SearchCombobox
              id="artist-search"
              label="Search by artist name"
              open={suggestionsOpen}
              options={suggestions}
              placeholder="Artist name"
              value={query}
              getOptionKey={(suggestion) => suggestion}
              getOptionLabel={(suggestion) => suggestion}
              onChange={setQuery}
              onOpenChange={setSuggestionsOpen}
              onSelect={(suggestion) => {
                setQuery(suggestion);
                void searchArtist(suggestion);
              }}
            />
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
            <ArtistStats
              artistName={artistName}
              cardCount={cards.length}
              isLoadingMore={loadingMore}
            />
            <ArtistCards
              activeColors={activeColors}
              activeFrameFilters={activeFrameFilters}
              activePrices={activePrices}
              activeRarities={activeRarities}
              cards={cards}
              isLoading={cardsLoading}
              isLoadingMore={loadingMore}
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

function ArtistStats({
  artistName,
  cardCount,
  isLoadingMore,
}: {
  artistName: string;
  cardCount: number;
  isLoadingMore: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle aria-label={artistName} className="text-2xl">
          {artistName}{" "}
          <span className="text-base font-medium text-muted-foreground">
            ({cardCount} cards{isLoadingMore ? " and counting…" : ""})
          </span>
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
  isLoadingMore,
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
  isLoadingMore: boolean;
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
        disabled={isLoading || isLoadingMore}
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
          <div className="space-y-4">
            <VirtualizedCardGrid
              estimateRowHeight={400}
              getKey={(card) => card.id}
              items={filteredCards}
              renderItem={(card) => <CardTile card={card} showManaCost showName showType />}
            />
            {isLoadingMore ? (
              <div aria-live="polite" className="rounded-lg border bg-card p-4 text-sm text-muted-foreground">
                Loading more cards…
              </div>
            ) : null}
          </div>
        ) : (
          <div className="rounded-lg border bg-card p-5 text-sm text-muted-foreground">
            {isLoadingMore ? "Loading cards…" : "No cards matched this filter."}
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
