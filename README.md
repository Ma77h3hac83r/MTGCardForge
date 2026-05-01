# MTG Card Forge

MTG Card Forge is a static Magic: The Gathering card research site built with Astro, React islands, TypeScript, and Tailwind CSS. It runs entirely in the browser and uses public Scryfall data for card metadata, images, printings, prices, and TCGplayer purchase links.

## Features

- **Printings**: Search exact card names, view card details, compare paper printings, and filter by frame and treatment.
- **Sets**: Search set codes or names, include related subsets, view set stats, and browse cards grouped by set section.
- **Tokens**: Search token names or cards that create tokens, compare token variants, view token colors, and find producer cards.
- **Artists**: Search artist names and browse their paper card artwork, sorted newest first.
- **Deck**: Paste a deck list or import a Moxfield or Archidekt URL, then group resolved cards by card type using low-cost USD printings.

## Data Sources

- [Scryfall API](https://scryfall.com/docs/api) for card data, images, printings, set metadata, prices, and purchase links.
- [TCGplayer](https://www.tcgplayer.com/) links when Scryfall provides them.
- [Keyrune](https://github.com/andrewgioia/keyrune) for MTG set symbols.
- [Mana](https://github.com/andrewgioia/mana) for mana symbols.

No backend server, database, scraping, or private API credentials are required for the app itself.