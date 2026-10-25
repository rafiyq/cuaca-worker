// Custom format templates (Waybar-style) + helpers

import type { SimpleForecast, LocationInfo, Warning } from "./render";
import type { BmkgResponse } from "./types";
import { weatherEmoji, asciiIconSingle } from "./render";

// ===== Custom Format (Waybar-style) =====
export function formatCustom(template: string, current: SimpleForecast, location: LocationInfo): string {
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
export function formatTemp(temp: number): string {
  return `${temp >= 0 ? "+" : ""}${temp}°C`;
}


export function getWindArrow(dir: string): string {
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
  
  const response = await ai.run("@cf/meta/llama-3.1-8b-instruct-fp8", {
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
