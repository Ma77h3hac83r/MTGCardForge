import { ExternalLink } from "lucide-react";
import type { ReactNode } from "react";
import { InlineManaText, ManaSymbols, SetSymbol } from "@/components/CardSymbols";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import tcgplayerUrl from "@/images/tcgplayer.png";
import { getUsdPriceLabels } from "@/lib/prices";
import type { CardSearchResult } from "@/lib/scryfall";

type CardTileProps = {
  card: CardSearchResult;
  active?: boolean;
  href?: string;
  onClick?: () => void;
  quantity?: number;
  showName?: boolean;
  showType?: boolean;
  showManaCost?: boolean;
};

export function CardTile({
  active = false,
  card,
  href,
  onClick,
  quantity,
  showName = false,
  showType = false,
  showManaCost = false,
}: CardTileProps) {
  const content = (
    <>
      <CardTileImage card={card} quantity={quantity} />
      <CardTileBody card={card} showManaCost={showManaCost} showName={showName} showType={showType} />
    </>
  );
  const className = `group block overflow-hidden rounded-lg border bg-card text-left shadow-sm transition-colors hover:border-primary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
    active ? "border-primary ring-2 ring-ring" : ""
  }`;

  if (onClick) {
    return (
      <button aria-current={active ? "true" : undefined} className={className} onClick={onClick} type="button">
        {content}
      </button>
    );
  }

  return (
    <a
      aria-current={active ? "true" : undefined}
      className={className}
      href={href ?? card.scryfallUri}
      rel="noopener noreferrer"
      target="_blank"
    >
      {content}
    </a>
  );
}

function CardTileImage({ card, quantity }: { card: CardSearchResult; quantity?: number }) {
  const image = card.images[0];

  return (
    <div className="relative aspect-[5/7] bg-muted">
      {image?.normal ? (
        <img alt={card.name} className="h-full w-full object-cover" loading="lazy" src={image.normal} />
      ) : (
        <div className="flex h-full items-center justify-center px-5 text-center text-sm text-muted-foreground">
          No image available
        </div>
      )}
      {quantity ? (
        <span className="absolute left-2 top-2 rounded-md bg-card/95 px-2 py-1 text-xs font-semibold shadow-sm">
          {quantity}x
        </span>
      ) : null}
    </div>
  );
}

function CardTileBody({
  card,
  showManaCost,
  showName,
  showType,
}: {
  card: CardSearchResult;
  showManaCost: boolean;
  showName: boolean;
  showType: boolean;
}) {
  const priceEntries = getUsdPriceLabels(card);

  return (
    <div className="space-y-2 p-3 text-sm">
      {showName || showType ? (
        <div className="min-w-0">
          {showName && <p className="truncate font-medium">{card.name}</p>}
          {showType && <p className="mt-0.5 truncate text-xs text-muted-foreground">{card.typeLine}</p>}
        </div>
      ) : null}
      <div className="flex min-w-0 items-center justify-between gap-2 text-xs text-muted-foreground">
        <span className="min-w-0 truncate">
          {card.setCode} #{card.collectorNumber}
        </span>
        <span className="flex min-w-0 shrink-0 items-center gap-2">
          <SetSymbol className="text-lg" code={card.setCode} rarity={card.rarity} />
          {showManaCost && card.manaCost ? <ManaSymbols className="text-sm" value={card.manaCost} /> : null}
          <span className="flex min-w-0 shrink items-center gap-1 overflow-hidden">
            {priceEntries.length ? (
              priceEntries.map((price) => (
                <span className="shrink-0" key={price.label}>
                  <span className="font-medium text-foreground">{price.label}</span> {price.value}
                </span>
              ))
            ) : (
              <span className="font-medium">N/A</span>
            )}
          </span>
        </span>
      </div>
    </div>
  );
}

type CardDetailProps = {
  artistValue?: ReactNode;
  card: CardSearchResult;
  showLegalities?: boolean;
  showStats?: boolean;
  showTcgplayer?: boolean;
  title?: string;
};

export function CardDetail({
  artistValue,
  card,
  showLegalities = false,
  showStats = false,
  showTcgplayer = false,
  title,
}: CardDetailProps) {
  const usdPrice = card.prices.usd ? `$${card.prices.usd}` : null;

  return (
    <section className="grid gap-6 lg:grid-cols-[360px_minmax(0,1fr)]">
      <CardDetailImages card={card} />
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              {title && <p className="text-sm font-medium uppercase tracking-normal text-muted-foreground">{title}</p>}
              <CardTitle className={title ? "mt-1 text-2xl" : "text-2xl"}>{card.name}</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">{card.typeLine}</p>
            </div>
            <span className="flex items-center gap-3">
              <SetSymbol className="text-2xl" code={card.setCode} rarity={card.rarity} />
              {card.manaCost && <ManaSymbols className="text-base" value={card.manaCost} />}
            </span>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          {card.oracleText && (
            <section className="space-y-2">
              <h4 className="text-sm font-semibold">Oracle Text</h4>
              <p className="whitespace-pre-line text-sm leading-6">
                <InlineManaText value={card.oracleText} />
              </p>
            </section>
          )}

          <section className="grid gap-3 text-sm">
            <DetailRow
              label="Set"
              value={
                <span className="inline-flex items-center gap-2">
                  <SetSymbol className="text-lg" code={card.setCode} rarity={card.rarity} />
                  <span>
                    {card.setName} {card.setCode ? `(${card.setCode})` : ""}
                  </span>
                </span>
              }
            />
            <DetailRow label="Collector" value={card.collectorNumber} />
            <DetailRow label="Colors" value={getColorLabels(card.colors).join(", ")} />
            <DetailRow label="Artist" value={artistValue ?? card.artist ?? "Unknown"} />
            {showStats && card.power && card.toughness && <DetailRow label="Stats" value={`${card.power}/${card.toughness}`} />}
            {showLegalities && (
              <DetailRow
                label="Legal"
                value={card.legalFormats.length ? card.legalFormats.join(", ") : "No summary formats"}
              />
            )}
          </section>

          <div className="flex flex-wrap gap-2">
            <a
              className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-muted px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              href={card.scryfallUri}
              rel="noopener noreferrer"
              target="_blank"
            >
              <ExternalLink aria-hidden="true" className="h-4 w-4" />
              Scryfall
            </a>
            {showTcgplayer && card.tcgplayerUri && (
              <a
                className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                href={card.tcgplayerUri}
                rel="noopener noreferrer"
                target="_blank"
              >
                <img alt="TCGplayer" className="h-5 w-auto" src={tcgplayerUrl.src ?? tcgplayerUrl} />
                {usdPrice && <span>{usdPrice}</span>}
              </a>
            )}
          </div>
        </CardContent>
      </Card>
    </section>
  );
}

function CardDetailImages({ card }: { card: CardSearchResult }) {
  if (!card.images.length) {
    return (
      <div className="flex aspect-[5/7] items-center justify-center rounded-lg border bg-muted px-6 text-center text-sm text-muted-foreground shadow-sm">
        No image available
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {card.images.map((image) => (
        <figure className="overflow-hidden rounded-lg border bg-muted shadow-sm" key={image.label}>
          <img
            alt={image.label}
            className="w-full"
            loading="lazy"
            src={image.large ?? image.normal ?? image.small ?? ""}
          />
          {card.images.length > 1 && (
            <figcaption className="px-3 py-2 text-xs text-muted-foreground">{image.label}</figcaption>
          )}
        </figure>
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

function DetailRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="grid grid-cols-[88px_minmax(0,1fr)] gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
