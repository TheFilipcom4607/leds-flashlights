#!/usr/bin/env python3
"""Check the site's data files before they go live.

    python3 tools/validate.py          (exit code 1 if anything is wrong)

Checks public/flashlights/lights.clean.json and public/leds/emitters.json for missing
required fields, impossible numbers, broken links between the two, and duplicate IDs.
A light's permanent ID is its name (brand + model + variant, e.g. convoy-s21e), built
the same way as `slug()` in the pages, so names must stay unique. Standard library only.
"""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LIGHTS = ROOT / "public/flashlights/lights.clean.json"
EMITTERS = ROOT / "public/leds/emitters.json"

errors = []


def err(where, msg):
    errors.append(f"{where}: {msg}")


def slug(*parts):
    s = " ".join(p for p in parts if p).lower().replace("&", " and ").replace("+", " plus ")
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-")


def num(where, obj, key, lo, hi):
    v = obj.get(key)
    if v is None:
        return
    if not isinstance(v, (int, float)) or isinstance(v, bool):
        err(where, f"{key} should be a number, got {v!r}")
    elif not lo <= v <= hi:
        err(where, f"{key} {v} is outside {lo}–{hi}")


def text(where, obj, key):
    if not isinstance(obj.get(key), str) or not obj[key].strip():
        err(where, f"{key} is missing")


def link(where, url, what="url"):
    if not isinstance(url, str) or not re.match(r"https?://\S+$", url):
        err(where, f"{what} {url!r} is not a web link")


def check_tint(where, t):
    num(where, t, "cct", 1000, 10000)
    num(where, t, "cct_max", 1000, 10000)
    num(where, t, "cri", 50, 100)
    num(where, t, "lm", 1, 300000)


def check_lights(rows):
    seen = {}
    for i, r in enumerate(rows):
        where = f"lights[{i}] {r.get('brand')} {r.get('model')}"
        for k in ("brand", "model"):
            text(where, r, k)
        link(where, r.get("url"))
        if r.get("id") != i:
            err(where, f"id is {r.get('id')!r}; it must equal the row's position ({i})")
        s = slug(r.get("brand"), r.get("model"), r.get("variant"))
        if s in seen:
            err(where, f"same ID '{s}' as lights[{seen[s]}]; give one a different variant name")
        seen[s] = i
        num(where, r, "lumens", 1, 300000)
        num(where, r, "throw_m", 1, 6000)
        num(where, r, "weight_g", 1, 20000)
        num(where, r, "price", 0, 20000)
        num(where, r, "price_max", 0, 20000)
        if r.get("price") is not None and r.get("price_max") is not None and r["price_max"] < r["price"]:
            err(where, f"price_max {r['price_max']} is below price {r['price']}")
        if not isinstance(r.get("styles"), list):
            err(where, "styles should be a list")
        fams = set()
        for g in r.get("emitters") or []:
            for t in g.get("tiers") or []:
                p = t.get("price")
                if p and p.get("kind") not in ("incl", "add", "from"):
                    err(where, f"LED price kind {p.get('kind')!r} should be incl, add or from")
                for led in t.get("leds") or []:
                    if not isinstance(led.get("family"), str) or not led["family"]:
                        err(where, "an LED option has no name (family)")
                        continue
                    fams.add(led["family"])
                    for tint in led.get("tints") or []:
                        check_tint(f"{where} · {led['family']}", tint)
        for f in r.get("led_families") or []:
            if f not in fams and r.get("emitters"):
                err(where, f"led_families lists {f!r}, which isn't among its LED options")


