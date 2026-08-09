import { Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { AppNav } from "@/components/AppNav";
import { AdvancedCardFilterSections, CheckboxFilterGroup, FilteredResultsLayout } from "@/components/CardFilters";
import { SetSymbol } from "@/components/CardSymbols";
import { CardTile } from "@/components/CardDisplay";
import { ManaLoading } from "@/components/ManaLoading";
import { SearchCombobox } from "@/components/SearchCombobox";
import { SearchHotkeyHint } from "@/components/SearchHotkeyHint";
import { VirtualizedCardGrid } from "@/components/VirtualizedCardGrid";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import {
  filterCardsByAdvancedFilters,
  toggleFilterValue,
  type ColorFilter,
  type PriceFilter,
  type RarityFilter,
} from "@/lib/cardFilters";
import {
  fetchAllSets,
  formatSetSuggestion,
  resolveSetWithSubsets,
  SET_CARD_FILTERS,
  sortSetSuggestions,
  streamSetCards,
  type SetSearchFilter,
  type ScryfallSet,
} from "@/lib/setSearch";
import type { CardSearchResult } from "@/lib/scryfall";

type SearchState = "idle" | "loading" | "results" | "empty" | "error";

export function SetSearch() {
  const [sets, setSets] = useState<ScryfallSet[]>([]);
  const [query, setQuery] = useState("");
  const [state, setState] = useState<SearchState>("idle");
  const [rootSet, setRootSet] = useState<ScryfallSet | null>(null);
  const [relatedSets, setRelatedSets] = useState<ScryfallSet[]>([]);
  const [cards, setCards] = useState<CardSearchResult[]>([]);
  const [activeFilters, setActiveFilters] = useState<SetSearchFilter[]>(["all"]);
  const [activeRarities, setActiveRarities] = useState<RarityFilter[]>([]);
  const [activeColors, setActiveColors] = useState<ColorFilter[]>([]);
  const [activePrices, setActivePrices] = useState<PriceFilter[]>([]);
  const [cardsLoading, setCardsLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [message, setMessage] = useState("");
  const searchControllerRef = useRef<AbortController | null>(null);
  const cardsControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    fetchAllSets(controller.signal)
      .then((loadedSets) => {
        setSets(loadedSets);

        const setParam = new URLSearchParams(window.location.search).get("set");

        if (setParam) {
          setQuery(setParam);
          void searchSet(setParam, loadedSets);
        }
      })
      .catch(() => {
        setMessage("Unable to load Scryfall sets.");
      });

    return () => controller.abort();
  }, []);

  const suggestions = useMemo(() => sortSetSuggestions(sets, query), [sets, query]);

  async function searchSet(nextQuery = query, availableSets = sets) {
    const resolvedSet = resolveSetWithSubsets(availableSets, nextQuery);

    if (!resolvedSet) {
      searchControllerRef.current?.abort();
      cardsControllerRef.current?.abort();
      setState(nextQuery.trim() ? "empty" : "idle");
      setRootSet(null);
      setRelatedSets([]);
      setCards([]);
      setActiveFilters(["all"]);
      setActiveRarities([]);
      setActiveColors([]);
      setActivePrices([]);
      setLoadingMore(false);
      setMessage(nextQuery.trim() ? `No set found for "${nextQuery.trim()}".` : "");
      return;
    }

    const controller = new AbortController();
    searchControllerRef.current?.abort();
    cardsControllerRef.current?.abort();
    searchControllerRef.current = controller;
    setState("loading");
    setRootSet(resolvedSet.rootSet);
    setRelatedSets(resolvedSet.relatedSets);
    setCards([]);
    setActiveFilters(["all"]);
    setActiveRarities([]);
    setActiveColors([]);
    setActivePrices([]);
    setCardsLoading(false);
    setLoadingMore(false);
    setSuggestionsOpen(false);
    setMessage("");

    let latestCards: CardSearchResult[] = [];

    try {
      await streamSetCards(
        resolvedSet.relatedSets,
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
          } else if (update.done) {
            setState("empty");
            setMessage(`No paper cards found for set "${resolvedSet.rootSet.name}".`);
          }
        },
        controller.signal,
      );

      if (searchControllerRef.current !== controller) {
        return;
      }

      if (!latestCards.length) {
        setState("empty");
        setMessage(`No paper cards found for set "${resolvedSet.rootSet.name}".`);
      }
    } catch (error) {
      if (searchControllerRef.current !== controller || (error instanceof DOMException && error.name === "AbortError")) {
        return;
      }

      // Keep any cards already rendered from earlier pages.
      setLoadingMore(false);
      if (!latestCards.length) {
        setState("error");
        setMessage(error instanceof Error ? error.message : "Unable to load cards for this set.");
      }
    } finally {
      if (searchControllerRef.current === controller) {
        setLoadingMore(false);
        searchControllerRef.current = null;
      }
    }
  }

  async function updateFilters(nextFilters: SetSearchFilter[]) {
    if (!relatedSets.length || areSameFilters(nextFilters, activeFilters)) {
      return;
    }

    const controller = new AbortController();
    cardsControllerRef.current?.abort();
    cardsControllerRef.current = controller;
    setActiveFilters(nextFilters);
    setCards([]);
    setCardsLoading(true);
    setLoadingMore(false);

    try {
      await streamSetCards(
        relatedSets,
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

  function toggleFrameFilter(nextFilter: SetSearchFilter) {
    const nextFilters = getNextFrameFilters(activeFilters, nextFilter);
    void updateFilters(nextFilters);
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
              void searchSet();
            }}
            role="search"
          >
            <SearchCombobox
              id="set-search"
              label="Search by set code or set name"
              open={suggestionsOpen}
              options={suggestions}
              placeholder="Set code or name"
              value={query}
              getOptionKey={(set) => set.id}
              getOptionLabel={(set) => formatSetSuggestion(set)}
              onChange={(nextValue) => {
                setQuery(nextValue);
                setSuggestionsOpen(true);
              }}
              onOpenChange={setSuggestionsOpen}
              onSelect={(set) => {
                const suggestion = formatSetSuggestion(set);
                setQuery(suggestion);
                void searchSet(suggestion);
              }}
              renderOption={(set) => (
                <span className="flex w-full items-center justify-between gap-3">
                  <span className="min-w-0 truncate">{set.name}</span>
                  <span className="shrink-0 text-xs font-medium text-muted-foreground">
                    {set.code.toUpperCase()}
                  </span>
                </span>
              )}
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
          <SearchHotkeyHint targetId="set-search" />
        </div>
      </AppNav>

      <section
        className="mx-auto w-full max-w-7xl space-y-8 px-4 py-8 sm:px-6 lg:px-8"
        id="sets-page-top"
      >
        <SetStatus message={message} state={state} />

        {state === "results" && rootSet && (
          <>
            <SetStats rootSet={rootSet} />
            <SetCards
              activeColors={activeColors}
              activeFilters={activeFilters}
              activePrices={activePrices}
              activeRarities={activeRarities}
              cards={cards}
              isLoading={cardsLoading}
              isLoadingMore={loadingMore}
              onColorToggle={toggleColor}
              onFilterToggle={toggleFrameFilter}
              onPriceToggle={togglePrice}
              onRarityToggle={toggleRarity}
              relatedSets={relatedSets}
            />
          </>
        )}
      </section>
    </>
  );
}

