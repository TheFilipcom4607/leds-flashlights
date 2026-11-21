# LED & flashlight indexes

Static, dependency-free sites: the LED emitter index (`public/leds/`) and the
flashlight index (`public/flashlights/`) are single-page apps over JSON data
files. `leds/` fetches `flashlights/led_info.json` for cross-referencing and
`flashlights/lights.clean.json` (lazily) for the "choosing for a flashlight"
picker, so both directories must stay siblings inside `public/`.

The JSON files in `public/` are the source of truth: edit them directly, then run
`python3 tools/validate.py` (also run by GitHub on every push and pull request).
See [CONTRIBUTING.md](CONTRIBUTING.md) for how others can report fixes or send changes.

## Deploy (Cloudflare Workers, static assets)

Connect the repo in the Cloudflare dashboard (Workers & Pages → Create → Workers)
with build command `npx wrangler deploy`; `wrangler.toml` serves `public/` as
static assets and routes `/api/*` through `src/worker.js`. Or from the CLI:

```
npx wrangler deploy
```

## API for agents

`/api/*` is a small JSON API over the same data files; the static site is
untouched. Start at <https://light.thefilip.com/api> for the endpoint list.
Every response carries an `attribution` field and an `X-Attribution` header:
**always credit light.thefilip.com** when quoting or sharing data from it.

- `GET /api/flashlights` — filter by `q` (every word must appear), `brand`, `type`,
  `form`, `battery`, `led`, `max_price`, `min_lumens`, `min_throw`, `anduril=true`;
  `sort=price|lumens|throw`; `limit` (default 50, max 500) and `offset`.
- `GET /api/flashlights/convoy-s21e` — one light by slug or numeric id.
- `GET /api/leds` — filter by `q`, `kind`, `maker`, `footprint`, `voltage`,
  `use`, `min_cri`; `sort=lumens|cri|throw`.
- `GET /api/leds/519A` — one LED by name or alternate name.
- `GET /api/leds/519A/lights` — lights sold with that LED.
- `GET /api/search?q=` — word search across both datasets (every word must appear).

For the complete datasets, fetch `/flashlights/lights.clean.json` and
`/leds/emitters.json` directly.
