// AI weather report generation via Workers AI

import type { SimpleForecast, LocationInfo, Warning } from "./render";
import type { BmkgResponse } from "./types";

// ===== AI Weather Report Generation =====
export async function generateAIReport(
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
