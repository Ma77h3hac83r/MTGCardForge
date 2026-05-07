import { handleDeckImportRequest } from "./deckImportApi.mjs";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/deck-import") {
      return handleDeckImportRequest(request);
    }

    return env.ASSETS.fetch(request);
  },
};
