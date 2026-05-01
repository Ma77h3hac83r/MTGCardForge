import { Search } from "lucide-react";
import { useEffect, useState } from "react";
import { CardDetail, CardTile } from "@/components/CardDisplay";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import logoUrl from "@/images/logo.png";
import { NAV_ITEMS } from "@/lib/navigation";
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

type ScryfallAutocompleteResponse = {
  object: string;
  data?: string[];
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

export function CardSearch() {
  const [query, setQuery] = useState("");
  const [state, setState] = useState<SearchState>("idle");
  const [card, setCard] = useState<CardSearchResult | null>(null);
  const [printings, setPrintings] = useState<CardSearchResult[]>([]);
  const [printingFilter, setPrintingFilter] = useState<PrintingFilter>("all");
  const [setTypeFilter, setSetTypeFilter] = useState<SetTypeFilter>("all");
  const [printingsLoading, setPrintingsLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [message, setMessage] = useState("");

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
        const response = await fetch(
          `https://api.scryfall.com/cards/autocomplete?q=${encodeURIComponent(trimmedQuery)}`,
          {
            signal: controller.signal,
            headers: {
              Accept: "application/json",
            },
          },
        );

        if (!response.ok) {
          setSuggestions([]);
          setSuggestionsOpen(false);
          return;
        }

        const payload = (await response.json()) as ScryfallAutocompleteResponse;
        const sortedSuggestions = sortAutocompleteSuggestions(payload.data ?? [], trimmedQuery);
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

  async function searchExactCard(cardName = query) {
    const trimmedQuery = cardName.trim();

    if (!trimmedQuery) {
      setState("idle");
      setCard(null);
      setPrintings([]);
      setPrintingFilter("all");
      setSetTypeFilter("all");
      setPrintingsLoading(false);
      setSuggestions([]);
      setSuggestionsOpen(false);
      setMessage("");
      return;
    }

    const controller = new AbortController();
    setState("loading");
    setCard(null);
    setPrintings([]);
    setPrintingFilter("all");
    setSetTypeFilter("all");
    setPrintingsLoading(false);
    setSuggestions([]);
    setSuggestionsOpen(false);
    setMessage("");

    try {
      const response = await fetch(
        `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(trimmedQuery)}`,
        {
          signal: controller.signal,
          headers: {
            Accept: "application/json",
          },
        },
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
      const normalizedPrintings = await fetchPrintings(normalizedCard, controller.signal, {
        frame: "all",
        setType: "all",
      });
      setCard(normalizedCard);
      setPrintings(normalizedPrintings);
      setState("results");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return;
      }

      setState("error");
      setMessage(error instanceof Error ? error.message : "Unable to search Scryfall.");
    }
  }

  async function updatePrintingFilters({
    nextFrame = printingFilter,
    nextSetType = setTypeFilter,
  }: {
    nextFrame?: PrintingFilter;
    nextSetType?: SetTypeFilter;
  }) {
    if (!card || (nextFrame === printingFilter && nextSetType === setTypeFilter)) {
      return;
    }

    const controller = new AbortController();
    setPrintingFilter(nextFrame);
    setSetTypeFilter(nextSetType);
    setPrintingsLoading(true);
    setPrintings([]);

    try {
      const normalizedPrintings = await fetchPrintings(card, controller.signal, {
        frame: nextFrame,
        setType: nextSetType,
      });
      setPrintings(normalizedPrintings);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return;
      }

      setPrintings([]);
    } finally {
      setPrintingsLoading(false);
    }
  }

  return (
    <>
      <nav className="sticky top-0 z-20 border-b bg-card/95 backdrop-blur">
        <div className="relative mx-auto flex min-h-16 max-w-7xl items-center justify-center px-4 py-3 sm:px-6 lg:px-8">
          <a
            className="absolute left-4 flex items-center gap-2 sm:left-6 lg:left-8"
            href="/"
            aria-label="MTG Card Forge"
          >
            <img alt="" className="h-10 w-auto" src={logoUrl.src ?? logoUrl} />
          </a>
          <div className="absolute right-4 hidden items-center gap-0.5 text-sm font-medium lg:flex xl:gap-1">
            {NAV_ITEMS.map((item) => (
              <a
                className="rounded-md px-2 py-2 text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring xl:px-3"
                href={item.href}
                key={item.href}
              >
                {item.label}
              </a>
            ))}
          </div>
          <form
            className="relative w-full max-w-xs"
            onSubmit={(event) => {
              event.preventDefault();
              void searchExactCard();
            }}
            role="search"
          >
            <label className="sr-only" htmlFor="card-search">
              Search by exact card name
            </label>
            <Input
              id="card-search"
              aria-autocomplete="list"
              aria-controls="card-search-suggestions"
              aria-expanded={suggestionsOpen}
              autoComplete="off"
              placeholder="Exact card name"
              role="combobox"
              value={query}
              className="pr-12"
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
                id="card-search-suggestions"
                role="listbox"
              >
                {suggestions.map((suggestion) => (
                  <button
                    className="block w-full px-3 py-2 text-left text-sm transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
                    key={suggestion}
                    onMouseDown={(event) => {
                      event.preventDefault();
                      setQuery(suggestion);
                      void searchExactCard(suggestion);
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
        </div>
      </nav>

      <section className="mx-auto w-full max-w-7xl space-y-8 px-4 py-8 sm:px-6 lg:px-8">
        <StatusPanel message={message} state={state} />

        {state === "results" && card && (
          <>
            <CardDetail artistValue={<ArtistLink artist={card.artist} />} card={card} showLegalities showTcgplayer />
            <PrintingsGrid
              activeFrameFilter={printingFilter}
              activeSetTypeFilter={setTypeFilter}
              activePrintingId={card.id}
              isLoading={printingsLoading}
              onFrameFilterChange={(filter) => void updatePrintingFilters({ nextFrame: filter })}
              onPrintingSelect={setCard}
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
  filters: { frame: PrintingFilter; setType: SetTypeFilter },
) {
  if (!card.printsSearchUri) {
    return [];
  }

  const response = await fetch(getPrintingsSearchUri(card.printsSearchUri, filters), {
    signal,
    headers: {
      Accept: "application/json",
    },
  });

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
  filters: { frame: PrintingFilter; setType: SetTypeFilter },
) {
  const frameFilter = PRINTING_FILTERS.find((item) => item.value === filters.frame);
  const setTypeFilter = SET_TYPE_FILTERS.find((item) => item.value === filters.setType);
  const url = new URL(printsSearchUri);
  const currentQuery = url.searchParams.get("q");
  const queryParts = [currentQuery, "game:paper", frameFilter?.syntax, setTypeFilter?.syntax].filter(
    (part): part is string => Boolean(part),
  );
  url.searchParams.set("q", queryParts.join(" "));

  return url.toString();
}

function sortAutocompleteSuggestions(names: string[], query: string) {
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
  activeFrameFilter,
  activePrintingId,
  activeSetTypeFilter,
  isLoading,
  onFrameFilterChange,
  onPrintingSelect,
  onSetTypeFilterChange,
  printings,
}: {
  activeFrameFilter: PrintingFilter;
  activePrintingId: string;
  activeSetTypeFilter: SetTypeFilter;
  isLoading: boolean;
  onFrameFilterChange: (filter: PrintingFilter) => void;
  onPrintingSelect: (printing: CardSearchResult) => void;
  onSetTypeFilterChange: (filter: SetTypeFilter) => void;
  printings: CardSearchResult[];
}) {
  if (!printings.length) {
    return (
      <section className="space-y-4">
        <PrintingsHeader
          activeFrameFilter={activeFrameFilter}
          activeSetTypeFilter={activeSetTypeFilter}
          count={0}
          isLoading={isLoading}
          onFrameFilterChange={onFrameFilterChange}
          onSetTypeFilterChange={onSetTypeFilterChange}
        />
        {isLoading ? (
          <PrintingsSkeleton />
        ) : (
          <div className="rounded-lg border bg-card p-5 text-sm text-muted-foreground">
            No printings matched this filter.
          </div>
        )}
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <PrintingsHeader
        activeFrameFilter={activeFrameFilter}
        activeSetTypeFilter={activeSetTypeFilter}
        count={printings.length}
        isLoading={isLoading}
        onFrameFilterChange={onFrameFilterChange}
        onSetTypeFilterChange={onSetTypeFilterChange}
      />
      {isLoading && <PrintingsSkeleton />}
      <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {printings.map((printing) => (
          <CardTile
            active={printing.id === activePrintingId}
            card={printing}
            key={printing.id}
            onClick={() => {
                onPrintingSelect(printing);
                window.scrollTo({ top: 0, behavior: "smooth" });
              }}
          />
        ))}
      </div>
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


function PrintingsHeader({
  activeFrameFilter,
  activeSetTypeFilter,
  count,
  isLoading,
  onFrameFilterChange,
  onSetTypeFilterChange,
}: {
  activeFrameFilter: PrintingFilter;
  activeSetTypeFilter: SetTypeFilter;
  count: number;
  isLoading: boolean;
  onFrameFilterChange: (filter: PrintingFilter) => void;
  onSetTypeFilterChange: (filter: SetTypeFilter) => void;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h2 className="text-xl font-semibold tracking-normal">Printings</h2>
        <p className="text-sm text-muted-foreground">
          {isLoading ? "Loading printings" : `${count} ${count === 1 ? "printing" : "printings"}`}
        </p>
      </div>
      <div className="flex flex-wrap justify-end gap-2">
        <SegmentedFilter
          activeValue={activeFrameFilter}
          ariaLabel="Frame filters"
          disabled={isLoading}
          filters={PRINTING_FILTERS}
          onChange={onFrameFilterChange}
        />
        <SegmentedFilter
          activeValue={activeSetTypeFilter}
          ariaLabel="Set type filters"
          disabled={isLoading}
          filters={SET_TYPE_FILTERS}
          onChange={onSetTypeFilterChange}
        />
      </div>
    </div>
  );
}

function SegmentedFilter<TValue extends string>({
  activeValue,
  ariaLabel,
  disabled,
  filters,
  onChange,
}: {
  activeValue: TValue;
  ariaLabel: string;
  disabled: boolean;
  filters: Array<{ label: string; value: TValue; syntax: string | null }>;
  onChange: (filter: TValue) => void;
}) {
  return (
    <div className="inline-flex rounded-lg border bg-card p-1" role="group" aria-label={ariaLabel}>
      {filters.map((filter) => (
        <Button
          aria-pressed={activeValue === filter.value}
          className="h-8 px-3"
          disabled={disabled}
          key={filter.value}
          onClick={() => onChange(filter.value)}
          type="button"
          variant={activeValue === filter.value ? "default" : "ghost"}
        >
          {filter.label}
        </Button>
      ))}
    </div>
  );
}

function PrintingsSkeleton() {
  return (
    <div aria-live="polite" className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      {Array.from({ length: 5 }).map((_, index) => (
        <div className="aspect-[5/7] animate-pulse rounded-lg border bg-card" key={index} />
      ))}
    </div>
  );
}
