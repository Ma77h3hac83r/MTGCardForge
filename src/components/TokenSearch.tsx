import { Search } from "lucide-react";
import { useEffect, useState } from "react";
import { AppNav } from "@/components/AppNav";
import { SetSymbol } from "@/components/CardSymbols";
import { CardDetail, CardTile } from "@/components/CardDisplay";
import { ManaLoading } from "@/components/ManaLoading";
import { SearchHotkeyHint } from "@/components/SearchHotkeyHint";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fetchCardNameSuggestions } from "@/lib/autocomplete";
import {
  fetchCardPrintings,
  fetchTokenPrintings,
  fetchTokenProducers,
  searchTokenOrCard,
  type TokenSearchMode,
} from "@/lib/tokenSearch";
import type { CardSearchResult } from "@/lib/scryfall";

type SearchState = "idle" | "loading" | "results" | "empty" | "error";

export function TokenSearch() {
  const [query, setQuery] = useState("");
  const [state, setState] = useState<SearchState>("idle");
  const [mode, setMode] = useState<TokenSearchMode>("token");
  const [sourceCard, setSourceCard] = useState<CardSearchResult | null>(null);
  const [sourcePrintings, setSourcePrintings] = useState<CardSearchResult[]>([]);
  const [tokens, setTokens] = useState<CardSearchResult[]>([]);
  const [selectedToken, setSelectedToken] = useState<CardSearchResult | null>(null);
  const [tokenPrintings, setTokenPrintings] = useState<CardSearchResult[]>([]);
  const [producers, setProducers] = useState<CardSearchResult[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [message, setMessage] = useState("");
  const otherTokenPrintings = selectedToken
    ? tokenPrintings.filter((printing) => printing.id !== selectedToken.id)
    : tokenPrintings;

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
        const sortedSuggestions = await fetchCardNameSuggestions(trimmedQuery, controller.signal, {
          includeExtras: true,
        });
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

  async function runSearch(nextQuery = query) {
    if (!nextQuery.trim()) {
      resetSearch();
      return;
    }

    const controller = new AbortController();
    setState("loading");
    setMessage("");
    setSuggestions([]);
    setSuggestionsOpen(false);
    setSourceCard(null);
    setSourcePrintings([]);
    setTokens([]);
    setSelectedToken(null);
    setTokenPrintings([]);
    setProducers([]);

    try {
      const result = await searchTokenOrCard(nextQuery, controller.signal);
      setMode(result.mode);
      setSourceCard(result.sourceCard);
      setTokens(result.tokens);

      if (result.sourceCard) {
        setSourcePrintings(await fetchCardPrintings(result.sourceCard, controller.signal));
      }

      if (result.tokens[0]) {
        await selectToken(result.tokens[0], controller.signal);
      }

      setState(result.tokens.length || result.sourceCard ? "results" : "empty");
      setMessage(result.tokens.length || result.sourceCard ? "" : `No tokens found for "${nextQuery.trim()}".`);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return;
      }

      setState("error");
      setMessage(error instanceof Error ? error.message : "Unable to search tokens.");
    }
  }

  async function selectToken(token: CardSearchResult, signal?: AbortSignal) {
    setSelectedToken(token);
    const [printings, producerCards] = await Promise.all([
      fetchTokenPrintings(token, signal),
      fetchTokenProducers(token, signal),
    ]);
    setTokenPrintings(printings);
    setProducers(producerCards);
  }

  function resetSearch() {
    setState("idle");
    setMode("token");
    setSourceCard(null);
    setSourcePrintings([]);
    setTokens([]);
    setSelectedToken(null);
    setTokenPrintings([]);
    setProducers([]);
    setSuggestions([]);
    setSuggestionsOpen(false);
    setMessage("");
  }

  return (
    <>
      <AppNav>
        <div className="flex w-full max-w-sm items-center justify-center gap-2">
          <form
            className="relative w-full max-w-xs"
            onSubmit={(event) => {
              event.preventDefault();
              void runSearch();
            }}
            role="search"
          >
            <label className="sr-only" htmlFor="token-search">
              Search by token or token-making card
            </label>
            <Input
              id="token-search"
              aria-autocomplete="list"
              aria-controls="token-search-suggestions"
              aria-expanded={suggestionsOpen}
              autoComplete="off"
              className="pr-12"
              placeholder="Token or token-making card"
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
                id="token-search-suggestions"
                role="listbox"
              >
                {suggestions.map((suggestion) => (
                  <button
                    className="block w-full px-3 py-2 text-left text-sm transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
                    key={suggestion}
                    onMouseDown={(event) => {
                      event.preventDefault();
                      setQuery(suggestion);
                      void runSearch(suggestion);
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
          <SearchHotkeyHint targetId="token-search" />
        </div>
      </AppNav>

      <section className="mx-auto w-full max-w-7xl space-y-8 px-4 py-8 sm:px-6 lg:px-8">
        <TokenStatus message={message} state={state} />

        {state === "results" && (
          <>
            {sourceCard && <CardDetail card={sourceCard} showStats title="Source Card" />}
            {sourceCard && sourcePrintings.length > 0 && (
              <CardGrid cards={sourcePrintings} title="Other Printings" />
            )}

            {(mode === "card" || tokens.length > 1) && tokens.length > 0 && (
              <ProducedObjectPicker
                mode={mode}
                onSelect={(token) => void selectToken(token)}
                selectedToken={selectedToken}
                tokens={tokens}
              />
            )}

            {selectedToken && <CardDetail card={selectedToken} showStats title="Token Details" />}
            {otherTokenPrintings.length > 0 && <CardGrid cards={otherTokenPrintings} title="Other Printings" />}
            {producers.length > 0 && <CardGrid cards={producers} title="Cards That Make This Token" />}
          </>
        )}
      </section>
    </>
  );
}

function TokenStatus({ state, message }: { state: SearchState; message: string }) {
  if (state === "idle") {
    return (
      <div className="rounded-lg border border-dashed bg-card p-6 text-sm text-muted-foreground">
        Search for a token name like Bird, or an exact card name that creates tokens.
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

  if (state === "empty" || state === "error") {
    return (
      <div className="rounded-lg border bg-card p-5 text-sm text-muted-foreground" role="status">
        {message}
      </div>
    );
  }

  return null;
}

function ProducedObjectPicker({
  mode,
  onSelect,
  selectedToken,
  tokens,
}: {
  mode: TokenSearchMode;
  onSelect: (token: CardSearchResult) => void;
  selectedToken: CardSearchResult | null;
  tokens: CardSearchResult[];
}) {
  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold tracking-normal">
          {mode === "card" ? "Tokens and Emblems Created" : "Token Versions"}
        </h2>
        <p className="text-sm text-muted-foreground">{tokens.length} {tokens.length === 1 ? "token" : "tokens"}</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
        {tokens.map((token) => (
          <button
            className={`rounded-lg border bg-card p-3 text-left shadow-sm transition-colors hover:border-primary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
              selectedToken?.id === token.id ? "ring-2 ring-ring" : ""
            }`}
            key={token.id}
            onClick={() => onSelect(token)}
            type="button"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-semibold">{token.name}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{token.typeLine}</p>
                <TokenColors colors={token.colors} />
              </div>
              <SetSymbol className="text-lg" code={token.setCode} rarity={token.rarity} />
            </div>
            {token.power && token.toughness && (
              <p className="mt-2 text-sm font-medium">
                {token.power}/{token.toughness}
              </p>
            )}
          </button>
        ))}
      </div>
    </section>
  );
}

function TokenColors({ colors }: { colors: string[] }) {
  const labels = getColorLabels(colors);

  return (
    <div className="mt-2 flex flex-wrap gap-1">
      {labels.map((label) => (
        <span className="rounded-sm border bg-background/60 px-1.5 py-0.5 text-xs font-medium text-muted-foreground" key={label}>
          {label}
        </span>
      ))}
    </div>
  );
}

function getColorLabels(colors: string[]) {
  if (!colors.length) {
    return ["Colorless"];
  }

  const colorNames: Record<string, string> = {
    W: "White",
    U: "Blue",
    B: "Black",
    R: "Red",
    G: "Green",
  };

  return colors.map((color) => colorNames[color] ?? color);
}

function CardGrid({ cards, title }: { cards: CardSearchResult[]; title: string }) {
  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold tracking-normal">{title}</h2>
        <p className="text-sm text-muted-foreground">{cards.length} {cards.length === 1 ? "card" : "cards"}</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {cards.map((card) => (
          <CardTile card={card} key={card.id} />
        ))}
      </div>
    </section>
  );
}
