// wttr.in-style terminal weather renderer
// Converts BMKG forecast to ANSI/HTML terminal output

export interface SimpleForecast {
  time: string;        // "2026-10-13 09:00:00"
  temp: number;        // 33
  condition: string;   // "Cerah"
  conditionEn: string; // "Sunny"
  humidity: number;    // 48
  windSpeed: number;   // 7.2
  windDir: string;     // "NE"
  cloudCover: number;  // 23
  rainProb: number;    // 0
  weather: number;     // BMKG weather code for icons
}

export interface LocationInfo {
  provinsi: string;
  kotkab: string;
  kecamatan: string;
  desa: string;
  lat: number;
  lon: number;
}

export interface Warning {
  id: string;
  event: string;
  severity: string;
  urgency: string;
  certainty: string;
  effective: string;
  expires: string;
  description: string;
  instruction: string;
  areaDesc: string;
  polygon?: string;
  geocode?: Record<string, string>;
}

// Weather code to ASCII art mapping (BMKG weather codes)
const WEATHER_ICONS: Record<number, { day: string; night: string; label: string }> = {
  0: { day: "☀️", night: "🌙", label: "Cerah" },
  1: { day: "🌤️", night: "🌙☁️", label: "Cerah Berawan" },
  2: { day: "⛅", night: "☁️🌙", label: "Berawan" },
  3: { day: "☁️", night: "☁️", label: "Berawan" },
  4: { day: "☁️", night: "☁️", label: "Berawan Tebal" },
  5: { day: "🌫️", night: "🌫️", label: "Kabut" },
  10: { day: "🌦️", night: "🌧️🌙", label: "Hujan Ringan" },
  11: { day: "🌧️", night: "🌧️", label: "Hujan" },
  12: { day: "⛈️", night: "⛈️", label: "Hujan Lebat" },
  13: { day: "⛈️", night: "⛈️", label: "Hujan Petir" },
  14: { day: "⛈️", night: "⛈️", label: "Hujan Petir Lebat" },
  20: { day: "🌨️", night: "🌨️", label: "Salju Ringan" },
  21: { day: "❄️", night: "❄️", label: "Salju" },
  22: { day: "❄️", night: "❄️", label: "Salju Lebat" },
  30: { day: "🌪️", night: "🌪️", label: "Angin Kencang" },
  40: { day: "🌫️", night: "🌫️", label: "Kabut Asap" },
  50: { day: "🌫️", night: "🌫️", label: "Kabut" },
  60: { day: "💧", night: "💧", label: "Hujan Beku" },
  61: { day: "💧", night: "💧", label: "Hujan Beku Lebat" },
  63: { day: "🌨️", night: "🌨️", label: "Salju Berbatu" },
  80: { day: "🌦️", night: "🌧️🌙", label: "Hujan Lokal" },
  95: { day: "🌪️", night: "🌪️", label: "Badai" },
  99: { day: "🌪️", night: "🌪️", label: "Badai Ekstrem" },
};

// Simple ASCII art for terminal (no emoji fallback)
const ASCII_ICONS: Record<number, { day: string; night: string }> = {
  0: { day: ".-.", night: "`-'" },           // Sunny
  1: { day: ".-.", night: "`-'" },           // Clear night
  2: { day: ".--.", night: ".--." },         // Partly cloudy
  3: { day: ".--.", night: ".--." },         // Cloudy
  4: { day: ".--.", night: ".--." },         // Overcast
  5: { day: "(_)", night: "(_)" },           // Fog
  10: { day: ".-.", night: "`-'" },          // Light rain
  11: { day: ".-.", night: "`-'" },          // Rain
  12: { day: ".-.", night: "`-'" },          // Heavy rain
  13: { day: ".-.", night: "`-'" },          // Thunderstorm
  14: { day: ".-.", night: "`-'" },          // Heavy thunderstorm
};

function getIcon(weatherCode: number, hour: number): { day: string; night: string; label: string } {
  const isDay = hour >= 6 && hour < 18;
  const icon = WEATHER_ICONS[weatherCode] || WEATHER_ICONS[0];
  return icon;
}

