import { ClipboardList } from "lucide-react";
import { useState } from "react";
import { AppNav } from "@/components/AppNav";
import { CardTile } from "@/components/CardDisplay";
import { ManaLoading } from "@/components/ManaLoading";
import { SearchHotkeyHint } from "@/components/SearchHotkeyHint";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DECK_GROUPS, groupDeckCards, parseDeckInput, resolveDeckCards, type DeckResolvedCard } from "@/lib/deckSearch";
import type { CardSearchResult } from "@/lib/scryfall";
import { fetchTokensAndEmblemsForCards } from "@/lib/tokenSearch";

type DeckState = "idle" | "loading" | "results" | "empty" | "error";

export function DeckBuilder() {
  const [input, setInput] = useState("");
  const [state, setState] = useState<DeckState>("idle");
  const [cards, setCards] = useState<DeckResolvedCard[]>([]);
  const [tokens, setTokens] = useState<CardSearchResult[]>([]);
  const [message, setMessage] = useState("");

  async function loadDeck() {
    const trimmedInput = input.trim();

    if (!trimmedInput) {
      setState("idle");
      setCards([]);
      setTokens([]);
      setMessage("");
      return;
    }

    const controller = new AbortController();
    setState("loading");
    setCards([]);
    setTokens([]);
    setMessage("");

    try {
      const parsedCards = await parseDeckInput(trimmedInput, controller.signal);

      if (!parsedCards.length) {
        setState("empty");
        setMessage("No cards were found in that deck input.");
        return;
      }

      const resolvedCards = await resolveDeckCards(parsedCards, controller.signal);
      const resolvedCardData = resolvedCards
        .map((card) => card.card)
        .filter((card): card is CardSearchResult => Boolean(card));
      const tokenCards = await fetchTokensAndEmblemsForCards(resolvedCardData, controller.signal);
      setCards(resolvedCards);
      setTokens(tokenCards);
      setState("results");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return;
      }

      setState("error");
      setMessage(error instanceof Error ? error.message : "Unable to load this deck.");
    }
  }

  return (
    <>
      <AppNav layout="split" />

      <section className="mx-auto w-full max-w-7xl space-y-8 px-4 py-8 sm:px-6 lg:px-8" id="deck-page-top">
        <Card>
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
                disabled={state === "loading"}
                id="deck-input"
                placeholder={"1 Sol Ring\n1 Command Tower\n1 Counterspell"}
                value={input}
                onChange={(event) => setInput(event.target.value)}
              />
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button disabled={state === "loading"} onClick={() => void loadDeck()} type="button">
                {state === "loading" ? "Loading" : "Load Deck"}
              </Button>
              <p className="text-sm text-muted-foreground">
                Cards resolve to the cheapest paper printing with a Scryfall USD price when available.
              </p>
            </div>
          </CardContent>
        </Card>

        <DeckStatus message={message} state={state} />

        {state === "results" && <DeckResults cards={cards} tokens={tokens} />}
      </section>
    </>
  );
}

function DeckStatus({ state, message }: { state: DeckState; message: string }) {
  if (state === "loading") {
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

  if (state === "empty" || state === "error") {
    return (
      <div className="rounded-lg border bg-card p-5 text-sm text-muted-foreground" role="status">
        {message}
      </div>
    );
  }

  return null;
}

function DeckResults({ cards, tokens }: { cards: DeckResolvedCard[]; tokens: CardSearchResult[] }) {
  const groups = groupDeckCards(cards);
  const cardCount = cards.reduce((total, card) => total + card.quantity, 0);
  const unresolvedCount = cards.filter((card) => !card.card).length;
  const tokenDeckCards = tokens.map((token) => ({
    name: token.name,
    quantity: 1,
    card: token,
  }));

  return (
    <section className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Deck Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 text-sm sm:grid-cols-4">
            <Stat label="Cards" value={cardCount.toString()} />
            <Stat label="Unique cards" value={cards.length.toString()} />
            <Stat label="Tokens" value={tokens.length.toString()} />
            <Stat label="Unresolved" value={unresolvedCount.toString()} />
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted-foreground">Jump:</span>
        {groups.map((group) => (
          <a
            className="rounded-sm border bg-card px-2 py-1 text-xs font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            href={`#deck-section-${group.key}`}
            key={group.key}
          >
            {group.label}
          </a>
        ))}
        {tokens.length > 0 && (
          <a
            className="rounded-sm border bg-card px-2 py-1 text-xs font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            href="#deck-section-tokens"
          >
            Tokens
          </a>
        )}
      </div>

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
      </div>
    </section>
  );
}

function DeckSection({
  cards,
  label,
  sectionId,
}: {
  cards: DeckResolvedCard[];
  label: string;
  sectionId: string;
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
      <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {cards.map((deckCard) => (
          <DeckCardTile deckCard={deckCard} key={`${deckCard.name}-${deckCard.card?.id ?? "unresolved"}`} />
        ))}
      </div>
    </div>
  );
}

function DeckCardTile({ deckCard }: { deckCard: DeckResolvedCard }) {
  const card = deckCard.card;

  if (!card) {
    return (
      <div className="rounded-lg border bg-card p-4 text-sm shadow-sm">
        <p className="font-semibold">
          {deckCard.quantity}x {deckCard.name}
        </p>
        <p className="mt-2 text-muted-foreground">Unable to resolve this card.</p>
      </div>
    );
  }

  return <CardTile card={card} quantity={deckCard.quantity} showManaCost showName showType />;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-background/50 p-3">
      <dt className="text-xs font-medium uppercase tracking-normal text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-sm font-semibold">{value}</dd>
    </div>
  );
}
