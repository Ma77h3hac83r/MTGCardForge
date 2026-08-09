type InFlightRequest = {
  promise: Promise<Response>;
};

const inFlightRequests = new Map<string, InFlightRequest>();

/**
 * Like fetch(), but concurrent identical requests share one network call.
 * Each caller receives a cloned Response so bodies can be read independently.
 *
 * Caller AbortSignals only cancel that waiter's promise; the shared request
 * keeps running for any other waiters.
 */
export async function dedupedFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const method = (init.method ?? "GET").toUpperCase();
  const url = String(input);
  const bodyKey = getBodyKey(init.body);

  // Only de-dupe idempotent/shared GETs and POSTs with a stable string body
  // (e.g. Scryfall /cards/collection). Skip streaming or opaque bodies.
  if ((method !== "GET" && method !== "POST") || (method === "POST" && bodyKey === null && init.body != null)) {
    return fetch(input, init);
  }

  const key = `${method} ${url} ${bodyKey ?? ""}`;
  const { signal, ...sharedInit } = init;

  let entry = inFlightRequests.get(key);

  if (!entry) {
    const networkPromise = fetch(input, {
      ...sharedInit,
      method,
      // Shared request is not tied to any single caller's signal.
      signal: undefined,
    });

    const trackedPromise = networkPromise.finally(() => {
      const current = inFlightRequests.get(key);

      if (current?.promise === trackedPromise) {
        inFlightRequests.delete(key);
      }
    });

    entry = { promise: trackedPromise };
    inFlightRequests.set(key, entry);
  }

  return waitForSharedResponse(entry.promise, signal);
}

export function getInFlightRequestCountForTests() {
  return inFlightRequests.size;
}

export function clearInFlightRequestsForTests() {
  inFlightRequests.clear();
}

async function waitForSharedResponse(shared: Promise<Response>, signal?: AbortSignal | null) {
  if (!signal) {
    const response = await shared;
    return cloneSharedResponse(response);
  }

  if (signal.aborted) {
    throw new DOMException("Aborted", "AbortError");
  }

  return new Promise<Response>((resolve, reject) => {
    const onAbort = () => {
      reject(new DOMException("Aborted", "AbortError"));
    };

    signal.addEventListener("abort", onAbort, { once: true });

    shared.then(
      (response) => {
        signal.removeEventListener("abort", onAbort);

        if (signal.aborted) {
          reject(new DOMException("Aborted", "AbortError"));
          return;
        }

        try {
          resolve(cloneSharedResponse(response));
        } catch (error) {
          reject(error);
        }
      },
      (error) => {
        signal.removeEventListener("abort", onAbort);
        reject(error);
      },
    );
  });
}

/**
 * Real Response objects must be cloned so each waiter can read the body.
 * Test mocks often return plain objects without clone(); pass those through.
 */
function cloneSharedResponse(response: Response) {
  if (typeof response.clone === "function") {
    return response.clone();
  }

  return response;
}

function getBodyKey(body: BodyInit | null | undefined) {
  if (body == null) {
    return "";
  }

  if (typeof body === "string") {
    return body;
  }

  // Non-string bodies can't be keyed safely for de-dupe.
  return null;
}
