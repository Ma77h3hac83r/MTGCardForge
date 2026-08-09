import { Search } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { AppNav } from "@/components/AppNav";
import { AdvancedCardFilterSections, CheckboxFilterGroup, FilteredResultsLayout } from "@/components/CardFilters";
import { CardDetail, CardTile } from "@/components/CardDisplay";
import { ManaLoading } from "@/components/ManaLoading";
import { SearchCombobox } from "@/components/SearchCombobox";
import { SearchHotkeyHint } from "@/components/SearchHotkeyHint";
import { VirtualizedCardGrid } from "@/components/VirtualizedCardGrid";
import { Button } from "@/components/ui/button";
import { useDebouncedAsync } from "@/hooks/useDebouncedAsync";
import { fetchCardNameSuggestions } from "@/lib/autocomplete";
import { scryfallFetch } from "@/lib/apiProxy";
import {
  filterCardsByAdvancedFilters,
  toggleFilterValue,
  type ColorFilter,
  type PriceFilter,
  type RarityFilter,
} from "@/lib/cardFilters";
import {
  type CardSearchResult,
  normalizeScryfallCard,
  normalizeScryfallCards,
  type ScryfallCard,
} from "@/lib/scryfall";

type SearchState = "idle" | "loading" | "results" | "empty" | "error" | "rate-limit";
type PrintingFilter = "all" | "default" | "full" | "extended" | "showcase" | "etched" | "halo" | "retro";
type SetTypeFilter = "all" | "standard" | "universes-beyond" | "secret-lair";

type ScryfallSearchResponse = {
  object: string;
  total_cards?: number;
  data?: ScryfallCard[];
  details?: string;
};

const PRINTING_FILTERS: Array<{ label: string; value: PrintingFilter; syntax: string | null }> = [
  { label: "All", value: "all", syntax: null },
  { label: "Standard", value: "default", syntax: "is:default" },
  { label: "Borderless", value: "full", syntax: "is:full" },
  { label: "Extended", value: "extended", syntax: "is:extended" },
  { label: "Showcase", value: "showcase", syntax: "is:showcase" },
  { label: "Etched", value: "etched", syntax: "is:etched" },
  { label: "Halo Foil", value: "halo", syntax: "is:halo" },
  { label: "Retro", value: "retro", syntax: "is:retro" },
];

const SET_TYPE_FILTERS: Array<{ label: string; value: SetTypeFilter; syntax: string | null }> = [
  { label: "All", value: "all", syntax: null },
  {
    label: "Standard MTG",
    value: "standard",
    syntax: "-is:universesbeyond -set:sld -set:pssc -set:slp -set:slc -set:slx -set:slu",
  },
  {
    label: "Universes Beyond",
    value: "universes-beyond",
    syntax: "is:universesbeyond -set:sld -set:pssc -set:slp -set:slc -set:slx -set:slu",
  },
  { label: "Secret Lair", value: "secret-lair", syntax: "(set:sld OR set:pssc OR set:slp OR set:slc OR set:slx OR set:slu)" },
];
const SET_TYPE_PANEL_FILTERS: Array<{ label: string; value: Exclude<SetTypeFilter, "all"> }> = [
  { label: "Standard MTG", value: "standard" },
  { label: "UB", value: "universes-beyond" },
  { label: "SL", value: "secret-lair" },
];

