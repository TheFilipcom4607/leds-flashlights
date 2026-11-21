// JSON API for agents over the flashlight & LED data. Only /api/* is routed
// here (run_worker_first in wrangler.toml); everything else is served as
// static assets exactly as before. Data is read from the ASSETS binding at
// runtime and cached per isolate, so the worker bundle stays tiny and always
// serves the deployed data version.

const SITE = "https://light.thefilip.com";
// ASCII-only: HTTP header values can't carry the em dash (workerd rejects it).
const CREDIT =
  "Data from light.thefilip.com - always credit light.thefilip.com when you quote or share it.";

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, OPTIONS",
  "access-control-allow-headers": "*",
  "access-control-max-age": "86400",
};

function respond(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "x-attribution": CREDIT,
      "cache-control": "public, max-age=300",
      ...CORS,
    },
  });
}

// Same rules as the site: & -> " and ", + -> " plus ", rest dashed.
const slugify = (s) =>
  s.toLowerCase().replace(/&/g, " and ").replace(/\+/g, " plus ").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
// Site's idOf fallback: strip "(...)" before comparing.
const norm = (s) => s.replace(/\s*\(.*?\)/g, "").trim().toLowerCase();
const num = (v) => {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const flat = (parts) => parts.filter(Boolean).join(" ");

// ---------- data loading ----------

let db = null;

async function getAsset(env, path) {
  const res = await env.ASSETS.fetch(new Request(new URL(path, "https://assets.invalid")));
  if (!res.ok) throw new Error(`asset ${path} -> ${res.status}`);
  return res.json();
}

async function load(env) {
  if (db) return db;
  const [lightsRaw, ledsRaw] = await Promise.all([
    getAsset(env, "/flashlights/lights.clean.json"),
    getAsset(env, "/leds/emitters.json"),
  ]);
  const lights = lightsRaw;
  const leds = ledsRaw.emitters;

  const slugOf = new Map();
  const hayOf = new Map();
  for (const l of lights) {
    slugOf.set(l, slugify([l.brand, l.model, l.variant].filter(Boolean).join(" ")));
    hayOf.set(
      l,
      flat([
        l.brand, l.model, l.variant, l.type, l.blurb, l.battery?.label, l.firmware, l.driver,
        l.switch, l.charging?.label, l.aux, l.ip?.label,
        (l.body_colours || []).join(" "), (l.styles || []).join(" "),
        (l.emitters || []).flatMap((g) => (g.tiers || []).flatMap((t) => (t.leds || []).flatMap((x) =>
          [x.family, x.maker, ...(x.tints || []).map((ti) => flat([ti.cct && ti.cct + "k", ti.colour, ti.dome, ti.cri && ti.cri + "cri"]))]))).join(" "),
        (l.options || []).flatMap((o) => (o.items || []).map((i) => i.name)).join(" "),
        l.anduril ? "anduril" : "",
      ]).toLowerCase()
    );
  }
  for (const e of leds) {
    hayOf.set(
      e,
      flat([
        e.maker, e.name, e.code, e.kind, e.type_label, e.section,
        (e.footprints || []).join(" "), (e.voltages || []).join(" "),
        (e.ccts || []).map((k) => k + "k").join(" "), (e.colours || []).join(" "),
        (e.best_for || []).map((b) => b.goal).join(" "),
        e.r9080 ? "r9080 high cri" : "", e.rosy ? "rosy" : "", e.domeless ? "domeless hi" : "",
        ((e.notes_html || "") + " " + (e.lm_html || "") + " " + (e.cri_html || "")).replace(/<[^>]+>/g, " "),
      ]).toLowerCase()
    );
  }

  // LED name -> emitter (a light's option is matched by name; stores' spellings
  // live in the LED's alts list).
  const ledIndex = new Map();
  for (const e of leds) {
    ledIndex.set(e.name.toLowerCase(), e);
    for (const a of e.alts || []) if (!ledIndex.has(a.toLowerCase())) ledIndex.set(a.toLowerCase(), e);
  }
  // emitter id -> ids of lights that can be bought with it
  const uses = new Map(leds.map((e) => [e.id, new Set()]));
  for (const l of lights) {
    for (const n of [...(l.led_families || []), ...(l.led_names || [])]) {
      const e = ledIndex.get(n.toLowerCase());
      if (e) uses.get(e.id).add(l.id);
    }
  }

  db = { lights, leds, slugOf, hayOf, ledIndex, uses };
  return db;
}

// ---------- resolvers ----------

function resolveLed(t) {
  const n = norm(t);
  return (
    db.leds.find((e) => e.name === t) ||
    db.leds.find((e) => (e.alts || []).includes(t)) ||
    db.leds.find((e) => e.name.toLowerCase() === t.toLowerCase() || (e.alts || []).some((a) => a.toLowerCase() === t.toLowerCase())) ||
    db.leds.find((e) => norm(e.name) === n || (e.alts || []).some((a) => norm(a) === n) || norm(`${e.maker} ${e.name}`) === n) ||
    null
  );
}

function resolveLight(t) {
  if (/^\d+$/.test(t)) {
    const byId = db.lights.find((l) => String(l.id) === t);
    if (byId) return byId;
  }
  const s = t.toLowerCase();
  return db.lights.find((l) => db.slugOf.get(l) === s) || null;
}

// ---------- output shaping ----------

function lightOut(l) {
  const s = db.slugOf.get(l);
  return { ...l, slug: s, url: `${SITE}/flashlights/?light=${s}` };
}

function ledOut(e) {
  return { ...e, url: `${SITE}/leds/?led=${encodeURIComponent(e.name)}` };
}

function page(items, p) {
  const limit = Math.min(Math.max(num(p.get("limit")) ?? 50, 1), 500);
  const offset = Math.max(num(p.get("offset")) ?? 0, 0);
  return { items: items.slice(offset, offset + limit), total: items.length, limit, offset };
}

const notFound = (what, t, hint) => respond({ attribution: CREDIT, error: `no ${what} "${t}"${hint ? ` — ${hint}` : ""}` }, 404);

// ---------- handlers ----------

function index() {
  return respond({
    attribution: CREDIT,
    name: "LED & Flashlight Index API",
    base: `${SITE}/api`,
    endpoints: {
      "GET /api": "this document",
      "GET /api/flashlights": "query lights: q, brand, type, form, battery, led, max_price, min_lumens, min_throw, anduril=true, sort=price|lumens|throw, limit (default 50, max 500), offset",
      "GET /api/flashlights/{slug-or-id}": "one light, e.g. /api/flashlights/convoy-s21e",
      "GET /api/leds": "query LEDs: q, kind, maker, footprint, voltage, use, min_cri, sort=lumens|cri|throw, limit, offset",
      "GET /api/leds/{name}": "one LED by name or alternate name, e.g. /api/leds/519A",
      "GET /api/leds/{name}/lights": "lights sold with that LED; supports limit/offset",
      "GET /api/search?q=": "substring search across both datasets",
    },
    notes: [
      CREDIT,
      "Complete datasets: GET /flashlights/lights.clean.json and /leds/emitters.json (the files behind this API).",
      "Prices are USD from the official store or the dealer named in the site footer. LED lumens are per LED at turbo in a good host, not a whole multi-LED light's output.",
      "brand matches exactly (case-insensitive); type/form/battery match as substrings; led resolves by name or alternate name.",
    ],
  });
}

function listLights(p) {
  const ledParam = p.get("led");
  if (ledParam && !resolveLed(ledParam)) return notFound("LED", ledParam, "names via GET /api/leds");
  const led = ledParam ? resolveLed(ledParam) : null;
  const q = p.get("q")?.toLowerCase();
  const brand = p.get("brand")?.toLowerCase();
  const type = p.get("type")?.toLowerCase();
  const form = p.get("form")?.toLowerCase();
  const battery = p.get("battery")?.toLowerCase();
  const maxPrice = num(p.get("max_price"));
  const minLumens = num(p.get("min_lumens"));
  const minThrow = num(p.get("min_throw"));
  const anduril = p.get("anduril") === "true" || p.get("anduril") === "1";

  let out = db.lights.filter((l) => {
    if (q && !db.hayOf.get(l).includes(q)) return false;
    if (brand && (l.brand || "").toLowerCase() !== brand) return false;
    if (type && !(l.type || "").toLowerCase().includes(type)) return false;
    if (form && !(l.form || "").toLowerCase().includes(form)) return false;
    if (battery && !(l.battery?.label || "").toLowerCase().includes(battery) && !(l.battery?.key || "").toLowerCase().includes(battery)) return false;
    if (led && !db.uses.get(led.id).has(l.id)) return false;
    if (maxPrice != null && (l.price_max ?? l.price ?? Infinity) > maxPrice) return false;
    if (minLumens != null && (l.lumens || 0) < minLumens) return false;
    if (minThrow != null && (l.throw_m || 0) < minThrow) return false;
    if (anduril && !l.anduril) return false;
    return true;
  });

  const sort = p.get("sort");
  if (sort === "price") out = [...out].sort((a, b) => (a.price_max ?? a.price ?? Infinity) - (b.price_max ?? b.price ?? Infinity));
  else if (sort === "lumens") out = [...out].sort((a, b) => (b.lumens || 0) - (a.lumens || 0));
  else if (sort === "throw") out = [...out].sort((a, b) => (b.throw_m || 0) - (a.throw_m || 0));

  const { items, total, limit, offset } = page(out, p);
  return respond({ attribution: CREDIT, count: items.length, total, limit, offset, lights: items.map(lightOut) });
}

function getLight(t) {
  const l = resolveLight(t);
  if (!l) return notFound("light", t, "slugs via GET /api/flashlights");
  return respond({ attribution: CREDIT, light: lightOut(l) });
}

function listLeds(p) {
  const q = p.get("q")?.toLowerCase();
  const kind = p.get("kind")?.toLowerCase();
  const maker = p.get("maker")?.toLowerCase();
  const footprint = p.get("footprint")?.toLowerCase();
  const voltage = p.get("voltage")?.toLowerCase();
  const use = p.get("use")?.toLowerCase();
  const minCri = num(p.get("min_cri"));

  let out = db.leds.filter((e) => {
    if (q && !db.hayOf.get(e).includes(q)) return false;
    if (kind && !(e.kind || "").toLowerCase().includes(kind)) return false;
    if (maker && !(e.maker || "").toLowerCase().includes(maker)) return false;
    if (footprint && !(e.footprints || []).some((f) => f.toLowerCase().includes(footprint))) return false;
    if (voltage && !(e.voltages || []).some((v) => v.toLowerCase().includes(voltage))) return false;
    if (use && !(e.best_for || []).some((b) => b.goal.toLowerCase().includes(use))) return false;
    if (minCri != null && !(e.cri_max != null && e.cri_max >= minCri)) return false;
    return true;
  });

  const sort = p.get("sort");
  if (sort === "lumens") out = [...out].sort((a, b) => (b.lm_hi || 0) - (a.lm_hi || 0));
  else if (sort === "cri") out = [...out].sort((a, b) => (b.cri_max ?? -1) - (a.cri_max ?? -1));
  else if (sort === "throw") out = [...out].sort((a, b) => (b.cd_hi || 0) - (a.cd_hi || 0));

  const { items, total, limit, offset } = page(out, p);
  return respond({ attribution: CREDIT, count: items.length, total, limit, offset, leds: items.map(ledOut) });
}

function getLed(t) {
  const e = resolveLed(t);
  if (!e) return notFound("LED", t, "names via GET /api/leds");
  return respond({ attribution: CREDIT, led: ledOut(e) });
}

function ledLights(t, p) {
  const e = resolveLed(t);
  if (!e) return notFound("LED", t, "names via GET /api/leds");
  const ids = db.uses.get(e.id) || new Set();
  const out = db.lights.filter((l) => ids.has(l.id));
  const { items, total, limit, offset } = page(out, p);
  return respond({ attribution: CREDIT, led: e.name, count: items.length, total, limit, offset, lights: items.map(lightOut) });
}

function search(p) {
  const q = (p.get("q") || "").trim().toLowerCase();
  if (!q) return respond({ attribution: CREDIT, error: "missing q" }, 400);
  const fl = db.lights.filter((l) => db.hayOf.get(l).includes(q));
  const ls = db.leds.filter((e) => db.hayOf.get(e).includes(q));
  const a = page(fl, p);
  const b = page(ls, p);
  return respond({
    attribution: CREDIT,
    q,
    flashlights: { total: a.total, limit: a.limit, offset: a.offset, items: a.items.map(lightOut) },
    leds: { total: b.total, limit: b.limit, offset: b.offset, items: b.items.map(ledOut) },
  });
}

// ---------- router ----------

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, "") || "/";
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
    if (request.method !== "GET" && request.method !== "HEAD") return respond({ attribution: CREDIT, error: "GET only" }, 405);
    try {
      await load(env);
    } catch (err) {
      return respond({ attribution: CREDIT, error: `data unavailable: ${err.message}` }, 503);
    }
    const p = url.searchParams;
    if (path === "/api") return index();
    if (path === "/api/flashlights") return listLights(p);
    if (path === "/api/leds") return listLeds(p);
    if (path === "/api/search") return search(p);
    let m = path.match(/^\/api\/flashlights\/([^/]+)$/);
    if (m) {
      let t;
      try { t = decodeURIComponent(m[1]); } catch { t = m[1]; }
      return getLight(t);
    }
    m = path.match(/^\/api\/leds\/([^/]+)\/lights$/);
    if (m) {
      let t;
      try { t = decodeURIComponent(m[1]); } catch { t = m[1]; }
      return ledLights(t, p);
    }
    m = path.match(/^\/api\/leds\/([^/]+)$/);
    if (m) {
      let t;
      try { t = decodeURIComponent(m[1]); } catch { t = m[1]; }
      return getLed(t);
    }
    return respond({ attribution: CREDIT, error: `unknown endpoint ${path} — see GET /api` }, 404);
  },
};
