import type { CardSearchResult } from "@/lib/scryfall";

export function getUsdPriceLabels(card: CardSearchResult) {
  return [
    { label: "Base", value: card.prices.usd ? `$${card.prices.usd}` : null },
    { label: "Foil", value: card.prices.usdFoil ? `$${card.prices.usdFoil}` : null },
    {
      label: "Rainbow",
      value: card.prices.usdEtched ? `$${card.prices.usdEtched}` : null,
    },
  ].filter((entry): entry is { label: string; value: string } => Boolean(entry.value));
}
