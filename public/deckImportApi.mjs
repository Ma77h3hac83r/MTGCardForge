const JSON_HEADERS = {
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Origin": "*",
  "Content-Type": "application/json; charset=utf-8",
};

const MOXFIELD_API_URLS = [
  "https://api2.moxfield.com/v3/decks/all/",
  "https://api2.moxfield.com/v2/decks/all/",
  "https://api.moxfield.com/v2/decks/all/",
];

export async function handleDeckImportRequest(request) {
  if (request.method === "OPTIONS") {
    return new Response(null, { headers: JSON_HEADERS, status: 204 });
  }

  if (request.method !== "GET") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  const requestUrl = new URL(request.url);
  const deckUrl = requestUrl.searchParams.get("url");

  if (!deckUrl) {
    return jsonResponse({ error: "Missing deck URL." }, 400);
  }

  try {
    const sourceUrl = new URL(deckUrl);
    const cards = await fetchDeckCards(sourceUrl, request.signal);
    return jsonResponse({ cards });
  } catch (error) {
    return jsonResponse(
      { error: error instanceof Error ? error.message : "Unable to import this deck URL." },
      502,
    );
  }
}

async function fetchDeckCards(url, signal) {
  if (isMoxfieldUrl(url)) {
    return fetchMoxfieldCards(url, signal);
  }

  if (isArchidektUrl(url)) {
    return fetchArchidektCards(url, signal);
  }

  throw new Error("Only Moxfield and Archidekt deck URLs are supported.");
}

async function fetchMoxfieldCards(url, signal) {
  const deckId = url.pathname.match(/\/decks\/([^/?#]+)/i)?.[1];

  if (!deckId || !/^[A-Za-z0-9_-]+$/.test(deckId)) {
    return [];
  }

  for (const baseUrl of MOXFIELD_API_URLS) {
    const response = await fetch(`${baseUrl}${encodeURIComponent(deckId)}`, {
      headers: {
        Accept: "application/json",
        "User-Agent": "Mozilla/5.0 MTGCardForge/1.0",
      },
      signal,
    });

    if (!response.ok) {
      continue;
    }

    const payload = await response.json();
    const cards = normalizeMoxfieldCards(payload);

    if (cards.length) {
      return cards;
    }
  }

  throw new Error("Unable to load this Moxfield deck.");
}

function normalizeMoxfieldCards(payload) {
  const legacyCards = [
    ...getMoxfieldRecordCards(payload.commanders),
    ...getMoxfieldRecordCards(payload.mainboard),
    ...getMoxfieldRecordCards(payload.companions),
    ...getMoxfieldRecordCards(payload.sideboard),
  ];

  if (legacyCards.length) {
    return mergeCardQuantities(legacyCards);
  }

  return mergeCardQuantities([
    ...getMoxfieldRecordCards(payload.boards?.commanders?.cards),
    ...getMoxfieldRecordCards(payload.boards?.mainboard?.cards),
    ...getMoxfieldRecordCards(payload.boards?.companions?.cards),
    ...getMoxfieldRecordCards(payload.boards?.sideboard?.cards),
  ]);
}

function getMoxfieldRecordCards(board) {
  return Object.entries(board ?? {})
    .map(([fallbackName, entry]) => ({
      name: entry?.card?.name ?? entry?.card?.cardName ?? fallbackName,
      quantity: entry?.quantity ?? entry?.qty ?? 1,
    }))
    .filter(isDeckInputCard);
}

async function fetchArchidektCards(url, signal) {
  const deckId = url.pathname.match(/\/decks\/(\d+)/i)?.[1];

  if (!deckId) {
    return [];
  }

  const response = await fetch(`https://archidekt.com/api/decks/${deckId}/`, {
    headers: { Accept: "application/json" },
    signal,
  });

  if (!response.ok) {
    throw new Error("Unable to load this Archidekt deck.");
  }

  return mergeCardQuantities(normalizeArchidektCards(await response.json()));
}

function normalizeArchidektCards(payload) {
  const includedCategories = new Map(
    (payload.categories ?? []).map((category) => [category.name, category.includedInDeck !== false]),
  );

  return (payload.cards ?? [])
    .filter((entry) => isIncludedArchidektEntry(entry, includedCategories))
    .map((entry) => ({
      name: getArchidektCardName(entry),
      quantity: entry.quantity ?? entry.qty ?? 1,
    }))
    .filter(isDeckInputCard);
}

function isIncludedArchidektEntry(entry, includedCategories) {
  if (!entry?.categories?.length || !includedCategories.size) {
    return true;
  }

  return entry.categories.some((category) => includedCategories.get(category) !== false);
}

function getArchidektCardName(entry) {
  return (
    entry.card?.oracleCard?.name ??
    entry.card?.oracle_card?.name ??
    entry.card?.displayName ??
    entry.card?.name ??
    ""
  );
}

function mergeCardQuantities(cards) {
  const mergedCards = new Map();

  for (const card of cards) {
    const key = getCardNameKey(card.name);
    const existingCard = mergedCards.get(key);

    if (existingCard) {
      existingCard.quantity += card.quantity;
    } else {
      mergedCards.set(key, { ...card });
    }
  }

  return Array.from(mergedCards.values());
}

function isDeckInputCard(card) {
  return Boolean(card.name && Number.isFinite(card.quantity) && card.quantity > 0);
}

function isMoxfieldUrl(url) {
  return url.protocol === "https:" && /(^|\.)moxfield\.com$/i.test(url.hostname);
}

function isArchidektUrl(url) {
  return url.protocol === "https:" && /(^|\.)archidekt\.com$/i.test(url.hostname);
}

function getCardNameKey(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), { headers: JSON_HEADERS, status });
}
