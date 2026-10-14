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

interface SimpleForecast {
  time: string; temp: number; condition: string; conditionEn: string;
  humidity: number; windSpeed: number; windDir: string; cloudCover: number; rainProb: number;
  weather: number;
}

interface LocationInfo {
  provinsi: string; kotkab: string; kecamatan: string; desa: string;
  lat: number; lon: number; adm4: string;
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

import { renderTerminal, renderHTML, wantsHTML, SimpleForecast, LocationInfo } from "./render";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
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
        const results = await searchWilayah(q, limit);
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
        const results = await nearestWilayah(lat, lon, limit);
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
        const result = await locateWilayah(lat, lon);
        return json(result, 200, corsHeaders);
      } catch (e) {
        return json({ error: "Failed to locate", detail: String(e) }, 502, corsHeaders);
      }
    }

    // GET / - Terminal weather (auto-location via GeoIP or default)
    if (url.pathname === "/" || url.pathname === "/weather") {
      const adm4 = await resolveAdm4FromRequest(request, url);
      try {
        const [data, warnings] = await Promise.all([
          fetchForecast(adm4),
          fetchWarnings(adm4).catch(() => []),
        ]);
        
        const location: LocationInfo = {
          provinsi: data.location.provinsi,
          kotkab: data.location.kotkab,
          kecamatan: data.location.kecamatan,
          desa: data.location.desa,
          lat: data.location.lat,
          lon: data.location.lon,
          adm4: data.location.adm4,
        };

        const format = url.searchParams.get("format");
        
        if (format === "3" || format === "short") {
          const current = data.forecast[0];
          const icon = getWeatherEmoji(current.weather, new Date(current.time).getHours());
          const text = `${location.desa}: ${icon} ${formatTemp(current.temp)}`;
          return new Response(text, {
            headers: { "Content-Type": "text/plain; charset=utf-8", ...corsHeaders },
          });
        }
        
        if (format && !["3", "short"].includes(format)) {
          // Custom format like Waybar: {ICON} {t}°C
          const current = data.forecast[0];
          const formatted = formatCustom(format, current, location);
          return new Response(formatted, {
            headers: { "Content-Type": "text/plain; charset=utf-8", ...corsHeaders },
          });
        }

        if (wantsHTML(request)) {
          return new Response(renderHTML(location, data.forecast, warnings), {
            headers: { "Content-Type": "text/html; charset=utf-8", ...corsHeaders },
          });
        } else {
          return new Response(renderTerminal(location, data.forecast, warnings), {
            headers: { "Content-Type": "text/plain; charset=utf-8", ...corsHeaders },
          });
        }
      } catch (e) {
        return new Response(`Error: ${e}`, { status: 502, headers: corsHeaders });
      }
    }

    // GET /:location - Location by name/code with format support
    if (url.pathname.startsWith("/") && url.pathname.length > 1 && !url.pathname.startsWith("/api")) {
      const locationName = url.pathname.slice(1);
      const adm4 = await resolveLocation(locationName) || "31.71.03.1001";
      const format = url.searchParams.get("format");
      
      try {
        const [data, warnings] = await Promise.all([
          fetchForecast(adm4),
          fetchWarnings(adm4).catch(() => []),
        ]);
        
        const location: LocationInfo = {
          provinsi: data.location.provinsi,
          kotkab: data.location.kotkab,
          kecamatan: data.location.kecamatan,
          desa: data.location.desa,
          lat: data.location.lat,
          lon: data.location.lon,
          adm4: data.location.adm4,
        };

        if (format === "3" || format === "short") {
          const current = data.forecast[0];
          const icon = getWeatherEmoji(current.weather, new Date(current.time).getHours());
          const text = `${location.desa}: ${icon} ${formatTemp(current.temp)}`;
          return new Response(text, {
            headers: { "Content-Type": "text/plain; charset=utf-8", ...corsHeaders },
          });
        }
        
        if (format && !["3", "short"].includes(format)) {
          const current = data.forecast[0];
          const formatted = formatCustom(format, current, location);
          return new Response(formatted, {
            headers: { "Content-Type": "text/plain; charset=utf-8", ...corsHeaders },
          });
        }

        if (wantsHTML(request)) {
          return new Response(renderHTML(location, data.forecast, warnings), {
            headers: { "Content-Type": "text/html; charset=utf-8", ...corsHeaders },
          });
        } else {
          return new Response(renderTerminal(location, data.forecast, warnings), {
            headers: { "Content-Type": "text/plain; charset=utf-8", ...corsHeaders },
          });
        }
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
async function searchWilayah(query: string, limit: number): Promise<WilayahSearchResult[]> {
  const res = await fetch(`${WILAYAH_API}/search?q=${encodeURIComponent(query)}&limit=${limit}`, {
    headers: { "User-Agent": "cuaca-worker/1.0" },
    cf: { cacheTtl: 86400, cacheEverything: true }, // 24h cache
  });
  if (!res.ok) throw new Error(`Wilayah ${res.status}`);
  const data = await res.json();
  return data.results || [];
}

async function nearestWilayah(lat: number, lon: number, limit: number): Promise<WilayahSearchResult[]> {
  const res = await fetch(`${WILAYAH_API}/nearest?lat=${lat}&lon=${lon}&limit=${limit}`, {
    headers: { "User-Agent": "cuaca-worker/1.0" },
    cf: { cacheTtl: 86400, cacheEverything: true },
  });
  if (!res.ok) throw new Error(`Wilayah ${res.status}`);
  const data = await res.json();
  return data.results || [];
}

async function locateWilayah(lat: number, lon: number): Promise<any> {
  const res = await fetch(`${WILAYAH_API}/locate?lat=${lat}&lon=${lon}`, {
    headers: { "User-Agent": "cuaca-worker/1.0" },
    cf: { cacheTtl: 86400, cacheEverything: true },
  });
  if (!res.ok) throw new Error(`Wilayah ${res.status}`);
  return res.json();
}

async function getWilayahByCode(code: string): Promise<WilayahCodeResult | null> {
  const res = await fetch(`${WILAYAH_API}/code?q=${encodeURIComponent(code)}`, {
    headers: { "User-Agent": "cuaca-worker/1.0" },
    cf: { cacheTtl: 86400, cacheEverything: true },
  });
  if (!res.ok) return null;
  return res.json();
}

// ===== Location Resolution =====
async function resolveAdm4FromRequest(request: Request, url: URL): Promise<string> {
  // 1. Explicit adm4 in query
  const explicitAdm4 = url.searchParams.get("adm4");
  if (explicitAdm4) return explicitAdm4;

  // 2. Explicit lat/lon in query
  const lat = url.searchParams.get("lat");
  const lon = url.searchParams.get("lon");
  if (lat && lon) {
    const nearest = await nearestWilayah(parseFloat(lat), parseFloat(lon), 1);
    if (nearest.length > 0) return nearest[0].code;
  }

  // 3. Cloudflare GeoIP headers
  const cfLat = request.headers.get("CF-IPLatitude");
  const cfLon = request.headers.get("CF-IPLongitude");
  if (cfLat && cfLon) {
    const nearest = await nearestWilayah(parseFloat(cfLat), parseFloat(cfLon), 1);
    if (nearest.length > 0) return nearest[0].code;
  }

  // 4. Default: Kemayoran, Jakarta
  return "31.71.03.1001";
}

async function resolveLocation(name: string): Promise<string | null> {
  // Try exact code first
  if (/^\d{2}(\.\d{2}){3}$/.test(name)) {
    const result = await getWilayahByCode(name);
    return result?.code || null;
  }

  // Search by name
  const results = await searchWilayah(name, 1);
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
  const icon = getWeatherEmoji(current.weather, hour);
  const asciiIcon = getAsciiIcon(current.weather, hour);
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

function getWeatherEmoji(code: number, hour: number): string {
  const isDay = hour >= 6 && hour < 18;
  const icons: Record<number, { day: string; night: string }> = {
    0: { day: "☀️", night: "🌙" },
    1: { day: "🌤️", night: "🌙☁️" },
    2: { day: "⛅", night: "☁️🌙" },
    3: { day: "☁️", night: "☁️" },
    4: { day: "☁️", night: "☁️" },
    5: { day: "🌫️", night: "🌫️" },
    10: { day: "🌦️", night: "🌧️" },
    11: { day: "🌧️", night: "🌧️" },
    12: { day: "⛈️", night: "⛈️" },
    13: { day: "⛈️", night: "⛈️" },
  };
  return (icons[code] || icons[0])[isDay ? "day" : "night"];
}

function getAsciiIcon(code: number, hour: number): string {
  const isDay = hour >= 6 && hour < 18;
  const icons: Record<number, { day: string; night: string }> = {
    0: { day: ".-.", night: "`-'" },
    1: { day: ".-.", night: "`-'" },
    2: { day: ".--.", night: ".--." },
    3: { day: ".--.", night: ".--." },
    4: { day: ".--.", night: ".--." },
    5: { day: "(_)", night: "(_)" },
    10: { day: ".-.", night: "`-'" },
    11: { day: ".-.", night: "`-'" },
    12: { day: ".-.", night: "`-'" },
    13: { day: ".-.", night: "`-'" },
  };
  return (icons[code] || icons[0])[isDay ? "day" : "night"];
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

function json(data: unknown, status = 200, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...extraHeaders },
  });
}