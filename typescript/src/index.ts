const BMKG_BASE = "https://api.bmkg.go.id/publik/prakiraan-cuaca";
const WILAYAH_API = "https://api.wilayah.workers.dev";

interface BmkgResponse {
  lokasi: {
    adm1: string; adm2: string; adm3: string; adm4: string;
    provinsi: string; kotkab: string; kecamatan: string; desa: string;
    lon: number; lat: number; timezone: string;
  };
  data: Array<{
    lokasi: BmkgResponse["lokasi"] & { type: string };
    cuaca: Array<Array<BmkgForecastItem>>;
  }>;
}

interface BmkgForecastItem {
  datetime: string; t: number; tcc: number; tp: number; weather: number;
  weather_desc: string; weather_desc_en: string; wd_deg: number; wd: string;
  wd_to: string; ws: number; hu: number; vs: number | null; vs_text: string | null;
  time_index: string; analysis_date: string; image: string;
  utc_datetime: string; local_datetime: string;
}

interface WilayahSearchResult {
  code: string;
  name: string;
  district: string;
  city: string;
  province: string;
  lat: number;
  lon: number;
}

interface WilayahNearestResult {
  results: WilayahSearchResult[];
}

interface WilayahCodeResult {
  code: string;
  name: string;
  district: string;
  city: string;
  province: string;
  lat: number;
  lon: number;
}

// Cloudflare bindings (minimal; see worker-configuration.d.ts for generated types)
interface Env {
  AI?: unknown;
  ASSETS?: unknown;
  WILAYAH?: { fetch(input: RequestInfo, init?: RequestInit): Promise<Response> };
}

import { renderTerminal, renderHTML, wantsHTML, SimpleForecast, LocationInfo, Warning, weatherEmoji, asciiIconSingle, renderPrometheus } from "./render";

