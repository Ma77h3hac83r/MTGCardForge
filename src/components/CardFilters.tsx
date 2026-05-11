import type { ReactNode } from "react";
import { ManaSymbols } from "@/components/CardSymbols";
import {
  COLOR_FILTERS,
  PRICE_FILTERS,
  RARITY_FILTERS,
  type AdvancedCardFilters as AdvancedCardFilterState,
  type ColorFilter,
  type PriceFilter,
  type RarityFilter,
} from "@/lib/cardFilters";

export function FilteredResultsLayout({ children, filters }: { children: ReactNode; filters: ReactNode }) {
  return (
    <div className="grid gap-6 lg:grid-cols-[240px_minmax(0,1fr)] lg:items-start">
      <FilterPanel>{filters}</FilterPanel>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

export function FilterPanel({ children }: { children: ReactNode }) {
  return (
    <aside className="rounded-lg border bg-card p-3 shadow-sm lg:sticky lg:top-24" aria-label="Filters">
      <h3 className="px-1 pb-3 text-sm font-semibold tracking-normal">Filters</h3>
      <div className="space-y-3">{children}</div>
    </aside>
  );
}

export function CheckboxFilterGroup<TValue extends string>({
  disabled,
  label,
  onToggle,
  options,
  selectedValues,
  showManaSymbols = false,
}: {
  disabled: boolean;
  label: string;
  onToggle: (value: TValue) => void;
  options: Array<{ label: string; value: TValue; symbol?: string }>;
  selectedValues: TValue[];
  showManaSymbols?: boolean;
}) {
  return (
    <details className="rounded-md border bg-background/50">
      <summary className="cursor-pointer select-none px-3 py-2 text-sm font-medium">{label}</summary>
      <fieldset className="border-t px-3 py-3">
        <legend className="sr-only">{label}</legend>
        <div className="space-y-2">
          {options.map((option) => (
            <label
              className="flex min-h-8 items-center gap-2 rounded-md px-2 text-sm transition-colors hover:bg-muted"
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
    </details>
  );
}

export function AdvancedCardFilterSections({
  activeFilters,
  disabled,
  onColorToggle,
  onPriceToggle,
  onRarityToggle,
}: {
  activeFilters: AdvancedCardFilterState;
  disabled: boolean;
  onColorToggle: (color: ColorFilter) => void;
  onPriceToggle: (price: PriceFilter) => void;
  onRarityToggle: (rarity: RarityFilter) => void;
}) {
  return (
    <>
      <CheckboxFilterGroup
        disabled={disabled}
        label="Rarity"
        onToggle={onRarityToggle}
        options={RARITY_FILTERS}
        selectedValues={activeFilters.rarities}
      />
      <CheckboxFilterGroup
        disabled={disabled}
        label="Color"
        onToggle={onColorToggle}
        options={COLOR_FILTERS}
        selectedValues={activeFilters.colors}
        showManaSymbols
      />
      <CheckboxFilterGroup
        disabled={disabled}
        label="Price"
        onToggle={onPriceToggle}
        options={PRICE_FILTERS}
        selectedValues={activeFilters.prices}
      />
    </>
  );
}

export function AdvancedCardFilters({
  activeColors,
  activePrices,
  activeRarities,
  disabled,
  onColorToggle,
  onPriceToggle,
  onRarityToggle,
}: {
  activeColors: ColorFilter[];
  activePrices: PriceFilter[];
  activeRarities: RarityFilter[];
  disabled: boolean;
  onColorToggle: (color: ColorFilter) => void;
  onPriceToggle: (price: PriceFilter) => void;
  onRarityToggle: (rarity: RarityFilter) => void;
}) {
  return (
    <AdvancedCardFilterSections
      activeFilters={{ colors: activeColors, prices: activePrices, rarities: activeRarities }}
      disabled={disabled}
      onColorToggle={onColorToggle}
      onPriceToggle={onPriceToggle}
      onRarityToggle={onRarityToggle}
    />
  );
}