function getAsciiIcon(weatherCode: number, hour: number): string {
  const isDay = hour >= 6 && hour < 18;
  const icon = ASCII_ICONS[weatherCode] || ASCII_ICONS[0];
  return isDay ? icon.day : icon.night;
}

// Wind direction to arrow
function windArrow(dir: string): string {
  const arrows: Record<string, string> = {
    "N": "↑", "NNE": "↑", "NE": "↗", "ENE": "→",
    "E": "→", "ESE": "→", "SE": "↘", "SSE": "↓",
    "S": "↓", "SSW": "↓", "SW": "↙", "WSW": "←",
    "W": "←", "WNW": "←", "NW": "↖", "NNW": "↑",
  };
  return arrows[dir] || "↗";
}

function formatTemp(temp: number): string {
  const sign = temp >= 0 ? "+" : "";
  return `${sign}${temp}°C`;
}

function formatWind(speed: number, dir: string): string {
  return `${windArrow(dir)} ${speed.toFixed(1)} km/h`;
}

function groupByDay(forecast: SimpleForecast[]): Map<string, SimpleForecast[]> {
  const days = new Map<string, SimpleForecast[]>();
  for (const f of forecast) {
    const date = f.time.split(" ")[0];
    if (!days.has(date)) days.set(date, []);
    days.get(date)!.push(f);
  }
  return days;
}

function getPeriodKey(hour: number): "Morning" | "Noon" | "Evening" | "Night" {
  if (hour >= 5 && hour < 11) return "Morning";
  if (hour >= 11 && hour < 17) return "Noon";
  if (hour >= 17 && hour < 23) return "Evening";
  return "Night";
}