export default {
  async fetch(request: Request, env: Env, ctx?: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    // GET /api/forecast?adm4=31.71.03.1001 - JSON API
    if (url.pathname === "/api/forecast") {
      const adm4 = url.searchParams.get("adm4");
      if (!adm4) {
        return json({ error: "adm4 parameter required (e.g., 31.71.03.1001)" }, 400, corsHeaders);
      }
      try {
        const data = await fetchForecast(adm4);
        return json(data, 200, corsHeaders);
      } catch (e) {
        return json({ error: "Failed to fetch forecast", detail: String(e) }, 502, corsHeaders);
      }
    }

    // GET /api/warnings?adm4=... - BMKG weather warnings (CAP XML)
    if (url.pathname === "/api/warnings") {
      const adm4 = url.searchParams.get("adm4");
      if (!adm4) {
        return json({ error: "adm4 parameter required" }, 400, corsHeaders);
      }
      try {
        const warnings = await fetchWarnings(adm4);
        return json({ adm4, warnings }, 200, corsHeaders);
      } catch (e) {
        return json({ error: "Failed to fetch warnings", detail: String(e) }, 502, corsHeaders);
      }
    }

    // GET /api/resolve?q=jakarta&limit=5 - Search villages by name
    if (url.pathname === "/api/resolve") {
      const q = url.searchParams.get("q");
      const limit = parseInt(url.searchParams.get("limit") || "10");
      if (!q) {
        return json({ error: "q parameter required" }, 400, corsHeaders);
      }
      try {
        const results = await searchWilayah(q, limit, env);
        return json({ query: q, results }, 200, corsHeaders);
      } catch (e) {
        return json({ error: "Failed to search", detail: String(e) }, 502, corsHeaders);
      }
    }

    // GET /api/nearest?lat=-6.17&lon=106.82&limit=1 - Reverse geocode
    if (url.pathname === "/api/nearest") {
      const lat = parseFloat(url.searchParams.get("lat") || "");
      const lon = parseFloat(url.searchParams.get("lon") || "");
      const limit = parseInt(url.searchParams.get("limit") || "1");
      if (isNaN(lat) || isNaN(lon)) {
        return json({ error: "lat and lon parameters required" }, 400, corsHeaders);
      }
      try {
        const results = await nearestWilayah(lat, lon, limit, env);
        return json({ lat, lon, results }, 200, corsHeaders);
      } catch (e) {
        return json({ error: "Failed to reverse geocode", detail: String(e) }, 502, corsHeaders);
      }
    }

    // GET /api/locate?lat=&lon= - Full admin hierarchy
    if (url.pathname === "/api/locate") {
      const lat = parseFloat(url.searchParams.get("lat") || "");
      const lon = parseFloat(url.searchParams.get("lon") || "");
      if (isNaN(lat) || isNaN(lon)) {
        return json({ error: "lat and lon parameters required" }, 400, corsHeaders);
      }
      try {
        const result = await locateWilayah(lat, lon, env);
        return json(result, 200, corsHeaders);
      } catch (e) {
        return json({ error: "Failed to locate", detail: String(e) }, 502, corsHeaders);
      }
    }

    // GET /api/ai-report?adm4=...&style=brief|detailed|conversational - AI-generated weather report (DISABLED)
    if (url.pathname === "/api/ai-report") {
      return json({ error: "AI report feature is currently disabled" }, 501, corsHeaders);
    }

    // GET / - Terminal weather (auto-location via GeoIP or default)
    if (url.pathname === "/" || url.pathname === "/weather") {
      try {
        const { adm4, source } = await resolveAdm4FromRequest(request, env, url);
        return await serveWeatherView(request, ctx, adm4, source, url.searchParams.get("format"), corsHeaders);
      } catch (e) {
        return new Response(`Error: ${e}`, { status: 502, headers: corsHeaders });
      }
    }

    // GET /:location - Location by name/code with format support
    if (url.pathname.startsWith("/") && url.pathname.length > 1 && !url.pathname.startsWith("/api")) {
      const locationName = url.pathname.slice(1);
      try {
        const resolved = await resolveLocationCached(locationName, env);
        const adm4 = resolved || "31.71.03.1001";
        const source: LocationSource = resolved ? "name" : "default";
        return await serveWeatherView(request, ctx, adm4, source, url.searchParams.get("format"), corsHeaders);
      } catch (e) {
        return new Response(`Error: ${e}`, { status: 502, headers: corsHeaders });
      }
    }

    // GET /api/locations - List example locations
    if (url.pathname === "/api/locations") {
      return json({
        examples: [
          { adm4: "31.71.03.1001", name: "Kemayoran, Jakarta Pusat" },
          { adm4: "31.71.01.1001", name: "Gambir, Jakarta Pusat" },
          { adm4: "32.73.07.1001", name: "Cibeunying Kaler, Bandung" },
          { adm4: "33.74.07.1001", name: "Semarang Tengah, Semarang" },
          { adm4: "35.78.03.1001", name: "Tegalsari, Surabaya" },
        ],
      }, 200, corsHeaders);
    }

    return json({ 
      error: "Not found", 
      endpoints: [
        "GET / (terminal weather, auto GeoIP)",
        "GET /:location (e.g., /Jakarta, /Bandung)",
        "GET /:location?format=3 (short: 'Jakarta: ☀️ +34°C')",
        "GET /:location?format={ICON} {t}°C (custom format)",
        "GET /api/forecast?adm4=31.71.03.1001 (JSON forecast)",
        "GET /api/warnings?adm4=... (JSON warnings)",
        "GET /api/resolve?q=jakarta (search villages)",
        "GET /api/nearest?lat=&lon= (reverse geocode)",
        "GET /api/locate?lat=&lon= (admin hierarchy)",
        "GET /api/locations (list examples)"
      ] 
    }, 404, corsHeaders);
  },
} satisfies ExportedHandler<Env>;

// ===== Rendered-response cache (see PERF.md) =====
// Layer 1: per-isolate memory cache (fastest; isolate reuse makes this very effective)
// Layer 2: Cache API (per-colo edge cache, shared across isolates)
// TTL = 5 min, matching forecast freshness. Keyed by resolved adm4 + view so
// /Jakarta, /?adm4=... and GeoIP hits share one artifact.

const CACHE_TTL_MS = 5 * 60 * 1000;
const CACHE_TTL_S = 300;
const RES_CACHE_MAX = 500;

interface CachedResponse {
  expires: number;
  body: string;
  headers: Record<string, string>; // serialized response headers
}
const resCache = new Map<string, CachedResponse>();

