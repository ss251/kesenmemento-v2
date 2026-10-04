# Contributing

Thanks for your interest in KesenMemento v2 (the app is called Kesennuma Living City). Fixes, corrections to the map
data, new landmark references, translations and documentation are all welcome.

## Set up

You need [Bun](https://bun.sh) 1.3 or newer and a desktop browser with WebGL2.

```sh
bun install
bun test                                          # the unit tests
bun run build                                     # bundles src/anime into dist/
bun run scripts/serve.js --port 8787 --no-build   # then open http://127.0.0.1:8787/
```

If your shell sets `NODE_OPTIONS` (for example for a debugger), prefix the commands with `env -u NODE_OPTIONS`.

Please run `bun test` before you open a pull request, and add or update a test when you change behaviour. The layout, the
data fold, the landmarks and the live-data parsers each have tests under `test/`. Where a change is visible, a
screenshot in the pull request helps (do not commit large images; see below). The project layout is described in the
[README](README.md) and in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Commits and pull requests

- Use [Conventional Commits](https://www.conventionalcommits.org): `feat(town): ...`, `fix(pad): ...`,
  `docs(ship): ...`, `test(layout): ...`, `refactor`, `chore`.
- Keep commits small and focused, one idea each. Keep pull requests focused too.
- Write in English or Japanese. Strings the app shows are in `data/i18n.json` (and `data/ui-touch-i18n.json`,
  `data/ship/i18n.json`) in both languages; keep them in step.

## What must never be committed

- **Secrets:** API keys, tokens, passwords, `.env` files, private URLs. If you find one, report it (see
  [SECURITY.md](SECURITY.md)) instead of opening a public issue.
- **Personal photos or personal data:** photos of people, residents' faces or addresses, GPS tracks, phone or message
  exports, and any data scraped about private individuals. Survey photos stay under `raw/`, which is git-ignored.
- **Third-party imagery or content you do not have the right to share:** screenshots of commercial map or imagery
  services, copyrighted photographs, logos, or text copied from other sites. Reference photos are used to check shapes
  and colours only and are never stored here.
- **Large generated files:** `raw/`, `dist/`, `data/cache/` and other regenerable intermediates are ignored. Stage files
  by explicit path instead of `git add -A` so that nothing large or private slips in.

## Data and credit

Every dataset keeps its credit line on screen. If you add a data source, add it to
[docs/DATA-SOURCES.md](docs/DATA-SOURCES.md) and to `scripts/anime/enrich/sources.js` with its licence and attribution,
and check that the licence allows use and redistribution. Real names on shop signs come only from open sources
(OpenStreetMap, 国土地理院); other shops use fictional names, and `test/v3-town.test.js` guards that list against real
brands.

## Code of conduct and licence

By taking part you agree to follow the [Code of Conduct](CODE_OF_CONDUCT.md). Contributions are accepted under the
project's licences: code under the [MIT licence](LICENSE), documentation under CC BY 4.0, and data as described in
`data/LICENSE.md`.
