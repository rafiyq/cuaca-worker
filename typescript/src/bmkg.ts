// BMKG API client: forecast + warnings (CAP XML parsing)

import type { BmkgResponse, BmkgForecastItem } from "./types";
import type { SimpleForecast, LocationInfo, Warning } from "./render";

const BMKG_BASE = "https://api.bmkg.go.id/publik/prakiraan-cuaca";

export async function fetchForecast(adm4: string): Promise<{
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
export async function fetchWarnings(adm4: string): Promise<Array<{
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

export function parseCAPWarnings(xml: string): Array<any> {
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

export function toLocationInfo(data: Awaited<ReturnType<typeof fetchForecast>>): LocationInfo {
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