// name/geo -> adm4 resolution cache (24h, matching wilayah upstream cache)
const RESOLVE_TTL_MS = 24 * 60 * 60 * 1000;
const resolveCache = new Map<string, { expires: number; adm4: string }>();

function cacheKey(adm4: string, view: string): string {
  return `${adm4}:${view}`;
}

function setResCache(key: string, entry: CachedResponse): void {
  if (resCache.size >= RES_CACHE_MAX) {
    // simple FIFO eviction: Map preserves insertion order
    resCache.delete(resCache.keys().next().value as string);
  }
  resCache.set(key, entry);
}

function responseHeaders(h: Record<string, string>, cacheStatus: string, timing: string): Headers {
  const headers = new Headers(h);
  headers.set("X-Cuaca-Cache", cacheStatus);
  headers.set("Server-Timing", timing);
  return headers;
}

// Build the final response: location headers + optional fallback note
function finalizeResponse(
  body: string,
  headers: Record<string, string>,
  cacheStatus: string,
  timing: string,
  adm4: string,
  source: LocationSource,
  view: string
): Response {
  const h = responseHeaders(headers, cacheStatus, timing);
  h.set("X-Cuaca-Location", `adm4=${adm4}`);
  h.set("X-Cuaca-Source", source);
  let finalBody = body;
  if (source === "default" && view === "terminal") {
    finalBody = "\x1b[2mNote: default location (Kemayoran) \u2014 pass ?adm4= or ?lat=&lon= for yours\x1b[0m\n\n" + body;
  }
  return new Response(finalBody, { headers: h });
}

// Serve one of the weather views with caching (used by / and /:location)
async function serveWeatherView(
  request: Request,
  ctx: ExecutionContext | undefined,
  adm4: string,
  source: LocationSource,
  format: string | null,
  corsHeaders: Record<string, string>
): Promise<Response> {
  // Determine view; only full views need warnings (short/custom skip the fetch)
  const view =
    format === "3" || format === "short" ? "short"
    : format === "prometheus" ? "prometheus"
    : format ? "custom"
    : wantsHTML(request) ? "html"
    : "terminal";

  const baseHeaders: Record<string, string> = {
    "Content-Type":
      view === "html" ? "text/html; charset=utf-8"
      : view === "prometheus" ? "text/plain; version=0.0.4; charset=utf-8"
      : "text/plain; charset=utf-8",
    ...corsHeaders,
  };

  // Custom formats are per-user templates: never cached
  if (view === "custom") {
    const t0 = Date.now();
    const data = await fetchForecast(adm4);
    const location = toLocationInfo(data);
    const body = formatCustom(format as string, data.forecast[0], location);
    return finalizeResponse(body, baseHeaders, "BYPASS", `upstream;dur=${Date.now() - t0}, cache;desc=BYPASS`, adm4, source, view);
  }

  const key = cacheKey(adm4, view);

  // 1) Memory cache
  const memHit = resCache.get(key);
  if (memHit && memHit.expires > Date.now()) {
    return finalizeResponse(memHit.body, memHit.headers, "MEMHIT", `cache;desc=MEM`, adm4, source, view);
  }

  // 2) Cache API (per-colo edge cache)
  const cache = caches.default;
  const cacheUrl = new Request(`https://cuaca.internal/cache/v1/${encodeURIComponent(adm4)}/${view}`);
  const edgeHit: Response | undefined = await cache.match(cacheUrl);
  if (edgeHit) {
    const body = await edgeHit.text();
    const headers: Record<string, string> = {};
    edgeHit.headers.forEach((v, k) => { headers[k] = v; });
    // promote to memory for next time
    setResCache(key, { expires: Date.now() + CACHE_TTL_MS, body, headers });
    return finalizeResponse(body, headers, "EDGEHIT", `cache;desc=EDGE`, adm4, source, view);
  }

  // 3) MISS: fetch + render
  const tUp = Date.now();
  const needsWarnings = view === "terminal" || view === "html";
  const [data, warnings] = await Promise.all([
    fetchForecast(adm4),
    needsWarnings ? fetchWarnings(adm4).catch(() => [] as Warning[]) : Promise.resolve([] as Warning[]),
  ]);
  const upstreamMs = Date.now() - tUp;

  const tRender = Date.now();
  const location = toLocationInfo(data);
  let body: string;
  if (view === "short") {
    const current = data.forecast[0];
    const icon = weatherEmoji(current.weather, new Date(current.time).getHours());
    body = `${location.desa}: ${icon} ${formatTemp(current.temp)}`;
  } else if (view === "prometheus") {
    body = renderPrometheus(location, data.forecast);
  } else if (view === "html") {
    body = renderHTML(location, data.forecast, warnings);
  } else {
    body = renderTerminal(location, data.forecast, warnings);
  }
  const renderMs = Date.now() - tRender;

  const headers: Record<string, string> = {
    ...baseHeaders,
    "Cache-Control": `public, max-age=60, s-maxage=${CACHE_TTL_S}, stale-while-revalidate=600`,
  };

  // populate memory + edge caches (edge write is async, never blocks the response)
  setResCache(key, { expires: Date.now() + CACHE_TTL_MS, body, headers });
  ctx?.waitUntil?.(cache.put(cacheUrl, new Response(body, { headers })));

  return finalizeResponse(body, headers, "MISS", `upstream;dur=${upstreamMs}, render;dur=${renderMs}, cache;desc=MISS`, adm4, source, view);
}

