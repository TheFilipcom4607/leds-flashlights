# LED & flashlight indexes

Static, dependency-free sites: the LED emitter index (`/leds/`) and the flashlight
index (`/flashlights/`) are single-page apps over JSON data files. `leds/` fetches
`flashlights/led_info.json` for cross-referencing, so both directories must stay
siblings at the repo root.

## Deploy (Cloudflare Workers, static assets)

Connect the repo in the Cloudflare dashboard (Workers & Pages → Create → Workers)
with build command `npx wrangler deploy`; `wrangler.toml` serves the repo root as
static assets. Or from the CLI:

```
npx wrangler deploy
```