export function CardSearch() {
  const [query, setQuery] = useState("");
  const [state, setState] = useState<SearchState>("idle");
  const [card, setCard] = useState<CardSearchResult | null>(null);
  const [printings, setPrintings] = useState<CardSearchResult[]>([]);
  const [printingFilters, setPrintingFilters] = useState<PrintingFilter[]>(["all"]);
  const [setTypeFilter, setSetTypeFilter] = useState<SetTypeFilter>("all");
  const [activeRarities, setActiveRarities] = useState<RarityFilter[]>([]);
  const [activeColors, setActiveColors] = useState<ColorFilter[]>([]);
  const [activePrices, setActivePrices] = useState<PriceFilter[]>([]);
  const [printingsLoading, setPrintingsLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [message, setMessage] = useState("");
  const searchControllerRef = useRef<AbortController | null>(null);
  const printingsControllerRef = useRef<AbortController | null>(null);

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
    (signal) => fetchCardNameSuggestions(trimmedQuery, signal),
    (sortedSuggestions) => {
      setSuggestions(sortedSuggestions);
      setSuggestionsOpen(sortedSuggestions.length > 0);
    },
    () => {
      setSuggestions([]);
      setSuggestionsOpen(false);
    },
  );

  async function searchExactCard(cardName = query) {
    const trimmedQuery = cardName.trim();

    if (!trimmedQuery) {
      searchControllerRef.current?.abort();
      printingsControllerRef.current?.abort();
      setState("idle");
      setCard(null);
      setPrintings([]);
      setPrintingFilters(["all"]);
      setSetTypeFilter("all");
      setActiveRarities([]);
      setActiveColors([]);
      setActivePrices([]);
      setPrintingsLoading(false);
      setSuggestions([]);
      setSuggestionsOpen(false);
      setMessage("");
      return;
    }

    const controller = new AbortController();
    searchControllerRef.current?.abort();
    printingsControllerRef.current?.abort();
    searchControllerRef.current = controller;
    setState("loading");
    setCard(null);
    setPrintings([]);
    setPrintingFilters(["all"]);
    setSetTypeFilter("all");
    setActiveRarities([]);
    setActiveColors([]);
    setActivePrices([]);
    setPrintingsLoading(false);
    setSuggestions([]);
    setSuggestionsOpen(false);
    setMessage("");

    try {
      const response = await scryfallFetch(
        `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(trimmedQuery)}`,
        { signal: controller.signal },
      );

      const payload = (await response.json()) as ScryfallCard & { details?: string };

      if (response.status === 429) {
        setState("rate-limit");
        setMessage("Scryfall is rate limiting requests. Wait a moment and search again.");
        return;
      }

      if (response.status === 404) {
        setState("empty");
        setMessage(`No exact card name found for "${trimmedQuery}".`);
        return;
      }

      if (!response.ok || !payload.id) {
        throw new Error(payload.details ?? "Scryfall exact-name lookup failed.");
      }

      const normalizedCard = normalizeScryfallCard(payload);
      if (searchControllerRef.current !== controller) {
        return;
      }
      const normalizedPrintings = await fetchPrintings(normalizedCard, controller.signal, {
        frame: "all",
        setType: "all",
      });
      if (searchControllerRef.current !== controller) {
        return;
      }
      setCard(normalizedCard);
      setPrintings(normalizedPrintings);
      setState("results");
    } catch (error) {
      if (searchControllerRef.current !== controller || (error instanceof DOMException && error.name === "AbortError")) {
        return;
      }

      setState("error");
      setMessage(error instanceof Error ? error.message : "Unable to search Scryfall.");
    } finally {
      if (searchControllerRef.current === controller) {
        searchControllerRef.current = null;
      }
    }
  }

  async function updatePrintingFilters({
    nextFrame = printingFilters,
    nextSetType = setTypeFilter,
  }: {
    nextFrame?: PrintingFilter | PrintingFilter[];
    nextSetType?: SetTypeFilter;
  }) {
    const nextFrameFilters = Array.isArray(nextFrame) ? nextFrame : [nextFrame];

    if (!card || (areSameFilters(nextFrameFilters, printingFilters) && nextSetType === setTypeFilter)) {
      return;
    }

    const controller = new AbortController();
    printingsControllerRef.current?.abort();
    printingsControllerRef.current = controller;
    setPrintingFilters(nextFrameFilters);
    setSetTypeFilter(nextSetType);
    setPrintingsLoading(true);
    setPrintings([]);

    try {
      const normalizedPrintings = await fetchPrintings(card, controller.signal, {
        frame: nextFrame,
        setType: nextSetType,
      });
      if (printingsControllerRef.current !== controller) {
        return;
      }
      setPrintings(normalizedPrintings);
    } catch (error) {
      if (printingsControllerRef.current !== controller || (error instanceof DOMException && error.name === "AbortError")) {
        return;
      }

      setPrintings([]);
    } finally {
      if (printingsControllerRef.current === controller) {
        setPrintingsLoading(false);
        printingsControllerRef.current = null;
      }
    }
  }

  function togglePrintingFrameFilter(nextFilter: PrintingFilter) {
    const nextFilters = getNextFrameFilters(printingFilters, nextFilter);
    void updatePrintingFilters({ nextFrame: nextFilters });
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
              void searchExactCard();
            }}
            role="search"
          >
            <SearchCombobox
              id="card-search"
              label="Search by exact card name"
              open={suggestionsOpen}
              options={suggestions}
              placeholder="Exact card name"
              value={query}
              getOptionKey={(suggestion) => suggestion}
              getOptionLabel={(suggestion) => suggestion}
              onChange={setQuery}
              onOpenChange={setSuggestionsOpen}
              onSelect={(suggestion) => {
                setQuery(suggestion);
                void searchExactCard(suggestion);
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
          <SearchHotkeyHint targetId="card-search" />
        </div>
      </AppNav>

      <section className="mx-auto w-full max-w-7xl space-y-8 px-4 py-8 sm:px-6 lg:px-8">
        <StatusPanel message={message} state={state} />

        {state === "results" && card && (
          <>
            <CardDetail artistValue={<ArtistLink artist={card.artist} />} card={card} showLegalities showTcgplayer />
            <PrintingsGrid
              activeColors={activeColors}
              activeFrameFilters={printingFilters}
              activeSetTypeFilter={setTypeFilter}
              activePrices={activePrices}
              activePrintingId={card.id}
              activeRarities={activeRarities}
              isLoading={printingsLoading}
              onColorToggle={toggleColor}
              onFrameFilterChange={togglePrintingFrameFilter}
              onPriceToggle={togglePrice}
              onPrintingSelect={setCard}
              onRarityToggle={toggleRarity}
              onSetTypeFilterChange={(filter) =>
                void updatePrintingFilters({ nextSetType: filter })
              }
              printings={printings}
            />
          </>
        )}
      </section>
    </>
  );
}