function toLocationInfo(data: Awaited<ReturnType<typeof fetchForecast>>): LocationInfo {
  return {
    provinsi: data.location.provinsi,
    kotkab: data.location.kotkab,
    kecamatan: data.location.kecamatan,
    desa: data.location.desa,
    lat: data.location.lat,
    lon: data.location.lon,
    adm4: data.location.adm4,
  };
}

// ===== Location resolution caches =====
async function resolveLocationCached(name: string, env?: Env): Promise<string | null> {
  const key = `name:${name.toLowerCase()}`;
  const hit = resolveCache.get(key);
  if (hit && hit.expires > Date.now()) return hit.adm4;
  const adm4 = await resolveLocation(name, env);
  if (adm4) resolveCache.set(key, { expires: Date.now() + RESOLVE_TTL_MS, adm4 });
  return adm4;
}

async function nearestAdm4Cached(lat: number, lon: number, env?: Env): Promise<string | undefined> {
  // round to ~1 km: GeoIP coords jitter between requests but resolve nearby
  const key = `geo:${lat.toFixed(2)},${lon.toFixed(2)}`;
  const hit = resolveCache.get(key);
  if (hit && hit.expires > Date.now()) return hit.adm4;
  const nearest = await nearestWilayah(lat, lon, 1, env);
  if (nearest.length > 0) {
    const adm4 = nearest[0].code;
    resolveCache.set(key, { expires: Date.now() + RESOLVE_TTL_MS, adm4 });
    return adm4;
  }
  return undefined;
}

// ===== BMKG Forecast =====
async function fetchForecast(adm4: string): Promise<{
  location: BmkgResponse["lokasi"];
  forecast: SimpleForecast[];
  analysisDate: string;
}> {
  const res = await fetch(`${BMKG_BASE}?adm4=${adm4}`, {
    headers: { "User-Agent": "cuaca-worker/1.0" },
    cf: { cacheTtl: 300, cacheEverything: true },
  });

  if (!res.ok) {
    throw new Error(`BMKG ${res.status}: ${await res.text()}`);
  }

  const data: BmkgResponse = await res.json();
  
  const allSlots = data.data.flatMap((day) => day.cuaca.flat());
  
  const forecast: SimpleForecast[] = allSlots.map((item) => ({
    time: item.local_datetime,
    temp: item.t,
    condition: item.weather_desc,
    conditionEn: item.weather_desc_en,
    humidity: item.hu,
    windSpeed: item.ws,
    windDir: item.wd,
    cloudCover: item.tcc,
    rainProb: Math.round(item.tp * 100),
    weather: item.weather,
  }));

  return {
    location: data.lokasi,
    forecast,
    analysisDate: data.data[0]?.cuaca[0]?.[0]?.analysis_date ?? "",
  };
}

