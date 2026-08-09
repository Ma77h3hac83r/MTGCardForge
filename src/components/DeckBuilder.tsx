import { ClipboardList } from "lucide-react";
import { useRef, useState } from "react";
import { AppNav } from "@/components/AppNav";
import { CardTile } from "@/components/CardDisplay";
import { ManaLoading } from "@/components/ManaLoading";
import { SearchHotkeyHint } from "@/components/SearchHotkeyHint";
import { VirtualizedCardGrid } from "@/components/VirtualizedCardGrid";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DECK_GROUPS,
  groupDeckCards,
  parseDeckInput,
  streamResolveDeckCards,
  type DeckResolveProgress,
  type DeckResolvedCard,
} from "@/lib/deckSearch";
import type { CardSearchResult } from "@/lib/scryfall";
import { fetchTokensAndEmblemsForCards } from "@/lib/tokenSearch";

type DeckState = "idle" | "loading" | "results" | "empty" | "error";

export function DeckBuilder() {
  const [input, setInput] = useState("");
  const [state, setState] = useState<DeckState>("idle");
  const [cards, setCards] = useState<DeckResolvedCard[]>([]);
  const [tokens, setTokens] = useState<CardSearchResult[]>([]);
  const [message, setMessage] = useState("");
  const [progress, setProgress] = useState<Pick<DeckResolveProgress, "resolvedCount" | "totalCount" | "phase"> | null>(
    null,
  );
  const loadControllerRef = useRef<AbortController | null>(null);

  async function loadDeck() {
    const trimmedInput = input.trim();

    if (!trimmedInput) {
      loadControllerRef.current?.abort();
      loadControllerRef.current = null;
      setState("idle");
      setCards([]);
      setTokens([]);
      setMessage("");
      setProgress(null);
      return;
    }

    const controller = new AbortController();
    loadControllerRef.current?.abort();
    loadControllerRef.current = controller;
    setState("loading");
    setCards([]);
    setTokens([]);
    setMessage("");
    setProgress(null);

    try {
      const parsedCards = await parseDeckInput(trimmedInput, controller.signal);

      if (loadControllerRef.current !== controller) {
        return;
      }

      if (!parsedCards.length) {
        setState("empty");
        setMessage("No cards were found in that deck input.");
        return;
      }

      setProgress({ resolvedCount: 0, totalCount: parsedCards.length, phase: "collection" });

      let latestCards: DeckResolvedCard[] = parsedCards.map((card) => ({ ...card, card: null }));

      await streamResolveDeckCards(
        parsedCards,
        (update) => {
          if (loadControllerRef.current !== controller) {
            return;
          }

          latestCards = update.cards;
          setCards(update.cards);
          setProgress({
            resolvedCount: update.resolvedCount,
            totalCount: update.totalCount,
            phase: update.phase,
          });

          if (update.resolvedCount > 0) {
            setState("results");
          }
        },
        controller.signal,
      );

      if (loadControllerRef.current !== controller) {
        return;
      }

      const resolvedCardData = latestCards
        .map((card) => card.card)
        .filter((card): card is CardSearchResult => Boolean(card));

      if (!resolvedCardData.length && !latestCards.length) {
        setState("empty");
        setMessage("No cards were found in that deck input.");
        return;
      }

      setProgress({
        resolvedCount: latestCards.filter((card) => Boolean(card.card)).length,
        totalCount: latestCards.length,
        phase: "fallback",
      });

      const tokenCards = await fetchTokensAndEmblemsForCards(resolvedCardData, controller.signal);

      if (loadControllerRef.current !== controller) {
        return;
      }

      setTokens(tokenCards);
      setCards(latestCards);
      setState("results");
      setProgress(null);
    } catch (error) {
      if (loadControllerRef.current !== controller || (error instanceof DOMException && error.name === "AbortError")) {
        return;
      }

      setProgress(null);
      setState("error");
      setMessage(error instanceof Error ? error.message : "Unable to load this deck.");
    } finally {
      if (loadControllerRef.current === controller) {
        loadControllerRef.current = null;
      }
    }
  }

  function resetDeck() {
    loadControllerRef.current?.abort();
    loadControllerRef.current = null;
    setInput("");
    setState("idle");
    setCards([]);
    setTokens([]);
    setMessage("");
    setProgress(null);
  }

  const isLoading = state === "loading" || Boolean(progress);

  return (
    <>
      <AppNav layout="split" />

      <section className="mx-auto w-full max-w-7xl space-y-8 px-4 py-8 sm:px-6 lg:px-8" id="deck-page-top">
        <Card>
          {state === "results" && !progress ? (
            <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
              <p className="text-sm font-medium text-muted-foreground">Deck loaded</p>
              <Button onClick={resetDeck} type="button">
                Load new deck
              </Button>
            </CardContent>
          ) : (
            <>
              <CardHeader>
                <div className="flex items-start gap-3">
                  <ClipboardList aria-hidden="true" className="mt-1 h-5 w-5 text-muted-foreground" />
                  <div>
                    <CardTitle className="text-2xl">Deck</CardTitle>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Paste a card list, Moxfield deck URL, or Archidekt deck URL.
                    </p>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-2">
                  <div className="flex items-center justify-between gap-3">
                    <label className="text-sm font-medium" htmlFor="deck-input">
                      Deck input
                    </label>
                    <SearchHotkeyHint label="deck input" targetId="deck-input" />
                  </div>
                  <textarea
                    className="min-h-56 w-full rounded-md border border-input bg-card px-3 py-2 text-sm text-foreground shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={isLoading && state !== "results"}
                    id="deck-input"
                    placeholder={"1 Sol Ring\n1 Command Tower\n1 Counterspell"}
                    value={input}
                    onChange={(event) => setInput(event.target.value)}
                  />
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <Button disabled={isLoading && state !== "results"} onClick={() => void loadDeck()} type="button">
                    {state === "loading" && !cards.length ? "Loading" : state === "results" && progress ? "Updating" : "Load Deck"}
                  </Button>
                  <p className="text-sm text-muted-foreground">
                    Cards resolve to the cheapest paper printing with a Scryfall USD price when available.
                  </p>
                </div>
              </CardContent>
            </>
          )}
        </Card>

        <DeckStatus message={message} progress={progress} state={state} />

        {(state === "results" || (state === "loading" && cards.length > 0)) && (
          <DeckResults cards={cards} progress={progress} tokens={tokens} />
        )}
      </section>
    </>
  );
}

