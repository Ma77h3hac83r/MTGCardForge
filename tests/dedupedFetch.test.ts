import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clearInFlightRequestsForTests,
  dedupedFetch,
  getInFlightRequestCountForTests,
} from "@/lib/dedupedFetch";

function deferredResponse(payload: unknown, status = 200) {
  let resolve!: (value: Response) => void;
  const promise = new Promise<Response>((nextResolve) => {
    resolve = nextResolve;
  });

  return {
    promise,
    resolve: () =>
      resolve(
        new Response(JSON.stringify(payload), {
          status,
          headers: { "Content-Type": "application/json" },
        }),
      ),
  };
}

describe("dedupedFetch", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    clearInFlightRequestsForTests();
  });

  it("shares one network request for concurrent identical GETs", async () => {
    const pending = deferredResponse({ data: ["Sol Ring"] });
    const fetchMock = vi.fn(() => pending.promise);
    vi.stubGlobal("fetch", fetchMock);

    const first = dedupedFetch("https://api.scryfall.com/cards/autocomplete?q=sol");
    const second = dedupedFetch("https://api.scryfall.com/cards/autocomplete?q=sol");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(getInFlightRequestCountForTests()).toBe(1);

    pending.resolve();

    const [firstResponse, secondResponse] = await Promise.all([first, second]);
    const firstPayload = await firstResponse.json();
    const secondPayload = await secondResponse.json();

    expect(firstPayload).toEqual({ data: ["Sol Ring"] });
    expect(secondPayload).toEqual({ data: ["Sol Ring"] });
    expect(getInFlightRequestCountForTests()).toBe(0);
  });

  it("does not cancel the shared request when one waiter aborts", async () => {
    const pending = deferredResponse({ data: ["Island"] });
    const fetchMock = vi.fn(() => pending.promise);
    vi.stubGlobal("fetch", fetchMock);

    const controller = new AbortController();
    const aborted = dedupedFetch("https://api.scryfall.com/cards/autocomplete?q=isl", {
      signal: controller.signal,
    });
    const kept = dedupedFetch("https://api.scryfall.com/cards/autocomplete?q=isl");

    controller.abort();

    await expect(aborted).rejects.toMatchObject({ name: "AbortError" });

    pending.resolve();
    const keptResponse = await kept;
    expect(await keptResponse.json()).toEqual({ data: ["Island"] });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("de-dupes POSTs with identical string bodies", async () => {
    const pending = deferredResponse({ data: [] });
    const fetchMock = vi.fn(() => pending.promise);
    vi.stubGlobal("fetch", fetchMock);

    const body = JSON.stringify({ identifiers: [{ name: "Sol Ring" }] });
    const first = dedupedFetch("https://api.scryfall.com/cards/collection", {
      method: "POST",
      body,
      headers: { "Content-Type": "application/json" },
    });
    const second = dedupedFetch("https://api.scryfall.com/cards/collection", {
      method: "POST",
      body,
      headers: { "Content-Type": "application/json" },
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    pending.resolve();
    await Promise.all([first, second]);
  });

  it("does not de-dupe different URLs", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) =>
      Promise.resolve(
        new Response(JSON.stringify({ url: String(input) }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await Promise.all([
      dedupedFetch("https://api.scryfall.com/cards/autocomplete?q=a"),
      dedupedFetch("https://api.scryfall.com/cards/autocomplete?q=b"),
    ]);

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