// ===== BMKG Weather Warnings (CAP XML) =====
async function fetchWarnings(adm4: string): Promise<Array<{
  id: string; event: string; severity: string; urgency: string;
  certainty: string; effective: string; expires: string;
  description: string; instruction: string; areaDesc: string;
  polygon?: string; geocode?: Record<string, string>;
}>> {
  const res = await fetch(`https://api.bmkg.go.id/publik/peringatan-dini-cuaca?adm4=${adm4}`, {
    headers: { "User-Agent": "cuaca-worker/1.0" },
    cf: { cacheTtl: 900, cacheEverything: true }, // 15 min cache
  });

  if (!res.ok) return [];

  const xml = await res.text();
  return parseCAPWarnings(xml);
}

function parseCAPWarnings(xml: string): Array<any> {
  const warnings: any[] = [];
  
  // Simple XML parsing for CAP format
  const alertMatches = xml.match(/<alert>[\s\S]*?<\/alert>/g) || [];
  
  for (const alertXml of alertMatches) {
    const getTag = (tag: string) => {
      const match = alertXml.match(new RegExp(`<${tag}>([\\s\\S]*?)<\/${tag}>`));
      return match ? match[1].trim() : "";
    };
    
    const getTags = (tag: string) => {
      const matches = [...alertXml.matchAll(new RegExp(`<${tag}>([\\s\\S]*?)<\/${tag}>`, "g"))];
      return matches.map(m => m[1].trim());
    };
    
    const infoBlocks = alertXml.match(/<info>[\s\S]*?<\/info>/g) || [];
    
    for (const infoXml of infoBlocks) {
      const areas = infoXml.match(/<area>[\s\S]*?<\/area>/g) || [];
      
      for (const areaXml of areas) {
        const areaDesc = areaXml.match(/<areaDesc>([^<]+)<\/areaDesc>/)?.[1] || "";
        const polygon = areaXml.match(/<polygon>([^<]+)<\/polygon>/)?.[1] || undefined;
        const geocode: Record<string, string> = {};
        
        const geocodeMatches = [...areaXml.matchAll(/<geocode><valueName>([^<]+)<\/valueName><value>([^<]+)<\/value><\/geocode>/g)];
        for (const [, name, value] of geocodeMatches) {
          geocode[name] = value;
        }
        
        // Check if this area matches our adm4
        const adm4Match = geocode["ADM4"] || geocode["ADM3"] || geocode["ADM2"] || geocode["ADM1"];
        // For simplicity, include all areas (client can filter)
        
        warnings.push({
          id: getTag("identifier"),
          event: getTag("event"),
          severity: getTag("severity"),
          urgency: getTag("urgency"),
          certainty: getTag("certainty"),
          effective: getTag("effective"),
          expires: getTag("expires"),
          description: getTag("description"),
          instruction: getTag("instruction"),
          areaDesc,
          polygon,
          geocode,
        });
      }
    }
  }
  
  return warnings;
}

// ===== Wilayah Worker Integration =====
// Fetch through the WILAYAH service binding when available (same-account
// worker-to-worker: bypasses same-zone routing, faster, free). Falls
// back to public fetch -- local dev/CI have no live binding for 'api'.
async function wilayahFetch(url: string, cf: Record<string, unknown>, env?: Env): Promise<Response> {
  const headers = { "User-Agent": "cuaca-worker/1.0" };
  if (env?.WILAYAH) {
    try {
      return await env.WILAYAH.fetch(url, { headers });
    } catch {
      // binding unavailable (local dev stub) -> public fetch
    }
  }
  return fetch(url, { headers, cf: cf as RequestInit["cf"] });
}
async function searchWilayah(query: string, limit: number, env?: Env): Promise<WilayahSearchResult[]> {
  const res = await wilayahFetch(
    `${WILAYAH_API}/search?q=${encodeURIComponent(query)}&limit=${limit}`,
    { cacheTtl: 86400, cacheEverything: true }, // 24h edge cache (public fetch path)
    env
  );
  if (!res.ok) throw new Error(`Wilayah ${res.status}`);
  const data = (await res.json()) as WilayahNearestResult;
  return data.results || [];
}

