import { useEffect, useRef } from "react";

const DEFAULT_DELAY_MS = 250;

/**
 * Runs an async fetcher after `delayMs` of idle deps, aborting in-flight work on change/unmount.
 */
export function useDebouncedAsync<TResult>(
  enabled: boolean,
  deps: unknown[],
  fetcher: (signal: AbortSignal) => Promise<TResult>,
  onResult: (result: TResult) => void,
  onError?: (error: unknown) => void,
  delayMs = DEFAULT_DELAY_MS,
) {
  const fetcherRef = useRef(fetcher);
  const onResultRef = useRef(onResult);
  const onErrorRef = useRef(onError);

  fetcherRef.current = fetcher;
  onResultRef.current = onResult;
  onErrorRef.current = onError;

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      try {
        const result = await fetcherRef.current(controller.signal);

        if (!controller.signal.aborted) {
          onResultRef.current(result);
        }
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }

        onErrorRef.current?.(error);
      }
    }, delayMs);

    return () => {
      controller.abort();
      window.clearTimeout(timeout);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deps provided by caller
  }, [enabled, delayMs, ...deps]);
}
