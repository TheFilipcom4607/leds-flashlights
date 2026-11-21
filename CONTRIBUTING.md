# Contributing

Thanks for helping keep the [Flashlight Index](https://light.thefilip.com/flashlights/) and
[Emitter Index](https://light.thefilip.com/leds/) accurate. There are two ways to help.

## 1. Report it (no code needed)

Open an issue with one of the forms. You need a GitHub account.

- **[Fix something](../../issues/new?template=fix.yml)**: a spec, price, tint or LED option is wrong
  or missing. The **Suggest a fix** link at the bottom of any light or LED on the site fills in which
  item it is for you.
- **[Add a light](../../issues/new?template=add-light.yml)**: a flashlight or headlamp that isn't listed.
- **[Add an LED](../../issues/new?template=add-led.yml)**: an emitter that isn't listed.

## 2. Edit the data yourself (pull request)

The site is static: two pages and two data files, no build step.

| What | File |
| --- | --- |
| Lights (specs, prices, LED options, tints) | `public/flashlights/lights.clean.json` |
| LEDs (output, CRI, candela, beam, "best for", alternatives) | `public/leds/emitters.json` |

1. Edit the file. Keep the existing field names and shape; copy a similar entry if you're adding one.
   For house-brand LEDs (Convoy, Noctigon, NiteLab, FireflyLite, …), `maker` is the brand selling it;
   if a different fab actually produces the die, add `"manufactured_by": "…"`. Leave it out when the
   maker manufactures the LED themselves.
2. Run `python3 tools/validate.py` (Python 3, nothing to install). It checks for missing fields,
   impossible numbers and duplicate names, and says exactly what's wrong.
3. Open a pull request with a source for each changed fact. The same check runs on every pull request.

To see your change, run `python3 -m http.server 8765 --directory public` and open
<http://localhost:8765/>.

### Sources

Every fact needs one. In order of preference:

1. The maker's datasheet or the official store page
2. A review with measurements (lumens, candela, CRI from a spectrometer)
3. A dealer listing or seller claim. For LEDs, set `"basis": "estimate"` so the site labels it as one.

Forum hearsay and "I think" can't be checked, so they won't be merged.

### Things to know

- **A light's ID is its name.** Brand + model + variant becomes the link, e.g. Convoy S21E →
  `?light=convoy-s21e`. Renaming a light breaks links to it, so only rename to fix a mistake.
  Two lights can't share a name; give one a variant (e.g. "Titanium").
- **`id` in `lights.clean.json` is just the row's position** (0, 1, 2…). If you add a light, append it
  at the end with the next number.
- **LED names link the two files.** A light's LED option (`family`, e.g. "519A") is matched to an LED in
  `emitters.json` by name. If stores call an LED something else, add that name to the LED's `alts` list.
- **LED lumens are per LED** in a good light at turbo, not a whole multi-LED light's output.
- **Prices are in USD** from the official store (or the dealer named in the page footer).
- **No paid placement.** Apart from the labelled Editor's picks (a short hand-picked list in
  `public/flashlights/index.html`, `EDITOR`), the "Recommended" order is computed from the data; its
  rules are shown on the page under the sort box.