async function nearestWilayah(lat: number, lon: number, limit: number, env?: Env): Promise<WilayahSearchResult[]> {
  const res = await wilayahFetch(
    `${WILAYAH_API}/nearest?lat=${lat}&lon=${lon}&limit=${limit}`,
    { cacheTtl: 86400, cacheEverything: true },
    env
  );
  if (!res.ok) throw new Error(`Wilayah ${res.status}`);
  const data = (await res.json()) as WilayahNearestResult;
  return data.results || [];
}

async function locateWilayah(lat: number, lon: number, env?: Env): Promise<any> {
  const res = await wilayahFetch(
    `${WILAYAH_API}/locate?lat=${lat}&lon=${lon}`,
    { cacheTtl: 86400, cacheEverything: true },
    env
  );
  if (!res.ok) throw new Error(`Wilayah ${res.status}`);
  return res.json();
}

async function getWilayahByCode(code: string, env?: Env): Promise<WilayahCodeResult | null> {
  const res = await wilayahFetch(
    `${WILAYAH_API}/code?q=${encodeURIComponent(code)}`,
    { cacheTtl: 86400, cacheEverything: true },
    env
  );
  if (!res.ok) return null;
  return res.json();
}

// ===== Location Resolution =====
export type LocationSource = "param" | "query" | "geoip" | "name" | "default";

async function resolveAdm4FromRequest(request: Request, env: Env, url: URL): Promise<{ adm4: string; source: LocationSource }> {
  // 1. Explicit adm4 in query
  const explicitAdm4 = url.searchParams.get("adm4");
  if (explicitAdm4) return { adm4: explicitAdm4, source: "param" };

  // 2. Explicit lat/lon in query (cached ~1 km, 24 h)
  const lat = url.searchParams.get("lat");
  const lon = url.searchParams.get("lon");
  if (lat && lon) {
    const adm4 = await nearestAdm4Cached(parseFloat(lat), parseFloat(lon), env);
    if (adm4) return { adm4, source: "query" };
  }

  // 3. Cloudflare GeoIP headers (cached ~1 km, 24 h)
  const cfLat = request.headers.get("CF-IPLatitude");
  const cfLon = request.headers.get("CF-IPLongitude");
  if (cfLat && cfLon) {
    const adm4 = await nearestAdm4Cached(parseFloat(cfLat), parseFloat(cfLon), env);
    if (adm4) return { adm4, source: "geoip" };
  }

  // 4. Default: Kemayoran, Jakarta
  return { adm4: "31.71.03.1001", source: "default" };
}

async function resolveLocation(name: string, env?: Env): Promise<string | null> {
  // Try exact code first
  if (/^\d{2}(\.\d{2}){3}$/.test(name)) {
    const result = await getWilayahByCode(name, env);
    return result?.code || null;
  }

  // Search by name
  const results = await searchWilayah(name, 1, env);
  if (results.length > 0) return results[0].code;

  // Fallback to hardcoded map
  const known: Record<string, string> = {
    "jakarta": "31.71.03.1001", "kemayoran": "31.71.03.1001",
    "gambir": "31.71.01.1001", "bandung": "32.73.07.1001",
    "cibeunying": "32.73.07.1001", "semarang": "33.74.07.1001",
    "surabaya": "35.78.03.1001", "yogyakarta": "34.71.07.1001",
    "jogja": "34.71.07.1001", "medan": "12.71.07.1001",
    "makassar": "73.71.07.1001", "denpasar": "51.71.07.1001",
    "bali": "51.71.07.1001", "palembang": "16.71.07.1001",
    "batam": "21.71.07.1001", "bogor": "32.71.07.1001",
    "depok": "32.76.07.1001", "tangerang": "36.71.07.1001",
    "bekasi": "32.75.07.1001",
  };
  return known[name.toLowerCase()] || null;
}

