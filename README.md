# LED & flashlight indexes

Static, dependency-free sites: the LED emitter index (`/leds/`) and the flashlight
index (`/flashlights/`) are single-page apps over JSON data files. `leds/` fetches
`flashlights/led_info.json` for cross-referencing, so both directories must stay
siblings at the repo root.

## Deploy (Cloudflare Pages)

Connect the repo in the Cloudflare dashboard — no build step; `wrangler.toml` sets
the output dir to the repo root. Or from the CLI:

```
npx wrangler pages deploy
```