function DeckStatus({
  state,
  message,
  progress,
}: {
  state: DeckState;
  message: string;
  progress: Pick<DeckResolveProgress, "resolvedCount" | "totalCount" | "phase"> | null;
}) {
  if (state === "loading" && !progress) {
    return (
      <div aria-live="polite" className="grid gap-6">
        <ManaLoading />
        <div className="h-20 animate-pulse rounded-lg border bg-card" />
        <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {Array.from({ length: 10 }).map((_, index) => (
            <div className="aspect-[5/7] animate-pulse rounded-lg border bg-card" key={index} />
          ))}
        </div>
      </div>
    );
  }

  if (progress) {
    return (
      <div aria-live="polite" className="rounded-lg border bg-card p-4 text-sm text-muted-foreground">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span>{getProgressLabel(progress)}</span>
          <span className="font-medium text-foreground">
            {progress.resolvedCount} / {progress.totalCount} resolved
          </span>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-300"
            style={{
              width: `${progress.totalCount ? Math.min(100, (progress.resolvedCount / progress.totalCount) * 100) : 0}%`,
            }}
          />
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

function getProgressLabel(progress: Pick<DeckResolveProgress, "phase">) {
  switch (progress.phase) {
    case "collection":
      return "Identifying cards…";
    case "cheapest":
      return "Finding cheapest paper printings…";
    case "fallback":
      return "Resolving remaining names…";
    default:
      return "Loading deck…";
  }
}

function DeckResults({
  cards,
  tokens,
  progress,
}: {
  cards: DeckResolvedCard[];
  tokens: CardSearchResult[];
  progress: Pick<DeckResolveProgress, "resolvedCount" | "totalCount" | "phase"> | null;
}) {
  const pendingCards = progress ? cards.filter((card) => !card.card) : [];
  const groupedCards = progress ? cards.filter((card) => Boolean(card.card)) : cards;
  const groups = groupDeckCards(groupedCards);
  const tokenDeckCards = tokens.map((token) => ({
    name: token.name,
    quantity: 1,
    card: token,
  }));
  const typeBreakdown = getTypeBreakdown(groups, tokenDeckCards);

  return (
    <section className="space-y-6">
      {typeBreakdown.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Card type breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-rows-2 gap-2 text-sm sm:grid-flow-col sm:auto-cols-fr">
              {typeBreakdown.map((item) => (
                <a
                  className="flex items-center justify-between rounded-md border bg-background/50 px-3 py-2 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  href={item.href}
                  key={item.key}
                >
                  <span className="text-muted-foreground">{item.label}</span>
                  <span className="font-semibold">{item.quantity}</span>
                </a>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="space-y-8">
        {DECK_GROUPS.map((group) => {
          const groupCards = groups.find((item) => item.key === group.key)?.cards ?? [];

          if (!groupCards.length) {
            return null;
          }

          return <DeckSection cards={groupCards} key={group.key} label={group.label} sectionId={`deck-section-${group.key}`} />;
        })}
        {tokenDeckCards.length > 0 && (
          <DeckSection cards={tokenDeckCards} label="Tokens" sectionId="deck-section-tokens" />
        )}
        {pendingCards.length > 0 && (
          <DeckSection
            cards={pendingCards}
            label="Still resolving"
            pending
            sectionId="deck-section-pending"
          />
        )}
      </div>
    </section>
  );
}

function getTypeBreakdown(
  groups: ReturnType<typeof groupDeckCards>,
  tokenDeckCards: DeckResolvedCard[],
) {
  const deckTypes = groups.map((group) => ({
    href: `#deck-section-${group.key}`,
    key: group.key,
    label: group.label,
    quantity: group.cards.reduce((total, card) => total + card.quantity, 0),
  }));

  if (!tokenDeckCards.length) {
    return deckTypes;
  }

  return [
    ...deckTypes,
    {
      href: "#deck-section-tokens",
      key: "tokens",
      label: "Tokens",
      quantity: tokenDeckCards.reduce((total, card) => total + card.quantity, 0),
    },
  ];
}

function DeckSection({
  cards,
  label,
  sectionId,
  pending = false,
}: {
  cards: DeckResolvedCard[];
  label: string;
  sectionId: string;
  pending?: boolean;
}) {
  const quantity = cards.reduce((total, card) => total + card.quantity, 0);

  return (
    <div className="scroll-mt-24 space-y-4" id={sectionId}>
      <div className="flex items-center gap-3">
        <div className="h-px flex-1 bg-border" />
        <div className="flex items-center gap-3 rounded-md border bg-card px-3 py-1 text-sm font-medium">
          <span>
            {label} ({quantity})
          </span>
          <button
            className="rounded-sm px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => document.getElementById("deck-page-top")?.scrollIntoView({ behavior: "smooth" })}
            type="button"
          >
            Back to top
          </button>
        </div>
        <div className="h-px flex-1 bg-border" />
      </div>
      <VirtualizedCardGrid
        estimateRowHeight={400}
        getKey={(deckCard) => `${deckCard.name}-${deckCard.card?.id ?? "unresolved"}`}
        items={cards}
        renderItem={(deckCard) => <DeckCardTile deckCard={deckCard} pending={pending} />}
      />
    </div>
  );
}

function DeckCardTile({ deckCard, pending = false }: { deckCard: DeckResolvedCard; pending?: boolean }) {
  const card = deckCard.card;

  if (!card) {
    return (
      <div className="rounded-lg border bg-card p-4 text-sm shadow-sm">
        <p className="font-semibold">
          {deckCard.quantity}x {deckCard.name}
        </p>
        <p className="mt-2 text-muted-foreground">
          {pending ? "Resolving…" : "Unable to resolve this card."}
        </p>
      </div>
    );
  }

  return <CardTile card={card} quantity={deckCard.quantity} showName showPrintingMeta={false} showType />;
}
