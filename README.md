# LED & flashlight indexes

Static, dependency-free sites: the LED emitter index (`public/leds/`) and the
flashlight index (`public/flashlights/`) are single-page apps over JSON data
files. `leds/` fetches `flashlights/led_info.json` for cross-referencing and
`flashlights/lights.clean.json` (lazily) for the "choosing for a flashlight"
picker, so both directories must stay siblings inside `public/`. `emitters.json`
carries verdict/beam/reputation annotations added by `enrich_emitters.py`
(in the Flashlight Master List `compare/` folder).

## Deploy (Cloudflare Workers, static assets)

Connect the repo in the Cloudflare dashboard (Workers & Pages → Create → Workers)
with build command `npx wrangler deploy`; `wrangler.toml` serves `public/` as
static assets. Or from the CLI:

```
npx wrangler deploy
```