// ANSI-aware string width (ignores escape codes)
function ansiWidth(str: string): number {
  return str.replace(/\x1b\[[0-9;]*m/g, "").length;
}

// Pad/truncate to exact visual width
function padCell(content: string, width: number): string {
  const w = ansiWidth(content);
  if (w >= width) {
    // Truncate preserving ANSI codes (simple approach)
    return content.slice(0, width + (content.length - w));
  }
  return content + " ".repeat(width - w);
}

// ANSI color codes
const ANSI = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[38;5;196m",
  orange: "\x1b[38;5;202m",
  yellow: "\x1b[38;5;226m",
  green: "\x1b[38;5;118m",
  cyan: "\x1b[38;5;51m",
  blue: "\x1b[38;5;39m",
  magenta: "\x1b[38;5;201m",
  gray: "\x1b[38;5;244m",
  white: "\x1b[38;5;255m",
  bgBlack: "\x1b[40m",
  bgBlue: "\x1b[44m",
  bgRed: "\x1b[41m",
  bgYellow: "\x1b[43m",
};

function ansiTemp(temp: number): string {
  if (temp >= 35) return `${ANSI.red}${formatTemp(temp)}${ANSI.reset}`;
  if (temp >= 30) return `${ANSI.orange}${formatTemp(temp)}${ANSI.reset}`;
  if (temp >= 25) return `${ANSI.yellow}${formatTemp(temp)}${ANSI.reset}`;
  if (temp >= 20) return `${ANSI.green}${formatTemp(temp)}${ANSI.reset}`;
  return `${ANSI.cyan}${formatTemp(temp)}${ANSI.reset}`;
}

function ansiWarning(severity: string): string {
  const s = severity.toLowerCase();
  if (s === "extreme" || s === "severe") return `${ANSI.bgRed}${ANSI.white} ${severity} ${ANSI.reset}`;
  if (s === "moderate") return `${ANSI.bgYellow}${ANSI.black} ${severity} ${ANSI.reset}`;
  if (s === "minor") return `${ANSI.yellow} ${severity} ${ANSI.reset}`;
  return `${ANSI.dim} ${severity} ${ANSI.reset}`;
}

// Render plain text (ANSI) for curl
export function renderTerminal(
  location: LocationInfo, 
  forecast: SimpleForecast[], 
  warnings: Warning[] = []
): string {
  const lines: string[] = [];
  const days = groupByDay(forecast);
  
  // Header
  lines.push(`${ANSI.bold}Weather report: ${location.desa}, ${location.kecamatan}${ANSI.reset}`);
  lines.push("");
  
  // Current conditions (first forecast item)
  const current = forecast[0];
  const currentHour = new Date(current.time).getHours();
  
  lines.push(`     ${getAsciiIcon(current.weather || 0, currentHour)}       ${current.condition}`);
  lines.push(`      __)      ${ansiTemp(current.temp)}`);
  lines.push(`     (         ${formatWind(current.windSpeed, current.windDir)}`);
  lines.push(`      \`-’      ${current.humidity}% humidity`);
  lines.push(`       •       ${current.rainProb}% rain`);
  lines.push("");
  
  // Weather Warnings
  if (warnings.length > 0) {
    lines.push(`${ANSI.bgRed}${ANSI.white} ⚠ WEATHER WARNINGS ${ANSI.reset}`);
    for (const w of warnings.slice(0, 3)) {
      const severity = ansiWarning(w.severity);
      lines.push(`${severity} ${w.event} (${w.areaDesc})`);
      lines.push(`  ${ANSI.dim}${w.effective} → ${w.expires}${ANSI.reset}`);
      if (w.description) {
        const desc = w.description.split("\n")[0].slice(0, 80);
        lines.push(`  ${desc}`);
      }
    }
    lines.push("");
  }
  
  // 3-day forecast table
  let dayCount = 0;
  for (const [date, dayForecasts] of days) {
    if (dayCount >= 3) break;
    dayCount++;
    
    const dayName = new Date(date).toLocaleDateString("en-US", { weekday: "short", day: "numeric", month: "short" });
    lines.push(`${ANSI.bgBlue}${ANSI.white} ${dayName} ${ANSI.reset}`);
    
    // Group by period
    const periods = new Map<string, SimpleForecast[]>();
    for (const f of dayForecasts) {
      const hour = new Date(f.time).getHours();
      const period = getPeriodKey(hour);
      if (!periods.has(period)) periods.set(period, []);
      periods.get(period)!.push(f);
    }
    
    // Use middle forecast for each period
    const periodOrder = ["Morning", "Noon", "Evening", "Night"];
    const periodData: Record<string, SimpleForecast> = {};
    for (const p of periodOrder) {
      const arr = periods.get(p);
      if (arr && arr.length > 0) {
        periodData[p] = arr[Math.floor(arr.length / 2)];
      }
    }
    
    // Table header (each cell = 18 chars wide: 16 content + borders)
    lines.push("┌──────────────────┬──────────────────┬──────────────────┬──────────────────┐");
    lines.push("│     Morning      │      Noon        │    Evening       │      Night       │");
    lines.push("├──────────────────┼──────────────────┼──────────────────┼──────────────────┤");
    
    let iconRow = "│";
    let tempRow = "│";
    let windRow = "│";
    let rainRow = "│";
    
    for (const p of periodOrder) {
      const f = periodData[p];
      if (f) {
        const hour = new Date(f.time).getHours();
        const icon = getAsciiIcon(f.weather || 0, hour);
        const wIcon = getIcon(f.weather || 0, hour);
        
        // Each cell content max 16 chars, padded to 16
        const iconContent = ` ${icon} ${wIcon.label}`;
        const tempContent = ` ${ansiTemp(f.temp)}`;
        const windContent = ` ${formatWind(f.windSpeed, f.windDir)}`;
        const rainContent = ` ${f.rainProb}% ${f.humidity}%`;
        
        iconRow += padCell(iconContent, 16) + " │";
        tempRow += padCell(tempContent, 16) + " │";
        windRow += padCell(windContent, 16) + " │";
        rainRow += padCell(rainContent, 16) + " │";
      } else {
        iconRow += " ".repeat(16) + " │";
        tempRow += " ".repeat(16) + " │";
        windRow += " ".repeat(16) + " │";
        rainRow += " ".repeat(16) + " │";
      }
    }
    
    lines.push(iconRow);
    lines.push(tempRow);
    lines.push(windRow);
    lines.push(rainRow);
    lines.push("└──────────────────┴──────────────────┴──────────────────┴──────────────────┘");
    lines.push("");
  }
  
  lines.push(`Location: ${location.desa}, ${location.kecamatan}, ${location.kotkab}, ${location.provinsi} [${location.lat},${location.lon}]`);
  lines.push("");
  lines.push(`${ANSI.dim}Data: BMKG | Location: wilayah.workers.dev${ANSI.reset}`);
  
  return lines.join("\n");
}

// Render HTML for browser (with ANSI-to-HTML conversion)
export function renderHTML(
  location: LocationInfo, 
  forecast: SimpleForecast[], 
  warnings: Warning[] = []
): string {
  const terminalOutput = renderTerminal(location, forecast, warnings);
  
  // Convert ANSI to HTML spans
  let html = terminalOutput
    .replace(/&/g, "&")
    .replace(/</g, "<")
    .replace(/>/g, ">")
    // Bold, dim
    .replace(/\x1b\[1m/g, '<span class="bold">')
    .replace(/\x1b\[2m/g, '<span class="dim">')
    // Foreground colors
    .replace(/\x1b\[38;5;(\d+)m/g, (_, code) => `<span class="c${code}">`)
    // Background colors
    .replace(/\x1b\[48;5;(\d+)m/g, (_, code) => `<span class="bg${code}">`)
    // Common combined: blue bg + white fg
    .replace(/\x1b\[44m\x1b\[38;5;255m/g, '<span class="bg044 c255">')
    .replace(/\x1b\[44m/g, '<span class="bg044">')
    .replace(/\x1b\[41m/g, '<span class="bg196">')
    .replace(/\x1b\[43m/g, '<span class="bg226">')
    // Reset
    .replace(/\x1b\[0m/g, '</span>')
    .replace(/\n/g, "<br>");
  
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>cuaca - ${location.desa}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { 
      font-family: 'JetBrains Mono', 'Fira Code', 'Monaco', 'Consolas', monospace; 
      background: #1a1b26; color: #c0caf5; 
      padding: 20px; line-height: 1.6; font-size: 14px;
      min-height: 100vh;
    }
    .bold { font-weight: bold; }
    .dim { opacity: 0.6; }
    .c196 { color: #ff0000; } .c202 { color: #ff5f00; } .c208 { color: #ff8700; }
    .c214 { color: #ffaf00; } .c220 { color: #ffd700; } .c226 { color: #ffff00; }
    .c118 { color: #87ff00; } .c082 { color: #5fff00; } .c154 { color: #87ff5f; }
    .c190 { color: #d7ff00; } .c220 { color: #ffd700; }
    .c201 { color: #ff00ff; } .c039 { color: #00afff; } .c051 { color: #00ffff; }
    .c244 { color: #767676; } .c255 { color: #ffffff; }
    .bg044 { background: #0000af; }
    .bg196 { background: #ff0000; color: #fff; }
    .bg226 { background: #ffff00; color: #000; }
    pre { white-space: pre-wrap; word-wrap: break-word; }
    a { color: #7aa2f7; text-decoration: none; }
    a:hover { text-decoration: underline; }
    .hint { color: #565f89; font-size: 12px; margin-top: 20px; }
  </style>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;700&display=swap" rel="stylesheet">
</head>
<body>
<pre>${html}</pre>
<div class="hint">
  Try: <code>curl ${location.desa}</code> | <code>curl wttr.in</code> style<br>
  Data: <a href="https://bmkg.go.id" target="_blank">BMKG</a> | Geo: <a href="https://api.wilayah.workers.dev" target="_blank">wilayah.workers.dev</a> | Built with Cloudflare Workers
</div>
</body></html>`;
}

// Detect if request wants HTML (browser) or plain text (curl)
export function wantsHTML(request: Request): boolean {
  const accept = request.headers.get("accept") || "";
  const userAgent = request.headers.get("user-agent") || "";
  return accept.includes("text/html") && !userAgent.includes("curl");
}