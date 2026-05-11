import type { CardSearchResult } from "@/lib/scryfall";

export type RarityFilter = "common" | "uncommon" | "rare" | "mythic" | "special";
export type ColorFilter = "W" | "U" | "B" | "R" | "G" | "colorless";
export type PriceFilter = "usd" | "foil" | "etched";

export type AdvancedCardFilters = {
  rarities: RarityFilter[];
  colors: ColorFilter[];
  prices: PriceFilter[];
};

export const RARITY_FILTERS: Array<{ label: string; value: RarityFilter }> = [
  { label: "Common", value: "common" },
  { label: "Uncommon", value: "uncommon" },
  { label: "Rare", value: "rare" },
  { label: "Mythic", value: "mythic" },
  { label: "Special", value: "special" },
];

export const COLOR_FILTERS: Array<{ label: string; value: ColorFilter; symbol: string }> = [
  { label: "White", value: "W", symbol: "{W}" },
  { label: "Blue", value: "U", symbol: "{U}" },
  { label: "Black", value: "B", symbol: "{B}" },
  { label: "Red", value: "R", symbol: "{R}" },
  { label: "Green", value: "G", symbol: "{G}" },
  { label: "Colorless", value: "colorless", symbol: "{C}" },
];

export const PRICE_FILTERS: Array<{ label: string; value: PriceFilter }> = [
  { label: "Base price", value: "usd" },
  { label: "Foil price", value: "foil" },
  { label: "Rainbow price", value: "etched" },
];

export function filterCardsByAdvancedFilters(cards: CardSearchResult[], filters: AdvancedCardFilters) {
  return cards.filter((card) => {
    const matchesRarity =
      !filters.rarities.length || filters.rarities.includes(card.rarity.toLowerCase() as RarityFilter);
    const matchesColor = !filters.colors.length || getCardColorKey(card.colors) === getSelectedColorKey(filters.colors);
    const matchesPrice =
      !filters.prices.length ||
      filters.prices.some((priceFilter) => {
        if (priceFilter === "usd") {
          return Boolean(card.prices.usd);
        }

        if (priceFilter === "foil") {
          return Boolean(card.prices.usdFoil);
        }

        return Boolean(card.prices.usdEtched);
      });

    return matchesRarity && matchesColor && matchesPrice;
  });
}

export function toggleFilterValue<TValue extends string>(activeValues: TValue[], nextValue: TValue) {
  return activeValues.includes(nextValue)
    ? activeValues.filter((value) => value !== nextValue)
    : [...activeValues, nextValue];
}

function getCardColorKey(colors: string[]) {
  return colors.length ? [...colors].sort().join(",") : "colorless";
}

function getSelectedColorKey(colors: ColorFilter[]) {
  return [...colors].sort().join(",");
}