async function fetchPrintings(
  card: CardSearchResult,
  signal: AbortSignal,
  filters: { frame: PrintingFilter | PrintingFilter[]; setType: SetTypeFilter },
) {
  if (!card.printsSearchUri) {
    return [];
  }

  const response = await scryfallFetch(getPrintingsSearchUri(card.printsSearchUri, filters), { signal });

  if (!response.ok) {
    return [];
  }

  const payload = (await response.json()) as ScryfallSearchResponse;

  if (!Array.isArray(payload.data)) {
    return [];
  }

  return normalizeScryfallCards(payload.data);
}

function getPrintingsSearchUri(
  printsSearchUri: string,
  filters: { frame: PrintingFilter | PrintingFilter[]; setType: SetTypeFilter },
) {
  const frameSyntax = buildFilterSyntax(filters.frame, PRINTING_FILTERS);
  const setTypeFilter = SET_TYPE_FILTERS.find((item) => item.value === filters.setType);
  const url = new URL(printsSearchUri);
  const currentQuery = url.searchParams.get("q");
  const queryParts = [currentQuery, "game:paper", frameSyntax, setTypeFilter?.syntax].filter(
    (part): part is string => Boolean(part),
  );
  url.searchParams.set("q", queryParts.join(" "));

  return url.toString();
}

function buildFilterSyntax<TValue extends string>(
  filters: TValue | TValue[],
  filterConfigs: Array<{ label: string; value: TValue; syntax: string | null }>,
) {
  const selectedFilters = Array.isArray(filters) ? filters : [filters];
  const syntaxes = selectedFilters
    .filter((filter) => filter !== "all")
    .map((filter) => filterConfigs.find((item) => item.value === filter)?.syntax)
    .filter((syntax): syntax is string => Boolean(syntax));

  if (!syntaxes.length) {
    return null;
  }

  return syntaxes.length === 1 ? syntaxes[0] : `(${syntaxes.join(" OR ")})`;
}

