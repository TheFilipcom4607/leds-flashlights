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
static assets. Or from the CLI:

```
npx wrangler deploy
```