def check_emitters(doc):
    goals = {u.get("goal") for u in doc.get("uses") or []}
    seen_id, seen_name = set(), {}
    # Names an "alternatives" entry may use, matched like idOf() in the LED page (parenthesised bits ignored).
    norm = lambda s: re.sub(r"\s*\(.*?\)", "", s).strip().lower()
    led_names = {norm(n) for x in doc.get("emitters") or [] for n in [x.get("name") or "", *(x.get("alts") or [])]}
    for i, e in enumerate(doc.get("emitters") or []):
        where = f"emitters[{i}] {e.get('maker')} {e.get('name')}"
        text(where, e, "name")
        if e.get("id") in seen_id:
            err(where, f"duplicate id {e.get('id')!r}")
        seen_id.add(e.get("id"))
        key = (e.get("maker"), e.get("name"))
        if key in seen_name:
            err(where, f"same maker and name as emitters[{seen_name[key]}]")
        seen_name[key] = i
        for lo, hi, a, b in (("lm_lo", "lm_hi", 1, 300000), ("cri_min", "cri_max", 50, 100)):
            num(where, e, lo, a, b)
            num(where, e, hi, a, b)
            if (e.get(lo) is None) != (e.get(hi) is None):
                err(where, f"{lo} and {hi} must both be set or both empty")
            elif e.get(lo) is not None and e[lo] > e[hi]:
                err(where, f"{lo} {e[lo]} is above {hi} {e[hi]}")
        num(where, e, "max_a", 0.1, 100)  # rated or practical max drive current per LED, amps
        for k in e.get("ccts") or []:
            if not isinstance(k, int) or not 1000 <= k <= 10000:
                err(where, f"colour temperature {k!r} is outside 1000–10000 K")
        if e.get("beam") is not None and e["beam"] not in (1, 2, 3, 4, 5):
            err(where, f"beam {e['beam']!r} should be 1 (flood) to 5 (pencil)")
        if e.get("basis") not in ("datasheet", "lab", "estimate", "typical"):
            err(where, f"basis {e.get('basis')!r} should be datasheet, lab, estimate or typical")
        for s in e.get("sources") or []:
            link(where, s.get("url"), "source")
        for c in e.get("candela") or []:
            if c.get("cd_lo") is None or c.get("cd_hi") is None or c["cd_lo"] > c["cd_hi"]:
                err(where, f"candela row {c.get('label') or c.get('row')!r} needs cd_lo ≤ cd_hi")
        for b in e.get("best_for") or []:
            if b.get("goal") not in goals:
                err(where, f"best_for goal {b.get('goal')!r} isn't one of the listed uses")
            if b.get("tier") not in (1, 2):
                err(where, f"best_for tier {b.get('tier')!r} should be 1 (top pick) or 2 (also good)")
        for a in e.get("alternatives") or []:
            if not isinstance(a.get("name"), str) or norm(a["name"]) not in led_names:
                err(where, f"alternative {a.get('name')!r} isn't the name or alt name of any LED")
            text(where, a, "why")


def load(path):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError) as x:
        err(path.relative_to(ROOT), f"can't be read as JSON ({x})")
        return None


def check_editor_picks(rows):
    # The hand-picked list (`const EDITOR = {...}`) in the flashlight page must name lights that exist.
    page = (ROOT / "public/flashlights/index.html").read_text(encoding="utf-8")
    m = re.search(r"const EDITOR = \{(.*?)\n  \};", page, re.S)
    if not m:
        return
    ids = {slug(r.get("brand"), r.get("model"), r.get("variant")) for r in rows}
    for goal, body in re.findall(r'"([^"]*)":\s*\[([^\]]*)\]', m.group(1)):
        for pick in re.findall(r'"([^"]+)"', body):
            if pick not in ids:
                err(f"Editor's picks ({goal or 'overall'})", f"no light has the ID '{pick}'")


lights, emitters = load(LIGHTS), load(EMITTERS)
if isinstance(lights, list):
    check_lights(lights)
    check_editor_picks(lights)
elif lights is not None:
    err("lights.clean.json", "should be a list of lights")
if isinstance(emitters, dict):
    check_emitters(emitters)
elif emitters is not None:
    err("emitters.json", "should be an object with an 'emitters' list")

if errors:
    print(f"{len(errors)} problem{'s' if len(errors) != 1 else ''} found:")
    print("\n".join("  " + e for e in errors))
    sys.exit(1)
print(f"OK: {len(lights)} lights, {len(emitters['emitters'])} LEDs")