function StatusPanel({ state, message }: { state: SearchState; message: string }) {
  if (state === "idle") {
    return (
      <div className="rounded-lg border border-dashed bg-card p-6 text-sm text-muted-foreground">
        Search an exact Magic card name to view the current card and every printing.
      </div>
    );
  }

  if (state === "loading") {
    return (
      <div aria-live="polite" className="grid gap-6 lg:grid-cols-[360px_minmax(0,1fr)]">
        <div className="lg:col-span-2">
          <ManaLoading />
        </div>
        <div className="aspect-[5/7] animate-pulse rounded-lg border bg-card" />
        <div className="min-h-96 animate-pulse rounded-lg border bg-card" />
      </div>
    );
  }

  if (state === "empty" || state === "error" || state === "rate-limit") {
    return (
      <div
        className="rounded-lg border bg-card p-5 text-sm text-muted-foreground"
        role={state === "error" || state === "rate-limit" ? "alert" : "status"}
      >
        {message}
      </div>
    );
  }

  return null;
}

function PrintingsGrid({
  activeColors,
  activeFrameFilters,
  activePrintingId,
  activePrices,
  activeRarities,
  activeSetTypeFilter,
  isLoading,
  onColorToggle,
  onFrameFilterChange,
  onPriceToggle,
  onPrintingSelect,
  onRarityToggle,
  onSetTypeFilterChange,
  printings,
}: {
  activeColors: ColorFilter[];
  activeFrameFilters: PrintingFilter[];
  activePrintingId: string;
  activePrices: PriceFilter[];
  activeRarities: RarityFilter[];
  activeSetTypeFilter: SetTypeFilter;
  isLoading: boolean;
  onColorToggle: (color: ColorFilter) => void;
  onFrameFilterChange: (filter: PrintingFilter) => void;
  onPriceToggle: (price: PriceFilter) => void;
  onPrintingSelect: (printing: CardSearchResult) => void;
  onRarityToggle: (rarity: RarityFilter) => void;
  onSetTypeFilterChange: (filter: SetTypeFilter) => void;
  printings: CardSearchResult[];
}) {
  const filteredPrintings = filterCardsByAdvancedFilters(printings, {
    colors: activeColors,
    prices: activePrices,
    rarities: activeRarities,
  });
  const filterPanel = (
    <>
      <CheckboxFilterGroup
        disabled={isLoading}
        label="Set type"
        onToggle={(filter) => onSetTypeFilterChange(activeSetTypeFilter === filter ? "all" : filter)}
        options={SET_TYPE_PANEL_FILTERS}
        selectedValues={activeSetTypeFilter === "all" ? [] : [activeSetTypeFilter]}
      />
      <CheckboxFilterGroup
        disabled={isLoading}
        label="Frame"
        onToggle={onFrameFilterChange}
        options={PRINTING_FILTERS}
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

  if (!printings.length) {
    return (
      <section className="space-y-4">
        <FilteredResultsLayout filters={filterPanel}>
          {isLoading ? (
            <PrintingsSkeleton />
          ) : (
            <div className="rounded-lg border bg-card p-5 text-sm text-muted-foreground">
              No printings matched this filter.
            </div>
          )}
        </FilteredResultsLayout>
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <FilteredResultsLayout filters={filterPanel}>
        {isLoading && <PrintingsSkeleton />}
        {filteredPrintings.length ? (
          <VirtualizedCardGrid
            getKey={(printing) => printing.id}
            items={filteredPrintings}
            renderItem={(printing) => (
              <CardTile
                active={printing.id === activePrintingId}
                card={printing}
                onClick={() => {
                  onPrintingSelect(printing);
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }}
              />
            )}
          />
        ) : (
          <div className="rounded-lg border bg-card p-5 text-sm text-muted-foreground">
            No printings matched this filter.
          </div>
        )}
      </FilteredResultsLayout>
    </section>
  );
}

function ArtistLink({ artist }: { artist: string | null }) {
  if (!artist) {
    return <>Unknown</>;
  }

  return (
    <a
      className="font-medium text-foreground underline-offset-4 transition-colors hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      href={`/artists?artist=${encodeURIComponent(artist)}`}
    >
      {artist}
    </a>
  );
}

function getNextFrameFilters(activeFilters: PrintingFilter[], nextFilter: PrintingFilter) {
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

function PrintingsSkeleton() {
  return (
    <div aria-live="polite" className="space-y-4">
      <ManaLoading label="Loading printings" />
      <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {Array.from({ length: 5 }).map((_, index) => (
          <div className="aspect-[5/7] animate-pulse rounded-lg border bg-card" key={index} />
        ))}
      </div>
    </div>
  );
}
