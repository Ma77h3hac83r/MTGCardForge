import { cn } from "@/lib/utils";

type ManaSymbolsProps = {
  value: string;
  className?: string;
  symbolClassName?: string;
};

type InlineManaTextProps = {
  value: string;
  className?: string;
};

type SetSymbolProps = {
  code: string;
  rarity?: string;
  className?: string;
};

const MANA_TOKEN_PATTERN = /(\{[^}]+\})/g;

const MANA_CLASS_OVERRIDES: Record<string, string> = {
  "∞": "infinity",
  "½": "half",
  CHAOS: "chaos",
  E: "e",
  Q: "untap",
  T: "tap",
};

export function ManaSymbols({ value, className, symbolClassName }: ManaSymbolsProps) {
  const tokens = tokenizeManaCost(value);

  return (
    <span aria-label={value} className={cn("inline-flex flex-wrap items-center gap-1", className)}>
      {tokens.map((token, index) => (
        <ManaSymbol className={symbolClassName} key={`${token}-${index}`} token={token} />
      ))}
    </span>
  );
}

export function InlineManaText({ value, className }: InlineManaTextProps) {
  const parts = value.split(MANA_TOKEN_PATTERN).filter(Boolean);

  return (
    <span className={className}>
      {parts.map((part, index) => {
        if (isManaToken(part)) {
          return (
            <ManaSymbol
              className="mx-0.5 text-[0.95em]"
              key={`${part}-${index}`}
              token={stripTokenBraces(part)}
            />
          );
        }

        return <span key={`${part}-${index}`}>{part}</span>;
      })}
    </span>
  );
}

export function SetSymbol({ code, rarity = "common", className }: SetSymbolProps) {
  if (!code) {
    return null;
  }

  const normalizedCode = code.toLowerCase();
  const normalizedRarity = normalizeRarity(rarity);

  return (
    <span
      aria-label={`${code.toUpperCase()} ${normalizedRarity} set symbol`}
      className={cn(
        "ss ss-grad text-xl",
        `ss-${normalizedCode}`,
        `ss-${normalizedRarity}`,
        className,
      )}
      role="img"
      title={`${code.toUpperCase()} ${normalizedRarity}`}
    />
  );
}

function ManaSymbol({ token, className }: { token: string; className?: string }) {
  const symbolClass = manaTokenToClass(token);

  if (!symbolClass) {
    return <span className={className}>{`{${token}}`}</span>;
  }

  return (
    <span
      aria-label={`{${token}}`}
      className={cn("ms ms-cost", symbolClass, className)}
      role="img"
      title={`{${token}}`}
    />
  );
}

function tokenizeManaCost(value: string) {
  const tokens = value.match(/\{([^}]+)\}/g);

  if (!tokens) {
    return [value];
  }

  return tokens.map(stripTokenBraces);
}

function stripTokenBraces(value: string) {
  return value.replace(/^\{|\}$/g, "");
}

function isManaToken(value: string) {
  return value.startsWith("{") && value.endsWith("}");
}

function manaTokenToClass(token: string) {
  const normalized = token.trim().toUpperCase();

  if (!normalized) {
    return null;
  }

  const override = MANA_CLASS_OVERRIDES[normalized];
  if (override) {
    return `ms-${override}`;
  }

  if (/^\d+$/.test(normalized) || normalized === "X" || normalized === "Y" || normalized === "Z") {
    return `ms-${normalized.toLowerCase()}`;
  }

  if (/^[WUBRGCSP]$/.test(normalized)) {
    return `ms-${normalized.toLowerCase()}`;
  }

  const splitClass = normalized.replace(/\//g, "").toLowerCase();
  if (/^(?:[wubrgc2][wubrgp]|[wubrg][wubrg]p)$/.test(splitClass)) {
    return `ms-${splitClass}`;
  }

  return null;
}

function normalizeRarity(rarity: string) {
  const normalized = rarity.toLowerCase();

  if (normalized === "special" || normalized === "bonus") {
    return "mythic";
  }

  if (["common", "uncommon", "rare", "mythic"].includes(normalized)) {
    return normalized;
  }

  return "common";
}
