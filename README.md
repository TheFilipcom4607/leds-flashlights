# LED & flashlight indexes

Static, dependency-free sites: the LED emitter index (`public/leds/`) and the
flashlight index (`public/flashlights/`) are single-page apps over JSON data
files. `leds/` fetches `flashlights/led_info.json` for cross-referencing, so
both directories must stay siblings inside `public/`.

## Deploy (Cloudflare Workers, static assets)

Connect the repo in the Cloudflare dashboard (Workers & Pages → Create → Workers)
with build command `npx wrangler deploy`; `wrangler.toml` serves `public/` as
static assets. Or from the CLI:

```
npx wrangler deploy
```
