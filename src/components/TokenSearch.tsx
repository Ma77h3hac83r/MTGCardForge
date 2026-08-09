import { Search } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { AppNav } from "@/components/AppNav";
import { CheckboxFilterGroup, FilteredResultsLayout } from "@/components/CardFilters";
import { CardDetail, CardTile } from "@/components/CardDisplay";
import { ManaLoading } from "@/components/ManaLoading";
import { SearchCombobox } from "@/components/SearchCombobox";
import { SearchHotkeyHint } from "@/components/SearchHotkeyHint";
import { VirtualizedCardGrid } from "@/components/VirtualizedCardGrid";
import { Button } from "@/components/ui/button";
import { useDebouncedAsync } from "@/hooks/useDebouncedAsync";
import { fetchCardNameSuggestions } from "@/lib/autocomplete";
import {
  COLOR_FILTERS,
  filterCardsByAdvancedFilters,
  toggleFilterValue,
  type ColorFilter,
} from "@/lib/cardFilters";
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
  const searchControllerRef = useRef<AbortController | null>(null);
  const tokenDetailControllerRef = useRef<AbortController | null>(null);
  const tokenDetailRequestRef = useRef(0);
  const otherTokenPrintings = selectedToken
    ? tokenPrintings.filter((printing) => printing.id !== selectedToken.id)
    : tokenPrintings;

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
    (signal) => fetchCardNameSuggestions(trimmedQuery, signal, { includeExtras: true }),
    (sortedSuggestions) => {
      setSuggestions(sortedSuggestions);
      setSuggestionsOpen(sortedSuggestions.length > 0);
    },
    () => {
      setSuggestions([]);
      setSuggestionsOpen(false);
    },
  );

  async function runSearch(nextQuery = query) {
    if (!nextQuery.trim()) {
      searchControllerRef.current?.abort();
      resetSearch();
      return;
    }

    const controller = new AbortController();
    searchControllerRef.current?.abort();
    tokenDetailControllerRef.current?.abort();
    tokenDetailRequestRef.current += 1;
    searchControllerRef.current = controller;
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
      if (searchControllerRef.current !== controller) {
        return;
      }
      setMode(result.mode);
      setSourceCard(result.sourceCard);
      setTokens(result.tokens);

      if (result.sourceCard) {
        const nextSourcePrintings = await fetchCardPrintings(result.sourceCard, controller.signal);
        if (searchControllerRef.current !== controller) {
          return;
        }
        setSourcePrintings(nextSourcePrintings);
      }

      if (result.tokens[0]) {
        await selectToken(result.tokens[0], {
          signal: controller.signal,
          isActive: () => searchControllerRef.current === controller,
        });
        if (searchControllerRef.current !== controller) {
          return;
        }
      }

      setState(result.tokens.length || result.sourceCard ? "results" : "empty");
      setMessage(result.tokens.length || result.sourceCard ? "" : `No tokens found for "${nextQuery.trim()}".`);
    } catch (error) {
      if (searchControllerRef.current !== controller || (error instanceof DOMException && error.name === "AbortError")) {
        return;
      }

      setState("error");
      setMessage(error instanceof Error ? error.message : "Unable to search tokens.");
    } finally {
      if (searchControllerRef.current === controller) {
        searchControllerRef.current = null;
      }
    }
  }

  async function selectToken(
    token: CardSearchResult,
    options: { signal?: AbortSignal; isActive?: () => boolean } = {},
  ) {
    tokenDetailControllerRef.current?.abort();
    const detailController = options.signal ? null : new AbortController();
    const requestId = tokenDetailRequestRef.current + 1;
    tokenDetailRequestRef.current = requestId;
    const isActive = options.isActive ?? (() => true);
    const signal = options.signal ?? detailController?.signal;

    if (detailController) {
      tokenDetailControllerRef.current = detailController;
    }

    setSelectedToken(token);
    setTokenPrintings([]);
    setProducers([]);
    setMessage("");

    try {
      const [printings, producerCards] = await Promise.all([
        fetchTokenPrintings(token, signal),
        fetchTokenProducers(token, signal),
      ]);
      if (!isActive() || tokenDetailRequestRef.current !== requestId) {
        return;
      }
      setTokenPrintings(printings);
      setProducers(producerCards);
    } catch (error) {
      if (
        !isActive() ||
        tokenDetailRequestRef.current !== requestId ||
        (error instanceof DOMException && error.name === "AbortError")
      ) {
        return;
      }

      setTokenPrintings([]);
      setProducers([]);
      setMessage(`Unable to load details for ${token.name}.`);
    } finally {
      if (detailController && tokenDetailControllerRef.current === detailController) {
        tokenDetailControllerRef.current = null;
      }
    }
  }

  function resetSearch() {
    searchControllerRef.current?.abort();
    tokenDetailControllerRef.current?.abort();
    tokenDetailRequestRef.current += 1;
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
            <SearchCombobox
              id="token-search"
              label="Search by token or token-making card"
              open={suggestionsOpen}
              options={suggestions}
              placeholder="Token or token-making card"
              value={query}
              getOptionKey={(suggestion) => suggestion}
              getOptionLabel={(suggestion) => suggestion}
              onChange={setQuery}
              onOpenChange={setSuggestionsOpen}
              onSelect={(suggestion) => {
                setQuery(suggestion);
                void runSearch(suggestion);
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
                onSelect={(token) => void selectToken(token)}
                selectedToken={selectedToken}
                tokens={tokens}
              />
            )}

            {message && (
              <div className="rounded-lg border bg-card p-4 text-sm text-muted-foreground" role="alert">
                {message}
              </div>
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
  onSelect,
  selectedToken,
  tokens,
}: {
  onSelect: (token: CardSearchResult) => void;
  selectedToken: CardSearchResult | null;
  tokens: CardSearchResult[];
}) {
  const [activeColors, setActiveColors] = useState<ColorFilter[]>([]);
  const filteredTokens = filterCardsByAdvancedFilters(tokens, {
    colors: activeColors,
    prices: [],
    rarities: [],
  });
  const filterPanel = (
    <CheckboxFilterGroup
      disabled={false}
      label="Color"
      onToggle={(color) => setActiveColors((current) => toggleFilterValue(current, color))}
      options={COLOR_FILTERS}
      selectedValues={activeColors}
      showManaSymbols
    />
  );

  return (
    <section className="space-y-4">
      <FilteredResultsLayout filters={filterPanel}>
        {filteredTokens.length ? (
          <TokenTable onSelect={onSelect} selectedToken={selectedToken} tokens={filteredTokens} />
        ) : (
          <div className="rounded-lg border bg-card p-5 text-sm text-muted-foreground">
            No cards matched this filter.
          </div>
        )}
      </FilteredResultsLayout>
    </section>
  );
}

function TokenTable({
  onSelect,
  selectedToken,
  tokens,
}: {
  onSelect: (token: CardSearchResult) => void;
  selectedToken: CardSearchResult | null;
  tokens: CardSearchResult[];
}) {
  return (
    <div className="overflow-hidden rounded-lg border bg-card shadow-sm">
      <table className="w-full text-left text-sm">
        <thead className="border-b bg-muted/50 text-xs font-semibold uppercase tracking-normal text-muted-foreground">
          <tr>
            <th className="px-3 py-2">Card Name</th>
            <th className="px-3 py-2">Type</th>
            <th className="px-3 py-2">Colors</th>
            <th className="px-3 py-2">P/T</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {tokens.map((token) => (
            <tr
              className={`cursor-pointer transition-colors hover:bg-muted/50 ${
                selectedToken?.id === token.id ? "bg-primary/10" : ""
              }`}
              key={token.id}
              onClick={() => onSelect(token)}
            >
              <td className="px-3 py-2 font-medium">{token.name}</td>
              <td className="px-3 py-2 text-muted-foreground">{token.typeLine}</td>
              <td className="px-3 py-2">{getColorLabels(token.colors).join(", ")}</td>
              <td className="px-3 py-2">{token.power && token.toughness ? `${token.power}/${token.toughness}` : ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
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
      </div>
      <VirtualizedCardGrid
        getKey={(card) => card.id}
        items={cards}
        renderItem={(card) => <CardTile card={card} />}
      />
    </section>
  );
}
