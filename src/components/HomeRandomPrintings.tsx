import { useEffect, useState } from "react";
import { normalizeScryfallCard, type CardSearchResult, type ScryfallCard } from "@/lib/scryfall";

const RANDOM_PRINTING_COUNT = 4;
const RANDOM_PRINTING_URL = "https://api.scryfall.com/cards/random?q=game%3Apaper";

export default function HomeRandomPrintings() {
  const [cards, setCards] = useState<CardSearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  async function loadRandomPrintings(signal?: AbortSignal) {
    setIsLoading(true);
    setMessage(null);

    try {
      const randomCards = await fetchRandomPrintings(signal);

      if (!signal?.aborted) {
        setCards(randomCards);
        setMessage(randomCards.length ? null : "Scryfall did not return image-ready printings.");
      }
    } catch {
      if (!signal?.aborted) {
        setMessage("Random printings are unavailable right now.");
      }
    } finally {
      if (!signal?.aborted) {
        setIsLoading(false);
      }
    }
  }

  useEffect(() => {
    const controller = new AbortController();

    void loadRandomPrintings(controller.signal);

    return () => controller.abort();
  }, []);

  return (
    <div className="space-y-3">
      <div className="grid max-w-sm grid-cols-2 gap-3">
        {isLoading && !cards.length
          ? Array.from({ length: RANDOM_PRINTING_COUNT }, (_, index) => <RandomPrintingSkeleton key={index} />)
          : cards.map((card) => <RandomPrintingImageTile card={card} key={card.id} />)}
      </div>
      {message ? <p className="max-w-sm text-sm text-muted-foreground">{message}</p> : null}
    </div>
  );
}

async function fetchRandomPrintings(signal?: AbortSignal) {
  const cachedResponse = await fetch(`/api/random-printings?count=${RANDOM_PRINTING_COUNT}`, {
    headers: { Accept: "application/json" },
    signal,
  }).catch(() => null);

  if (cachedResponse?.ok) {
    const payload = (await cachedResponse.json()) as { data?: ScryfallCard[] };
    const cards = new Map<string, CardSearchResult>();

    for (const item of payload.data ?? []) {
      const card = normalizeScryfallCard(item);

      if (card.images.length) {
        cards.set(card.id, card);
      }
    }

    if (cards.size) {
      return Array.from(cards.values()).slice(0, RANDOM_PRINTING_COUNT);
    }
  }

  const requests = Array.from({ length: RANDOM_PRINTING_COUNT }, () => fetchRandomPrinting(signal));
  const results = await Promise.allSettled(requests);
  const cards = new Map<string, CardSearchResult>();

  for (const result of results) {
    if (result.status === "fulfilled") {
      const card = normalizeScryfallCard(result.value);

      if (card.images.length) {
        cards.set(card.id, card);
      }
    }
  }

  return Array.from(cards.values()).slice(0, RANDOM_PRINTING_COUNT);
}

async function fetchRandomPrinting(signal?: AbortSignal) {
  const response = await fetch(RANDOM_PRINTING_URL, {
    headers: { Accept: "application/json" },
    signal,
  });

  if (!response.ok) {
    throw new Error("Unable to load random printing");
  }

  return response.json() as Promise<ScryfallCard>;
}

function RandomPrintingSkeleton() {
  return (
    <div className="overflow-hidden rounded-lg border bg-background/70 shadow-sm">
      <div className="aspect-[5/7] animate-pulse bg-muted" />
    </div>
  );
}

function RandomPrintingImageTile({ card }: { card: CardSearchResult }) {
  const image = card.images[0];
  const imageSrc = image?.normal ?? image?.large ?? image?.small ?? image?.artCrop;

  return (
    <a
      aria-label={`View ${card.name} on Scryfall`}
      className="group block overflow-hidden rounded-lg border bg-background shadow-sm transition-colors hover:border-primary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      href={card.scryfallUri}
      rel="noopener noreferrer"
      target="_blank"
    >
      <div className="aspect-[5/7] bg-muted">
        <img
          alt={card.name}
          className="h-full w-full object-cover transition-transform group-hover:scale-[1.02]"
          loading="lazy"
          src={imageSrc ?? ""}
        />
      </div>
    </a>
  );
}
