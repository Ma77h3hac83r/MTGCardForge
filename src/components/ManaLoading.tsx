import { ManaSymbols } from "@/components/CardSymbols";

const MANA_SEQUENCE = ["{W}", "{U}", "{B}", "{R}", "{G}", "{C}"];

type ManaLoadingProps = {
  label?: string;
};

export function ManaLoading({ label = "Loading cards" }: ManaLoadingProps) {
  return (
    <div
      aria-label={label}
      className="flex min-h-24 items-center justify-center rounded-lg border bg-card p-6"
      role="status"
    >
      <span className="sr-only">{label}</span>
      <div className="flex items-center gap-3 text-2xl" aria-hidden="true">
        {MANA_SEQUENCE.map((symbol, index) => (
          <span className="animate-bounce" key={symbol} style={{ animationDelay: `${index * 90}ms` }}>
            <ManaSymbols
              symbolClassName="shadow-sm"
              value={symbol}
            />
          </span>
        ))}
      </div>
    </div>
  );
}
