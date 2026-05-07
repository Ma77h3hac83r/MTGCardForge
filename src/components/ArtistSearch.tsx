import { Search } from "lucide-react";
import { useEffect, useState } from "react";
import { AppNav } from "@/components/AppNav";
import { ManaSymbols } from "@/components/CardSymbols";
import { CardTile } from "@/components/CardDisplay";
import { ManaLoading } from "@/components/ManaLoading";
import { SearchHotkeyHint } from "@/components/SearchHotkeyHint";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { fetchArtistNameSuggestions } from "@/lib/autocomplete";
import {
  ARTIST_FRAME_FILTERS,
  fetchArtistCards,
  getArtistStats,
  type ArtistFrameFilter,
} from "@/lib/artistSearch";
import type { CardSearchResult } from "@/lib/scryfall";

type SearchState = "idle" | "loading" | "results" | "empty" | "error";
type RarityFilter = "common" | "uncommon" | "rare" | "mythic" | "special";
type ColorFilter = "W" | "U" | "B" | "R" | "G" | "colorless";

const RARITY_FILTERS: Array<{ label: string; value: RarityFilter }> = [
  { label: "Common", value: "common" },
  { label: "Uncommon", value: "uncommon" },
  { label: "Rare", value: "rare" },
  { label: "Mythic", value: "mythic" },
  { label: "Special", value: "special" },
];

const COLOR_FILTERS: Array<{ label: string; value: ColorFilter; symbol: string }> = [
  { label: "White", value: "W", symbol: "{W}" },
  { label: "Blue", value: "U", symbol: "{U}" },
  { label: "Black", value: "B", symbol: "{B}" },
  { label: "Red", value: "R", symbol: "{R}" },
  { label: "Green", value: "G", symbol: "{G}" },
  { label: "Colorless", value: "colorless", symbol: "{C}" },
];

export function ArtistSearch() {
  const [query, setQuery] = useState("");
  const [artistName, setArtistName] = useState("");
  const [state, setState] = useState<SearchState>("idle");
  const [cards, setCards] = useState<CardSearchResult[]>([]);
  const [activeFrameFilters, setActiveFrameFilters] = useState<ArtistFrameFilter[]>(["all"]);
  const [activeRarities, setActiveRarities] = useState<RarityFilter[]>([]);
  const [activeColors, setActiveColors] = useState<ColorFilter[]>([]);
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
    setActiveRarities((currentRarities) =>
      currentRarities.includes(nextRarity)
        ? currentRarities.filter((rarity) => rarity !== nextRarity)
        : [...currentRarities, nextRarity],
    );
  }

  function toggleColor(nextColor: ColorFilter) {
    setActiveColors((currentColors) =>
      currentColors.includes(nextColor)
        ? currentColors.filter((color) => color !== nextColor)
        : [...currentColors, nextColor],
    );
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
            <ArtistStats artistName={artistName} cards={cards} />
            <ArtistCards
              activeColors={activeColors}
              activeFrameFilters={activeFrameFilters}
              activeRarities={activeRarities}
              cards={cards}
              isLoading={cardsLoading}
              onColorToggle={toggleColor}
              onFrameToggle={toggleFrameFilter}
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

function ArtistStats({ artistName, cards }: { artistName: string; cards: CardSearchResult[] }) {
  const stats = getArtistStats(cards);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-2xl">{artistName}</CardTitle>
        <p className="mt-1 text-sm text-muted-foreground">Artist gallery</p>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 text-sm sm:grid-cols-3">
          <Stat label="Artwork shown" value={stats.cardCount.toString()} />
          <Stat label="Sets" value={stats.setCount.toString()} />
          <Stat label="Colors" value={stats.colorCount.toString()} />
        </div>
      </CardContent>
    </Card>
  );
}

function ArtistCards({
  activeColors,
  activeFrameFilters,
  activeRarities,
  cards,
  isLoading,
  onColorToggle,
  onFrameToggle,
  onRarityToggle,
}: {
  activeColors: ColorFilter[];
  activeFrameFilters: ArtistFrameFilter[];
  activeRarities: RarityFilter[];
  cards: CardSearchResult[];
  isLoading: boolean;
  onColorToggle: (color: ColorFilter) => void;
  onFrameToggle: (filter: ArtistFrameFilter) => void;
  onRarityToggle: (rarity: RarityFilter) => void;
}) {
  const filteredCards = filterCards(cards, activeRarities, activeColors);

  return (
    <section className="space-y-4">
      <div className="space-y-4">
        <div>
          <h2 className="text-xl font-semibold tracking-normal">Cards</h2>
          <p className="text-sm text-muted-foreground">
            {isLoading ? "Loading cards" : `${filteredCards.length} ${filteredCards.length === 1 ? "card" : "cards"}`}
          </p>
        </div>
        <div className="space-y-3">
          <CheckboxFilterGroup
            disabled={isLoading}
            label="Frame"
            onToggle={onFrameToggle}
            options={ARTIST_FRAME_FILTERS}
            selectedValues={activeFrameFilters}
          />
          <CheckboxFilterGroup
            disabled={isLoading}
            label="Rarity"
            onToggle={onRarityToggle}
            options={RARITY_FILTERS}
            selectedValues={activeRarities}
          />
          <CheckboxFilterGroup
            disabled={isLoading}
            label="Color"
            onToggle={onColorToggle}
            options={COLOR_FILTERS}
            selectedValues={activeColors}
            showManaSymbols
          />
        </div>
      </div>
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
    </section>
  );
}

function CheckboxFilterGroup<T extends string>({
  disabled,
  label,
  onToggle,
  options,
  selectedValues,
  showManaSymbols = false,
}: {
  disabled: boolean;
  label: string;
  onToggle: (value: T) => void;
  options: Array<{ label: string; value: T; symbol?: string }>;
  selectedValues: T[];
  showManaSymbols?: boolean;
}) {
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">{label}</legend>
      <div className="flex flex-wrap gap-3">
        {options.map((option) => (
          <label
            className="inline-flex h-8 items-center gap-2 rounded-md border bg-card px-3 text-sm transition-colors hover:bg-muted"
            key={option.value}
          >
            <input
              checked={selectedValues.includes(option.value)}
              className="h-4 w-4 rounded border-input accent-primary disabled:cursor-not-allowed"
              disabled={disabled}
              onChange={() => onToggle(option.value)}
              type="checkbox"
            />
            {showManaSymbols && option.symbol ? (
              <ManaSymbols className="text-base" symbolClassName="text-base" value={option.symbol} />
            ) : null}
            <span className={showManaSymbols ? "sr-only" : undefined}>{option.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function filterCards(cards: CardSearchResult[], rarities: RarityFilter[], colors: ColorFilter[]) {
  return cards.filter((card) => {
    const matchesRarity = !rarities.length || rarities.includes(card.rarity.toLowerCase() as RarityFilter);
    const matchesColor = !colors.length || getCardColorKey(card.colors) === getSelectedColorKey(colors);

    return matchesRarity && matchesColor;
  });
}

function getCardColorKey(colors: string[]) {
  return colors.length ? [...colors].sort().join(",") : "colorless";
}

function getSelectedColorKey(colors: ColorFilter[]) {
  return [...colors].sort().join(",");
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

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-background/50 p-3">
      <dt className="text-xs font-medium uppercase tracking-normal text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-sm font-semibold">{value}</dd>
    </div>
  );
}