// ===== Custom Format (Waybar-style) =====
function formatCustom(template: string, current: SimpleForecast, location: LocationInfo): string {
  const hour = new Date(current.time).getHours();
  const icon = weatherEmoji(current.weather, hour);
  const asciiIcon = asciiIconSingle(current.weather, hour);
  const windArrow = getWindArrow(current.windDir);
  
  return template
    .replace(/\{ICON\}/g, icon)
    .replace(/\{ICON_ASCII\}/g, asciiIcon)
    .replace(/\{t\}/g, String(current.temp))
    .replace(/\{temp\}/g, formatTemp(current.temp))
    .replace(/\{hu\}/g, String(current.humidity))
    .replace(/\{humidity\}/g, String(current.humidity))
    .replace(/\{tcc\}/g, String(current.cloudCover))
    .replace(/\{cloud\}/g, String(current.cloudCover))
    .replace(/\{tp\}/g, String(current.rainProb / 100))
    .replace(/\{rain\}/g, String(current.rainProb))
    .replace(/\{ws\}/g, current.windSpeed.toFixed(1))
    .replace(/\{wind\}/g, current.windSpeed.toFixed(1))
    .replace(/\{wd_deg\}/g, String(current.windDir))
    .replace(/\{wd\}/g, current.windDir)
    .replace(/\{wind_dir\}/g, current.windDir)
    .replace(/\{weather_desc\}/g, current.condition)
    .replace(/\{weather_desc_en\}/g, current.conditionEn)
    .replace(/\{condition\}/g, current.condition)
    .replace(/\{vs_text\}/g, current.windSpeed >= 10 ? "Windy" : "Calm")
    .replace(/\{desa\}/g, location.desa)
    .replace(/\{kecamatan\}/g, location.kecamatan)
    .replace(/\{kotkab\}/g, location.kotkab)
    .replace(/\{provinsi\}/g, location.provinsi);
}

// ===== Helpers =====
function formatTemp(temp: number): string {
  return `${temp >= 0 ? "+" : ""}${temp}°C`;
}


function getWindArrow(dir: string): string {
  const arrows: Record<string, string> = {
    "N": "↑", "NNE": "↑", "NE": "↗", "ENE": "→",
    "E": "→", "ESE": "→", "SE": "↘", "SSE": "↓",
    "S": "↓", "SSW": "↓", "SW": "↙", "WSW": "←",
    "W": "←", "WNW": "←", "NW": "↖", "NNW": "↑",
  };
  return arrows[dir] || "↗";
}

// ===== AI Weather Report Generation =====
async function generateAIReport(
  ai: any,
  data: { location: BmkgResponse["lokasi"]; forecast: SimpleForecast[]; analysisDate: string },
  warnings: Warning[],
  style: string
): Promise<string> {
  const current = data.forecast[0];
  const locationName = `${data.location.desa}, ${data.location.kecamatan}, ${data.location.kotkab}`;
  
  // Build forecast summary for next 24h
  const next24h = data.forecast.slice(0, 8).map(f => {
    const hour = new Date(f.time).getHours();
    return `${hour.toString().padStart(2, "0")}:00 ${f.condition} ${f.temp}°C (rain ${f.rainProb}%, wind ${f.windSpeed}km/h ${f.windDir})`;
  }).join("; ");
  
  const warningText = warnings.length > 0
    ? warnings.map(w => `${w.event} (${w.severity}): ${w.description?.slice(0, 200)}`).join("; ")
    : "No weather warnings.";
  
  const stylePrompts = {
    brief: `Write a 2-sentence weather summary for ${locationName}. Current: ${current.condition} ${current.temp}°C. Be concise.`,
    detailed: `Write a detailed weather report for ${locationName}. Include current conditions, 24h forecast, and any warnings. Use natural Indonesian language.`,
    conversational: `Write a friendly, conversational weather update for someone in ${locationName}. Like a local friend telling you about the weather. Mention what to expect and any advice.`,  
  };
  
  const prompt = stylePrompts[style as keyof typeof stylePrompts] || stylePrompts.brief;
  
  const response = await ai.run("@cf/meta/llama-3.1-8b-instruct", {
    messages: [
      { role: "system", content: "You are a helpful Indonesian weather assistant. Write in Indonesian. Keep responses natural and helpful." },
      { role: "user", content: `${prompt}

Current: ${current.condition} ${current.temp}°C, humidity ${current.humidity}%, wind ${current.windSpeed}km/h ${current.windDir}
Next 24h: ${next24h}
Warnings: ${warningText}` }
    ],
    max_tokens: style === "detailed" ? 300 : 150,
    temperature: 0.7,
  });
  
  return response.response || "Unable to generate report.";
}

function json(data: unknown, status = 200, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...extraHeaders },
  });
}