import { Search } from "lucide-react";
import { useEffect, useState } from "react";
import { CardTile } from "@/components/CardDisplay";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import logoUrl from "@/images/logo.png";
import { fetchArtistNameSuggestions } from "@/lib/autocomplete";
import { fetchArtistCards, getArtistStats } from "@/lib/artistSearch";
import { NAV_ITEMS } from "@/lib/navigation";
import type { CardSearchResult } from "@/lib/scryfall";

type SearchState = "idle" | "loading" | "results" | "empty" | "error";

export function ArtistSearch() {
  const [query, setQuery] = useState("");
  const [artistName, setArtistName] = useState("");
  const [state, setState] = useState<SearchState>("idle");
  const [cards, setCards] = useState<CardSearchResult[]>([]);
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
      setSuggestions([]);
      setSuggestionsOpen(false);
      setMessage("");
      return;
    }

    const controller = new AbortController();
    setState("loading");
    setArtistName(trimmedQuery);
    setCards([]);
    setSuggestions([]);
    setSuggestionsOpen(false);
    setMessage("");

    if (options.updateUrl !== false) {
      const url = new URL(window.location.href);
      url.searchParams.set("artist", trimmedQuery);
      window.history.replaceState(null, "", url);
    }

    try {
      const artistCards = await fetchArtistCards(trimmedQuery, controller.signal);
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

  return (
    <>
      <nav className="sticky top-0 z-20 border-b bg-card/95 backdrop-blur">
        <div className="relative mx-auto flex min-h-16 max-w-7xl items-center justify-center px-4 py-3 sm:px-6 lg:px-8">
          <a
            className="absolute left-4 flex items-center gap-2 text-lg font-semibold tracking-normal text-foreground transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:left-6 lg:left-8"
            href="/"
            aria-label="MTG Card Forge"
          >
            <img alt="" className="h-10 w-auto" src={logoUrl.src ?? logoUrl} />
            <span>MTG Card Forge</span>
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
        </div>
      </nav>

      <section className="mx-auto w-full max-w-7xl space-y-8 px-4 py-8 sm:px-6 lg:px-8">
        <ArtistStatus message={message} state={state} />

        {state === "results" && (
          <>
            <ArtistStats artistName={artistName} cards={cards} />
            <ArtistCards cards={cards} />
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

function ArtistCards({ cards }: { cards: CardSearchResult[] }) {
  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold tracking-normal">Cards</h2>
        <p className="text-sm text-muted-foreground">
          {cards.length} {cards.length === 1 ? "card" : "cards"}
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {cards.map((card) => (
          <CardTile card={card} key={card.id} showManaCost showName showType />
        ))}
      </div>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-background/50 p-3">
      <dt className="text-xs font-medium uppercase tracking-normal text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-sm font-semibold">{value}</dd>
    </div>
  );
}
