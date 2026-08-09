import { useEffect } from "react";
import { fetchArtistNameSuggestions } from "@/lib/autocomplete";
import { fetchAllSets } from "@/lib/setSearch";

const PREFETCH_ROUTES = ["/printings", "/sets", "/tokens", "/artists", "/deck"];

/**
 * Warms stable catalogs and prefetches tool routes once the homepage is idle.
 */
export default function HomeIdlePrefetch() {
  useEffect(() => {
    let cancelled = false;
    let idleId: number | undefined;
    let timeoutId: number | undefined;

    const run = () => {
      if (cancelled) {
        return;
      }

      void fetchAllSets().catch(() => {
        // Prefetch is best-effort.
      });

      // Touch artist catalog (cached) without needing a real user query UI.
      void fetchArtistNameSuggestions("aa").catch(() => {
        // Prefetch is best-effort.
      });

      for (const href of PREFETCH_ROUTES) {
        if (document.querySelector(`link[rel="prefetch"][href="${href}"]`)) {
          continue;
        }

        const link = document.createElement("link");
        link.rel = "prefetch";
        link.href = href;
        link.as = "document";
        document.head.appendChild(link);
      }
    };

    if (typeof window.requestIdleCallback === "function") {
      idleId = window.requestIdleCallback(run, { timeout: 2500 });
    } else {
      timeoutId = window.setTimeout(run, 1200);
    }

    return () => {
      cancelled = true;

      if (idleId != null && typeof window.cancelIdleCallback === "function") {
        window.cancelIdleCallback(idleId);
      }

      if (timeoutId != null) {
        window.clearTimeout(timeoutId);
      }
    };
  }, []);

  return null;
}