function SetStatus({ state, message }: { state: SearchState; message: string }) {
  if (state === "idle") {
    return (
      <div className="rounded-lg border border-dashed bg-card p-6 text-sm text-muted-foreground">
        Search a set code or set name to view its paper cards and related subsets.
      </div>
    );
  }

  if (state === "loading") {
    return (
      <div aria-live="polite" className="grid gap-6">
        <ManaLoading />
        <div className="h-40 animate-pulse rounded-lg border bg-card" />
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

function SetStats({ rootSet }: { rootSet: ScryfallSet }) {
  const releasedAt = rootSet.released_at ? new Date(`${rootSet.released_at}T00:00:00`).toLocaleDateString() : "Unknown";

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="min-w-0">
            <CardTitle className="text-2xl">{rootSet.name}</CardTitle>
          </div>
          <div className="flex items-center gap-3 text-sm font-medium text-muted-foreground">
            <span>{releasedAt}</span>
            <span>{rootSet.code.toUpperCase()}</span>
            <SetSymbol className="text-3xl" code={rootSet.code} rarity="rare" />
          </div>
        </div>
      </CardHeader>
    </Card>
  );
}

function SetCards({
  activeColors,
  activeFilters,
  activePrices,
  activeRarities,
  cards,
  isLoading,
  isLoadingMore,
  onColorToggle,
  onFilterToggle,
  onPriceToggle,
  onRarityToggle,
  relatedSets,
}: {
  activeColors: ColorFilter[];
  activeFilters: SetSearchFilter[];
  activePrices: PriceFilter[];
  activeRarities: RarityFilter[];
  cards: CardSearchResult[];
  isLoading: boolean;
  isLoadingMore: boolean;
  onColorToggle: (color: ColorFilter) => void;
  onFilterToggle: (filter: SetSearchFilter) => void;
  onPriceToggle: (price: PriceFilter) => void;
  onRarityToggle: (rarity: RarityFilter) => void;
  relatedSets: ScryfallSet[];
}) {
  const filteredCards = filterCardsByAdvancedFilters(cards, {
    colors: activeColors,
    prices: activePrices,
    rarities: activeRarities,
  });
  const cardGroups = groupCardsBySet(filteredCards, relatedSets);
  const filterPanel = (
    <>
      {cardGroups.length > 1 && <SetTableOfContents groups={cardGroups} />}
      <CheckboxFilterGroup
        disabled={isLoading || isLoadingMore}
        label="Frame"
        onToggle={onFilterToggle}
        options={SET_CARD_FILTERS}
        selectedValues={activeFilters}
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
          <div className="space-y-8">
            {cardGroups.map((group) => (
              <div className="scroll-mt-24 space-y-4" id={getSetSectionId(group.set.code)} key={group.set.code}>
                <div className="flex items-center gap-3">
                  <div className="h-px flex-1 bg-border" />
                  <div className="flex items-center gap-3 rounded-md border bg-card px-3 py-1 text-sm font-medium">
                    <SetSymbol className="text-lg" code={group.set.code} rarity="rare" />
                    <span>
                      {group.set.name} ({group.set.code.toUpperCase()})
                    </span>
                    <button
                      className="rounded-sm px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      onClick={() => document.getElementById("sets-page-top")?.scrollIntoView({ behavior: "smooth" })}
                      type="button"
                    >
                      Back to top
                    </button>
                  </div>
                  <div className="h-px flex-1 bg-border" />
                </div>
                <VirtualizedCardGrid
                  getKey={(card) => card.id}
                  items={group.cards}
                  renderItem={(card) => <CardTile card={card} />}
                />
              </div>
            ))}
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

function SetTableOfContents({ groups }: { groups: Array<{ set: ScryfallSet; cards: CardSearchResult[] }> }) {
  return (
    <nav className="rounded-md border bg-background/50 p-3 text-sm" aria-label="Set sections">
      <p className="pb-2 font-medium">Jump</p>
      <div className="flex flex-wrap gap-1">
        {groups.map((group) => (
          <a
            className="rounded-sm border bg-card px-2 py-1 text-xs font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            href={`#${getSetSectionId(group.set.code)}`}
            key={group.set.code}
          >
            {group.set.code.toUpperCase()}
          </a>
        ))}
      </div>
    </nav>
  );
}

function groupCardsBySet(cards: CardSearchResult[], relatedSets: ScryfallSet[]) {
  const setsByCode = new Map(relatedSets.map((set) => [set.code.toUpperCase(), set]));

  return relatedSets
    .map((set) => ({
      set,
      cards: cards.filter((card) => card.setCode === set.code.toUpperCase()),
    }))
    .filter((group) => group.cards.length > 0)
    .concat(
      cards
        .filter((card) => !setsByCode.has(card.setCode))
        .reduce<Array<{ set: ScryfallSet; cards: CardSearchResult[] }>>((groups, card) => {
          const existingGroup = groups.find((group) => group.set.code.toUpperCase() === card.setCode);
          if (existingGroup) {
            existingGroup.cards.push(card);
            return groups;
          }

          groups.push({
            set: {
              id: card.setCode,
              code: card.setCode.toLowerCase(),
              name: card.setName,
              set_type: "unknown",
              card_count: 0,
            },
            cards: [card],
          });
          return groups;
        }, []),
    );
}

function getSetSectionId(code: string) {
  return `set-section-${code.toLowerCase()}`;
}

function getNextFrameFilters(activeFilters: SetSearchFilter[], nextFilter: SetSearchFilter) {
  if (nextFilter === "all") {
    return ["all"];
  }

  const filtersWithoutAll = activeFilters.filter((filter) => filter !== "all");
  const nextFilters = filtersWithoutAll.includes(nextFilter)
    ? filtersWithoutAll.filter((filter) => filter !== nextFilter)
    : [...filtersWithoutAll, nextFilter];

  return nextFilters.length ? nextFilters : ["all"];
}

function areSameFilters(first: SetSearchFilter[], second: SetSearchFilter[]) {
  return first.length === second.length && first.every((filter) => second.includes(filter));
}
