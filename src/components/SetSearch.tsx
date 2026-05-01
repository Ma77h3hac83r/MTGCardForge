import { Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { SetSymbol } from "@/components/CardSymbols";
import { CardTile } from "@/components/CardDisplay";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import logoUrl from "@/images/logo.png";
import { NAV_ITEMS } from "@/lib/navigation";
import {
  fetchAllSets,
  fetchSetCards,
  resolveSetWithSubsets,
  SET_CARD_FILTERS,
  sortSetSuggestions,
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
  const [activeFilter, setActiveFilter] = useState<SetSearchFilter>("all");
  const [cardsLoading, setCardsLoading] = useState(false);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const controller = new AbortController();

    fetchAllSets(controller.signal)
      .then(setSets)
      .catch(() => {
        setMessage("Unable to load Scryfall sets.");
      });

    return () => controller.abort();
  }, []);

  const suggestions = useMemo(() => sortSetSuggestions(sets, query), [sets, query]);

  async function searchSet(nextQuery = query) {
    const resolvedSet = resolveSetWithSubsets(sets, nextQuery);

    if (!resolvedSet) {
      setState(nextQuery.trim() ? "empty" : "idle");
      setRootSet(null);
      setRelatedSets([]);
      setCards([]);
      setActiveFilter("all");
      setMessage(nextQuery.trim() ? `No set found for "${nextQuery.trim()}".` : "");
      return;
    }

    const controller = new AbortController();
    setState("loading");
    setRootSet(resolvedSet.rootSet);
    setRelatedSets(resolvedSet.relatedSets);
    setCards([]);
    setActiveFilter("all");
    setSuggestionsOpen(false);
    setMessage("");

    try {
      const result = await fetchSetCards(resolvedSet.relatedSets, "all", controller.signal);
      setCards(result.cards);
      setState("results");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return;
      }

      setState("error");
      setMessage(error instanceof Error ? error.message : "Unable to load cards for this set.");
    }
  }

  async function updateFilter(nextFilter: SetSearchFilter) {
    if (!relatedSets.length || nextFilter === activeFilter) {
      return;
    }

    const controller = new AbortController();
    setActiveFilter(nextFilter);
    setCards([]);
    setCardsLoading(true);

    try {
      const result = await fetchSetCards(relatedSets, nextFilter, controller.signal);
      setCards(result.cards);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return;
      }

      setCards([]);
    } finally {
      setCardsLoading(false);
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
              void searchSet();
            }}
            role="search"
          >
            <label className="sr-only" htmlFor="set-search">
              Search by set code or set name
            </label>
            <Input
              id="set-search"
              aria-autocomplete="list"
              aria-controls="set-search-suggestions"
              aria-expanded={suggestionsOpen}
              autoComplete="off"
              className="pr-12"
              placeholder="Set code or name"
              role="combobox"
              value={query}
              onBlur={() => window.setTimeout(() => setSuggestionsOpen(false), 120)}
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
            {suggestionsOpen && suggestions.length > 0 && (
              <div
                className="absolute left-0 right-0 top-12 z-30 overflow-hidden rounded-lg border bg-card shadow-lg"
                id="set-search-suggestions"
                role="listbox"
              >
                {suggestions.map((set) => (
                  <button
                    className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
                    key={set.id}
                    onMouseDown={(event) => {
                      event.preventDefault();
                      setQuery(set.code.toUpperCase());
                      void searchSet(set.code);
                    }}
                    role="option"
                    type="button"
                  >
                    <span className="min-w-0 truncate">{set.name}</span>
                    <span className="shrink-0 text-xs font-medium text-muted-foreground">
                      {set.code.toUpperCase()}
                    </span>
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

      <section
        className="mx-auto w-full max-w-7xl space-y-8 px-4 py-8 sm:px-6 lg:px-8"
        id="sets-page-top"
      >
        <SetStatus message={message} state={state} />

        {state === "results" && rootSet && (
          <>
            <SetStats cards={cards} relatedSets={relatedSets} rootSet={rootSet} />
            <SetCards
              activeFilter={activeFilter}
              cards={cards}
              isLoading={cardsLoading}
              onFilterChange={(filter) => void updateFilter(filter)}
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

function SetStats({
  cards,
  relatedSets,
  rootSet,
}: {
  cards: CardSearchResult[];
  relatedSets: ScryfallSet[];
  rootSet: ScryfallSet;
}) {
  const releasedAt = rootSet.released_at ? new Date(`${rootSet.released_at}T00:00:00`).toLocaleDateString() : "Unknown";
  const totalScryfallCards = relatedSets.reduce((total, set) => total + set.card_count, 0);

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <CardTitle className="text-2xl">{rootSet.name}</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              {rootSet.code.toUpperCase()} · {rootSet.set_type.replace(/_/g, " ")}
            </p>
          </div>
          <SetSymbol className="text-3xl" code={rootSet.code} rarity="rare" />
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Paper cards shown" value={cards.length.toString()} />
          <Stat label="Related sets" value={relatedSets.map((set) => set.code.toUpperCase()).join(", ")} />
          <Stat label="Scryfall cards" value={totalScryfallCards.toString()} />
          <Stat label="Release date" value={releasedAt} />
        </div>
      </CardContent>
    </Card>
  );
}

function SetCards({
  activeFilter,
  cards,
  isLoading,
  onFilterChange,
  relatedSets,
}: {
  activeFilter: SetSearchFilter;
  cards: CardSearchResult[];
  isLoading: boolean;
  onFilterChange: (filter: SetSearchFilter) => void;
  relatedSets: ScryfallSet[];
}) {
  const cardGroups = groupCardsBySet(cards, relatedSets);

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-xl font-semibold tracking-normal">Cards</h2>
          <p className="text-sm text-muted-foreground">
            {isLoading ? "Loading cards" : `${cards.length} ${cards.length === 1 ? "card" : "cards"}`}
          </p>
          {cardGroups.length > 1 && <SetTableOfContents groups={cardGroups} />}
        </div>
        <div className="inline-flex flex-wrap rounded-lg border bg-card p-1" role="group" aria-label="Set card filters">
          {SET_CARD_FILTERS.map((filter) => (
            <Button
              aria-pressed={activeFilter === filter.value}
              className="h-8 px-3"
              disabled={isLoading}
              key={filter.value}
              onClick={() => onFilterChange(filter.value)}
              type="button"
              variant={activeFilter === filter.value ? "default" : "ghost"}
            >
              {filter.label}
            </Button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {Array.from({ length: 10 }).map((_, index) => (
            <div className="aspect-[5/7] animate-pulse rounded-lg border bg-card" key={index} />
          ))}
        </div>
      ) : cards.length ? (
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
              <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                {group.cards.map((card) => (
                  <CardTile card={card} key={card.id} />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-lg border bg-card p-5 text-sm text-muted-foreground">
          No cards matched this filter.
        </div>
      )}
    </section>
  );
}

function SetTableOfContents({ groups }: { groups: Array<{ set: ScryfallSet; cards: CardSearchResult[] }> }) {
  return (
    <nav className="flex flex-wrap items-center gap-1 text-sm" aria-label="Set sections">
      <span className="mr-1 text-muted-foreground">Jump:</span>
      {groups.map((group) => (
        <a
          className="rounded-sm border bg-card px-2 py-1 text-xs font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          href={`#${getSetSectionId(group.set.code)}`}
          key={group.set.code}
        >
          {group.set.code.toUpperCase()}
        </a>
      ))}
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

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-background/50 p-3">
      <dt className="text-xs font-medium uppercase tracking-normal text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-sm font-semibold">{value}</dd>
    </div>
  );
}
