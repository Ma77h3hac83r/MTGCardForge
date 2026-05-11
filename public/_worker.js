import { handleDeckImportRequest } from "./deckImportApi.mjs";
import { handleRandomPrintingsRequest, handleScryfallProxyRequest } from "./scryfallProxyApi.mjs";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/deck-import") {
      return handleDeckImportRequest(request);
    }

    if (url.pathname === "/api/scryfall") {
      return handleScryfallProxyRequest(request);
    }

    if (url.pathname === "/api/random-printings") {
      return handleRandomPrintingsRequest(request);
    }

    return env.ASSETS.fetch(request);
  },
};
