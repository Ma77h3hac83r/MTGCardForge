import react from "@astrojs/react";
import { defineConfig } from "astro/config";
import { handleDeckImportRequest } from "./public/deckImportApi.mjs";

export default defineConfig({
  output: "static",
  integrations: [react()],
  vite: {
    plugins: [deckImportDevProxy()],
  },
});

function deckImportDevProxy() {
  return {
    name: "deck-import-dev-proxy",
    configureServer(server) {
      server.middlewares.use("/api/deck-import", async (request, response) => {
        const proxyResponse = await handleDeckImportRequest(
          new Request(`http://127.0.0.1${request.url}`, {
            method: request.method,
            signal: request.signal,
          }),
        );
        const body = await proxyResponse.text();

        response.writeHead(proxyResponse.status, Object.fromEntries(proxyResponse.headers));
        response.end(body);
      });
    },
  };
}
