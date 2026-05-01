export type CardPriceSummary = {
  usd: string | null;
  usdFoil: string | null;
  usdEtched: string | null;
  eur: string | null;
  tix: string | null;
};

export type CardImageSummary = {
  label: string;
  small: string | null;
  normal: string | null;
  large: string | null;
  artCrop: string | null;
};

export type CardSearchResult = {
  id: string;
  layout: string | null;
  name: string;
  setName: string;
  setCode: string;
  collectorNumber: string;
  rarity: string;
  typeLine: string;
  manaCost: string | null;
  oracleText: string | null;
  power: string | null;
  toughness: string | null;
  colors: string[];
  legalFormats: string[];
  artist: string | null;
  prices: CardPriceSummary;
  images: CardImageSummary[];
  printsSearchUri: string | null;
  scryfallUri: string;
  tcgplayerUri: string | null;
  allParts: ScryfallRelatedCard[];
};

type ScryfallImageUris = {
  small?: string;
  normal?: string;
  large?: string;
  art_crop?: string;
};

type ScryfallCardFace = {
  name?: string;
  mana_cost?: string;
  type_line?: string;
  oracle_text?: string;
  image_uris?: ScryfallImageUris;
};

export type ScryfallRelatedCard = {
  id: string;
  object?: string;
  component: string;
  name: string;
  type_line: string;
  uri: string;
};

export type ScryfallCard = {
  id: string;
  layout?: string;
  name: string;
  set_name?: string;
  set?: string;
  collector_number?: string;
  rarity?: string;
  type_line?: string;
  mana_cost?: string;
  oracle_text?: string;
  power?: string;
  toughness?: string;
  colors?: string[];
  legalities?: Record<string, string>;
  artist?: string;
  prices?: Partial<Record<"usd" | "usd_foil" | "usd_etched" | "eur" | "tix", string | null>>;
  image_uris?: ScryfallImageUris;
  card_faces?: ScryfallCardFace[];
  all_parts?: ScryfallRelatedCard[];
  prints_search_uri?: string;
  scryfall_uri?: string;
  purchase_uris?: {
    tcgplayer?: string;
  };
};

const SCRYFALL_API_HOST = "api.scryfall.com";
const SCRYFALL_WEB_HOST = "scryfall.com";
const SCRYFALL_IMAGE_DOMAIN = "scryfall.io";
const TCGPLAYER_DOMAIN = "tcgplayer.com";

const SUMMARY_FORMATS = [
  "standard",
  "pioneer",
  "modern",
  "legacy",
  "vintage",
  "commander",
  "pauper",
];

export function normalizeScryfallCard(card: ScryfallCard): CardSearchResult {
  return {
    id: card.id,
    layout: card.layout ?? null,
    name: card.name,
    setName: card.set_name ?? "Unknown set",
    setCode: (card.set ?? "").toUpperCase(),
    collectorNumber: card.collector_number ?? "N/A",
    rarity: card.rarity ?? "unknown",
    typeLine: card.type_line ?? getFaceJoinedValue(card.card_faces, "type_line") ?? "Unknown type",
    manaCost: card.mana_cost || getFaceJoinedValue(card.card_faces, "mana_cost"),
    oracleText: card.oracle_text || getFaceJoinedValue(card.card_faces, "oracle_text"),
    power: card.power ?? null,
    toughness: card.toughness ?? null,
    colors: card.colors ?? [],
    legalFormats: getLegalFormats(card.legalities),
    artist: card.artist ?? null,
    prices: {
      usd: card.prices?.usd ?? null,
      usdFoil: card.prices?.usd_foil ?? null,
      usdEtched: card.prices?.usd_etched ?? null,
      eur: card.prices?.eur ?? null,
      tix: card.prices?.tix ?? null,
    },
    images: getImages(card),
    printsSearchUri: getSafeScryfallApiUrl(card.prints_search_uri),
    scryfallUri: getSafeScryfallWebUrl(card.scryfall_uri) ?? `https://scryfall.com/card/${card.id}`,
    tcgplayerUri: getSafeTcgplayerUrl(card.purchase_uris?.tcgplayer),
    allParts: card.all_parts ?? [],
  };
}

export function normalizeScryfallCards(cards: ScryfallCard[]): CardSearchResult[] {
  return cards.map(normalizeScryfallCard);
}

export function getPriceEntries(prices: CardPriceSummary) {
  return [
    { label: "USD", value: prices.usd ? `$${prices.usd}` : null },
  ].filter((entry): entry is { label: string; value: string } => Boolean(entry.value));
}

function getFaceJoinedValue(
  faces: ScryfallCardFace[] | undefined,
  field: "type_line" | "oracle_text" | "mana_cost",
) {
  const values = faces
    ?.map((face) => face[field])
    .filter((value): value is string => Boolean(value));

  if (!values?.length) {
    return null;
  }

  return values.join(" // ");
}

function getImages(card: ScryfallCard): CardImageSummary[] {
  if (card.image_uris) {
    const image = toImageSummary(card.name, card.image_uris);
    return hasImageSrc(image) ? [image] : [];
  }

  const faceImages = card.card_faces
    ?.filter((face) => face.image_uris)
    .map((face) => toImageSummary(face.name ?? card.name, face.image_uris as ScryfallImageUris))
    .filter(hasImageSrc);

  return faceImages?.length ? faceImages : [];
}

function hasImageSrc(image: CardImageSummary) {
  return Boolean(image.small || image.normal || image.large || image.artCrop);
}

function toImageSummary(label: string, imageUris: ScryfallImageUris): CardImageSummary {
  return {
    label,
    small: getSafeScryfallImageUrl(imageUris.small),
    normal: getSafeScryfallImageUrl(imageUris.normal),
    large: getSafeScryfallImageUrl(imageUris.large),
    artCrop: getSafeScryfallImageUrl(imageUris.art_crop),
  };
}

function getLegalFormats(legalities: ScryfallCard["legalities"]) {
  if (!legalities) {
    return [];
  }

  return SUMMARY_FORMATS.filter((format) => legalities[format] === "legal");
}

export function getSafeScryfallApiUrl(value: string | null | undefined) {
  return getSafeHttpUrl(value, (url) => url.hostname === SCRYFALL_API_HOST);
}

function getSafeScryfallWebUrl(value: string | null | undefined) {
  return getSafeHttpUrl(value, (url) => url.hostname === SCRYFALL_WEB_HOST);
}

function getSafeScryfallImageUrl(value: string | null | undefined) {
  return getSafeHttpUrl(value, (url) => url.hostname === SCRYFALL_IMAGE_DOMAIN || url.hostname.endsWith(`.${SCRYFALL_IMAGE_DOMAIN}`));
}

function getSafeTcgplayerUrl(value: string | null | undefined) {
  return getSafeHttpUrl(value, (url) => url.hostname === TCGPLAYER_DOMAIN || url.hostname.endsWith(`.${TCGPLAYER_DOMAIN}`));
}

function getSafeHttpUrl(value: string | null | undefined, isAllowed: (url: URL) => boolean) {
  if (!value) {
    return null;
  }

  try {
    const url = new URL(value);

    if (url.protocol !== "https:" || !isAllowed(url)) {
      return null;
    }

    return url.toString();
  } catch {
    return null;
  }
}
