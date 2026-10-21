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

// 5-line ASCII art with 256-color tokens, ported from cuaca-rs (icons.rs)
// Token format: {38;5;NNN} or {38;5;NNN;1} expanded to ANSI by expandColorTokens()
// All art is 13 chars wide. Codes match the real BMKG weather codes.

const ICON_SUNNY = [
  "{38;5;226}    \\ . /    ",
  "{38;5;226}   - .-. -   ",
  "{38;5;226}  ‒ (   ) ‒  ",
  "{38;5;226}   . `-᾿ .   ",
  "{38;5;226}    / ' \\    ",
];

const ICON_NIGHT_CLEAR = [
  "{38;5;228}    *        ",
  "{38;5;228}  .--.  *    ",
  "{38;5;228} (    )      ",
  "{38;5;228}  `--'   *   ",
  "{38;5;228}       *     ",
];

const ICON_PARTLY_CLOUDY = [
  "{38;5;226}   \\__/      ",
  "{38;5;226} __/  {38;5;250}.-.    ",
  "{38;5;226}   \\_{38;5;250}(   ).  ",
  "{38;5;226}   /{38;5;250}(___(__) ",
  "             ",
];

const ICON_CLOUDY = [
  "             ",
  "{38;5;250}     .--.    ",
  "{38;5;250}  .-(    ).  ",
  "{38;5;250} (___.__)__) ",
  "             ",
];

const ICON_VERY_CLOUDY = [
  "             ",
  "{38;5;244;1}     .--.    ",
  "{38;5;244;1}  .-(    ).  ",
  "{38;5;244;1} (___.__)__) ",
  "             ",
];

const ICON_FOG = [
  "             ",
  "{38;5;251} _ - _ - _ - ",
  "{38;5;251}  _ - _ - _  ",
  "{38;5;251} _ - _ - _ - ",
  "             ",
];

const ICON_LIGHT_RAIN = [
  "{38;5;250}     .-.     ",
  "{38;5;250}    (   ).   ",
  "{38;5;250}   (___(__)  ",
  "{38;5;111}    ʻ ʻ ʻ ʻ  ",
  "{38;5;111}   ʻ ʻ ʻ ʻ   ",
];

const ICON_HEAVY_RAIN = [
  "{38;5;244;1}     .-.     ",
  "{38;5;244;1}    (   ).   ",
  "{38;5;244;1}   (___(__)  ",
  "{38;5;33;1}  ‚ʻ‚ʻ‚ʻ‚ʻ   ",
  "{38;5;33;1}  ‚ʻ‚ʻ‚ʻ‚ʻ   ",
];

const ICON_THUNDERSTORM = [
  "{38;5;244;1}     .-.     ",
  "{38;5;244;1}    (   ).   ",
  "{38;5;244;1}   (___(__)  ",
  "{38;5;33;1}  ‚ʻ{38;5;228;1}⚡{38;5;33;1}ʻ‚{38;5;228;1}⚡{38;5;33;1}‚ʻ   ",
  "{38;5;33;1}  ‚ʻ‚ʻ{38;5;228;1}⚡{38;5;33;1}ʻ‚ʻ   ",
];

const ICON_UNKNOWN = [
  "    .-.      ",
  "     __)     ",
  "    (        ",
  "     `-᾿     ",
  "      •      ",
];

// BMKG weather code -> ASCII art (mapping from cuaca-rs ascii_icon())
function asciiArt(weatherCode: number, isDay: boolean): string[] {
  const icon = (() => {
    switch (weatherCode) {
      case 0:
      case 1: return isDay ? ICON_SUNNY : ICON_NIGHT_CLEAR;
      case 2: return ICON_PARTLY_CLOUDY;
      case 3: return ICON_CLOUDY;
      case 4: return ICON_VERY_CLOUDY;
      case 5:
      case 10:
      case 45: return ICON_FOG;
      case 60:
      case 61: return ICON_LIGHT_RAIN;
      case 63:
      case 80: return ICON_HEAVY_RAIN;
      case 95:
      case 97: return ICON_THUNDERSTORM;
      default: return ICON_UNKNOWN;
    }
  })();
  return icon;
}

function getAsciiIcon(weatherCode: number, hour: number): string[] {
  const isDay = hour >= 6 && hour < 18;
  return asciiArt(weatherCode, isDay);
}

// Expand {sgr} color tokens to ANSI escapes; strips tokens when colors are off.
// Ported from cuaca-rs color.rs expand_color_tokens().
function expandColorTokens(s: string): string {
  let out = "";
  let inColor = false;
  let i = 0;
  while (i < s.length) {
    if (s[i] === "{") {
      const end = s.indexOf("}", i);
      if (end === -1) { out += s[i]; i++; continue; }
      const content = s.slice(i + 1, end);
      if (/^[0-9;]+$/.test(content)) {
        if (inColor) out += "\x1b[0m";
        out += `\x1b[${content}m`;
        inColor = true;
      }
      i = end + 1;
    } else {
      out += s[i];
      i++;
    }
  }
  if (inColor) out += ANSI.reset;
  return out;
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

// Signed number only, no unit (for the big current-temp display where °C is a separate span)
function formatTempNum(temp: number): string {
  const sign = temp >= 0 ? "+" : "";
  return `${sign}${temp}`;
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

// ANSI-aware string width (ignores escape codes)
function ansiWidth(str: string): number {
  return str.replace(/\x1b\[[0-9;]*m/g, "").length;
}

// Pad/truncate to exact visual width
function padCell(content: string, width: number): string {
  const w = ansiWidth(content);
  if (w >= width) {
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
  if (s === "moderate") return `${ANSI.bgYellow}${ANSI.gray} ${severity} ${ANSI.reset}`;
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
  
  // Current conditions (first forecast item) — real 5-line icon
  const current = forecast[0];
  const currentHour = new Date(current.time).getHours();
  const currentIcon = getAsciiIcon(current.weather || 0, currentHour).map(expandColorTokens);
  
  lines.push(`    ${currentIcon[0]}    ${current.condition}`);
  lines.push(`    ${currentIcon[1]}    ${ansiTemp(current.temp)}`);
  lines.push(`    ${currentIcon[2]}    ${formatWind(current.windSpeed, current.windDir)}`);
  lines.push(`    ${currentIcon[3]}    ${current.humidity}% humidity`);
  lines.push(`    ${currentIcon[4]}    ${current.rainProb}% rain`);
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
  
  // 3-day forecast table - actual BMKG hours as columns
  let dayCount = 0;
  for (const [date, dayForecasts] of days) {
    if (dayCount >= 3) break;
    dayCount++;
    
    const dayName = new Date(date).toLocaleDateString("en-US", { weekday: "short", day: "2-digit", month: "short" });
    lines.push(`${ANSI.bgBlue}${ANSI.white} ${dayName} ${ANSI.reset}`);
    
    // Sort by hour and take up to 8 slots (24 hours)
    const sortedSlots = dayForecasts
      .sort((a, b) => new Date(a.time).getHours() - new Date(b.time).getHours())
      .slice(0, 8);
    
    // Build columns from actual slots with time strings
    const slots = sortedSlots.map(f => ({
      hour: new Date(f.time).getHours(),
      timeStr: `${new Date(f.time).getHours().toString().padStart(2, "0")}:00`,
      forecast: f
    }));
    
    const cellW = 30;
    const n = slots.length;
    
    // Top border with day header
    let top = "┌";
    for (let i = 0; i < n; i++) {
      top += "─".repeat(cellW) + (i === n-1 ? "┐" : "┬");
    }
    lines.push(top);
    
    // Hour headers (e.g., 08:00, 11:00, 14:00...)
    let headerRow = "│";
    for (const s of slots) {
      headerRow += padCell(` ${s.timeStr} `, cellW) + "│";
    }
    lines.push(headerRow);
    
    // Separator
    let sep = "├";
    for (let i = 0; i < n; i++) {
      sep += "─".repeat(cellW) + (i === n-1 ? "┤" : "┼");
    }
    lines.push(sep);
    
    // Build each column: 5 rows, one real icon line + data per row
    const colBlocks: string[][] = [];
    for (const s of slots) {
      const f = s.forecast;
      const hour = s.hour;
      const icon = getAsciiIcon(f.weather || 0, hour).map(expandColorTokens);
      
      colBlocks.push([
        padCell(` ${icon[0]} ` + ` ${f.condition} `, cellW),
        padCell(` ${icon[1]} ` + ` ${ansiTemp(f.temp)} `, cellW),
        padCell(` ${icon[2]} ` + ` ${formatWind(f.windSpeed, f.windDir)} `, cellW),
        padCell(` ${icon[3]} ` + ` ${f.cloudCover}% cloud R${f.rainProb}% `, cellW),
        padCell(` ${icon[4]} ` + ` ${f.humidity}% humidity `, cellW),
      ]);
    }
    
    // Print 5 content rows (icon on left of each)
    for (let lineIdx = 0; lineIdx < 5; lineIdx++) {
      let line = "│";
      for (let colIdx = 0; colIdx < n; colIdx++) {
        line += colBlocks[colIdx][lineIdx] + "│";
      }
      lines.push(line);
    }
    
    // Bottom border
    let bot = "└";
    for (let i = 0; i < n; i++) {
      bot += "─".repeat(cellW) + (i === n-1 ? "┘" : "┴");
    }
    lines.push(bot);
    lines.push("");
  }
  
  lines.push(`Location: ${location.desa}, ${location.kecamatan}, ${location.kotkab}, ${location.provinsi} [${location.lat},${location.lon}]`);
  lines.push("");
  lines.push(`${ANSI.dim}Data: BMKG | Location: wilayah.workers.dev${ANSI.reset}`);
  
  return lines.join("\n");
}

// ASCII icon as HTML: expand {sgr} tokens into colored <span>s (browser view)
// Colors follow the xterm-256 palette: 226 yellow, 250/251 gray, 244 dark gray,
// 33 blue, 111 light blue, 228 pale yellow. ";1" suffix -> bold.
function asciiIconHtml(weatherCode: number, hour: number): string {
  const icon = getAsciiIcon(weatherCode, hour);
  return icon.map(line => {
    let out = "";
    let open = false;
    let i = 0;
    while (i < line.length) {
      if (line[i] === "{") {
        const end = line.indexOf("}", i);
        if (end === -1) { out += line[i]; i++; continue; }
        const content = line.slice(i + 1, end);
        const m = content.match(/^38;5;(\d+)(;1)?$/);
        if (m) {
          if (open) out += "</span>";
          out += `<span class="ac-${m[1]}${m[2] ? " ac-bold" : ""}">`;
          open = true;
        }
        i = end + 1;
      } else {
        out += line[i];
        i++;
      }
    }
    if (open) out += "</span>";
    return out || "&nbsp;";
  }).join("\n");
}

// Render HTML for browser - Modern styled weather page
export function renderHTML(
  location: LocationInfo, 
  forecast: SimpleForecast[], 
  warnings: Warning[] = []
): string {
  const days = groupByDay(forecast);
  const current = forecast[0];
  const currentHour = new Date(current.time).getHours();
  const isDay = currentHour >= 6 && currentHour < 18;
  
  // Build forecast data for template
  const dayBlocks = [];
  let dayCount = 0;
  for (const [date, dayForecasts] of days) {
    if (dayCount >= 3) break;
    dayCount++;
    
    const dayName = new Date(date).toLocaleDateString("en-US", { weekday: "short", day: "2-digit", month: "short" });
    const dayLabel = dayCount === 1 ? "Today" : dayCount === 2 ? "Tomorrow" : "Day after";
    
    const sortedSlots = dayForecasts
      .sort((a, b) => new Date(a.time).getHours() - new Date(b.time).getHours())
      .slice(0, 8);
    
    const slots = sortedSlots.map(f => {
      const date = new Date(f.time);
      const hour = date.getHours();
      return {
        hour,
        timeStr: `${hour.toString().padStart(2, "0")}:00`,
        temp: f.temp,
        condition: f.condition, // raw BMKG weather_desc
        humidity: f.humidity,
        windSpeed: f.windSpeed,
        windDir: f.windDir,
        cloudCover: f.cloudCover,
        rainProb: f.rainProb,
        weatherCode: f.weather || 0,
        art: asciiIconHtml(f.weather || 0, hour),
        isDay: hour >= 6 && hour < 18
      };
    });
    
    dayBlocks.push({ date, dayName: dayLabel, dayLabel, slots });
  }
  
  // Current conditions
  const currentLabel = current.condition; // raw BMKG weather_desc
  
  // Warnings HTML
  const warningsHtml = warnings.length > 0
    ? warnings.slice(0, 3).map(w => `
      <div class="warning-card ${w.severity.toLowerCase()}">
        <div class="warning-header">
          <span class="warning-icon">⚠</span>
          <span class="warning-event">${w.event}</span>
          <span class="warning-severity ${w.severity.toLowerCase()}">${w.severity}</span>
        </div>
        <div class="warning-area">${w.areaDesc}</div>
        <div class="warning-time">${w.effective} → ${w.expires}</div>
        ${w.description ? `<div class="warning-desc">${w.description.split("\n")[0].slice(0, 120)}</div>` : ""}
      </div>`).join("")
    : "";
  
  // Location string
  const locationStr = `${location.desa}, ${location.kecamatan}, ${location.kotkab}, ${location.provinsi}`;
  
  // Current conditions
  
  // Temp color class helper
  function getTempClass(temp: number): string {
    if (temp >= 35) return "temp-hot";
    if (temp >= 30) return "temp-warm";
    if (temp >= 25) return "temp-mild";
    if (temp >= 20) return "temp-cool";
    return "temp-cold";

// Helper to get current icon lines for header
  }
  
  return `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="description" content="Cuaca ${location.desa} - BMKG Weather Forecast">
  <meta name="theme-color" content="#1e1e2e">
  <title>cuaca - ${location.desa}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    
    :root {
      --bg: #181825;
      --bg-elevated: #1e1e2e;
      --fg: #cdd6f4;
      --fg-muted: #6c7086;
      --accent: #89b4fa;
      --accent-dim: #74c7ec;
      --warm: #fab387;
      --hot: #f38ba8;
      --cool: #89dceb;
      --green: #a6e3a1;
      --border: #313244;
      --shadow: 0 4px 24px rgba(0,0,0,0.4);
    }
    
    @media (prefers-color-scheme: light) {
      :root {
        --bg: #eff1f5;
        --bg-elevated: #ffffff;
        --fg: #4c4f69;
        --fg-muted: #7287fd;
        --accent: #1e66f5;
        --accent-dim: #04a5e5;
        --warm: #df8e1d;
        --hot: #d20f39;
        --cool: #04a5e5;
        --green: #40a02b;
        --border: #ccd0da;
      }
      /* darken art colors for light bg readability */
      .ac-226 { color: #b8860b; }
      .ac-228 { color: #a08000; }
      .ac-250 { color: #6c7086; }
      .ac-251 { color: #7c819c; }
      .ac-244 { color: #5b5f73; }
      .ac-33 { color: #005f87; }
      .ac-111 { color: #3a5fa3; }
    }
    
    * { box-sizing: border-box; margin: 0; padding: 0; }
    
    * { box-sizing: border-box; margin: 0; padding: 0; }
    
    body {
      font-family: 'JetBrains Mono', 'Fira Code', 'Monaco', 'Consolas', monospace;
      background: var(--bg);
      color: var(--fg);
      min-height: 100vh;
      padding: 24px 16px;
      line-height: 1.5;
      font-size: 14px;
      transition: background 0.3s, color 0.3s;
    }
    
    .container {
      max-width: 900px;
      margin: 0 auto;
    }
    
    /* Header */
    header {
      margin-bottom: 32px;
      padding-bottom: 24px;
      border-bottom: 1px solid var(--border);
    }
    
    .location-header {
      display: flex;
      align-items: flex-start;
      gap: 16px;
      margin-bottom: 8px;
    }
    
    .location-icon.ascii-art {
      font-family: inherit;
      font-size: 16px;
      line-height: 1.25;
      margin: 2px 14px 0 0;
      flex-shrink: 0;
      filter: drop-shadow(0 2px 6px rgba(0,0,0,0.25));
    }
    
    @keyframes float {
      0%, 100% { transform: translateY(0); }
      50% { transform: translateY(-4px); }
    }
    
    .location-info {
      flex: 1;
    }
    
    .location-name {
      font-size: 28px;
      font-weight: 700;
      letter-spacing: -0.5px;
      margin-bottom: 4px;
      background: linear-gradient(135deg, var(--accent), var(--accent-dim));
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
    }
    
    .location-meta {
      color: var(--fg-muted);
      font-size: 13px;
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
    }
    
    .current-condition {
      margin-top: 16px;
      font-size: 15px;
      color: var(--fg-muted);
    }
    
    /* Current Temp Card */
    .current-temp {
      display: inline-flex;
      align-items: center;
      gap: 20px;
      padding: 16px 24px;
      background: var(--bg-elevated);
      border: 1px solid var(--border);
      border-radius: 16px;
      box-shadow: var(--shadow);
      margin-top: 16px;
    }
    
    .temp-main {
      display: flex;
      align-items: baseline;
      gap: 2px;
    }
    
    .temp-value {
      font-size: 56px;
      font-weight: 700;
      line-height: 1;
      font-variant-numeric: tabular-nums;
    }
    
    .temp-unit { font-size: 20px; }
    
    .temp-detail {
      display: flex;
      flex-direction: column;
      gap: 4px;
      margin-left: 16px;
      padding-left: 16px;
      border-left: 1px solid var(--border);
    }
    
    .detail-row { display: flex; gap: 8px; align-items: center; font-size: 13px; }
    .detail-icon { color: var(--accent-dim); }
    .detail-label { color: var(--fg-muted); }
    .detail-value { color: var(--fg); }
    
    /* Warnings */
    .warnings-section {
      margin-bottom: 24px;
    }
    
    .warnings-title {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 14px;
      font-weight: 600;
      color: var(--hot);
      margin-bottom: 12px;
    }
    
    .warning-card {
      background: var(--bg-elevated);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 16px;
      margin-bottom: 8px;
      transition: transform 0.2s, box-shadow 0.2s;
    }
    
    .warning-card:hover {
      transform: translateY(-2px);
      box-shadow: var(--shadow);
    }
    
    .warning-card.extreme, .warning-card.severe {
      border-color: var(--hot);
      background: rgba(243, 138, 168, 0.1);
    }
    
    .warning-card.moderate {
      border-color: var(--warm);
      background: rgba(250, 179, 135, 0.1);
    }
    
    .warning-card.minor {
      border-color: var(--warm);
      background: rgba(250, 179, 135, 0.05);
    }
    
    .warning-header { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
    .warning-icon { font-size: 16px; }
    .warning-event { font-weight: 600; flex: 1; }
    .warning-severity { 
      font-size: 11px;
      font-weight: 700;
      padding: 2px 8px;
      border-radius: 999px;
      text-transform: uppercase;
    }
    .warning-severity.extreme, .warning-severity.severe { background: var(--hot); color: white; }
    .warning-severity.moderate { background: var(--warm); color: #1e1e2e; }
    .warning-severity.minor { background: var(--warm); color: #1e1e2e; opacity: 0.8; }
    .warning-area { font-size: 13px; color: var(--fg-muted); margin-bottom: 4px; }
    .warning-time { font-size: 11px; color: var(--fg-muted); font-family: monospace; }
    .warning-desc { font-size: 12px; color: var(--fg); margin-top: 8px; padding-top: 8px; border-top: 1px solid var(--border); }
    
    /* Forecast Days */
    .forecast-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      gap: 16px;
      margin-bottom: 32px;
    }
    
    .day-card {
      background: var(--bg-elevated);
      border: 1px solid var(--border);
      border-radius: 16px;
      overflow: hidden;
      transition: transform 0.2s, box-shadow 0.2s;
    }
    
    .day-card:hover {
      transform: translateY(-4px);
      box-shadow: var(--shadow);
    }
    
    .day-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 16px 20px;
      background: linear-gradient(135deg, var(--border), transparent);
      border-bottom: 1px solid var(--border);
    }
    
    .day-label { font-weight: 700; font-size: 14px; }
    .day-date { color: var(--fg-muted); font-size: 12px; }
    
    /* ASCII art colors (xterm-256) */
    .ac-226 { color: #ffff00; } .ac-228 { color: #ffff87; }
    .ac-250 { color: #bcbcbc; } .ac-251 { color: #c6c6c6; }
    .ac-244 { color: #808080; } .ac-33 { color: #0087ff; }
    .ac-111 { color: #87afff; }
    .ac-bold { font-weight: 700; }
    
    /* Forecast slots: horizontal columns, one per time slot */
    .slots-grid {
      display: flex;
      gap: 4px;
      padding: 14px 12px;
      overflow-x: auto;
      -webkit-overflow-scrolling: touch;
    }
    
    .slot-col {
      flex: 0 0 auto;
      min-width: 100px;
      text-align: center;
      padding: 8px 4px;
      border-radius: 10px;
      transition: background 0.2s;
    }
    
    .slot-col:hover { background: var(--border); }
    
    .slot-time {
      font-size: 12px;
      font-weight: 700;
      color: var(--accent);
      margin-bottom: 6px;
    }
    
    .slot-art {
      font-family: inherit;
      font-size: 12px;
      line-height: 1.3;
      margin: 0 0 6px;
      white-space: pre;
    }
    
    .slot-temp {
      font-size: 15px;
      font-weight: 700;
      font-variant-numeric: tabular-nums;
    }
    
    .slot-condition {
      font-size: 11px;
      color: var(--fg);
      margin-top: 2px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    
    .slot-meta {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 2px 4px;
      margin-top: 6px;
      font-size: 10px;
      color: var(--fg-muted);
    }
    
    /* Temp color classes */
    .temp-hot { color: var(--hot); }
    .temp-warm { color: var(--warm); }
    .temp-mild { color: var(--accent-dim); }
    .temp-cool { color: var(--cool); }
    .temp-cold { color: #89dceb; }
    
    /* Footer */
    footer {
      margin-top: 32px;
      padding-top: 24px;
      border-top: 1px solid var(--border);
      color: var(--fg-muted);
      font-size: 12px;
      text-align: center;
    }
    
    footer a { color: var(--accent); text-decoration: none; }
    footer a:hover { text-decoration: underline; }
    
    .footer-links { display: flex; justify-content: center; gap: 16px; margin-top: 8px; flex-wrap: wrap; }
    
    /* Mobile */
    @media (max-width: 600px) {
      body { padding: 16px 12px; font-size: 13px; }
      .location-name { font-size: 22px; }
      .location-icon.ascii-art { font-size: 13px; margin-right: 10px; }
      .temp-value { font-size: 44px; }
      .temp-detail { margin-left: 12px; padding-left: 12px; }
      .detail-row { font-size: 12px; }
      .forecast-grid { grid-template-columns: 1fr; }
      .slots-grid { padding: 10px 8px; }
      .slot-col { min-width: 92px; }
      .slot-art { font-size: 11px; }
      .slot-temp { font-size: 14px; }
    }
    
    /* Reduced motion */
    @media (prefers-reduced-motion: reduce) {
      *, *::before, *::after {
        animation-duration: 0.01ms !important;
        transition-duration: 0.01ms !important;
      }
    }
    
    /* Scrollbar */
    ::-webkit-scrollbar { width: 8px; height: 8px; }
    ::-webkit-scrollbar-track { background: var(--bg); }
    ::-webkit-scrollbar-thumb { background: var(--border); border-radius: 4px; }
    ::-webkit-scrollbar-thumb:hover { background: var(--fg-muted); }
  </style>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;700&display=swap" rel="stylesheet">
</head>
<body>
  <div class="container">
    <header>
      <div class="location-header">
        <pre class="location-icon ascii-art" aria-hidden="true">${asciiIconHtml(current.weather || 0, currentHour)}</pre>
        <div class="location-info">
          <h1 class="location-name">${location.desa}</h1>
          <div class="location-meta">
            <span>${location.kecamatan}, ${location.kotkab}</span>
            <span>•</span>
            <span>${location.provinsi}</span>
            <span>•</span>
            <span>${location.lat.toFixed(4)}, ${location.lon.toFixed(4)}</span>
          </div>
        </div>
      </div>
      
      <div class="current-condition">${currentLabel} • Updated ${new Date(current.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
      
      <div class="current-temp">
        <div class="temp-main">
          <span class="temp-value ${getTempClass(current.temp)}">${formatTempNum(current.temp)}</span>
          <span class="temp-unit">°C</span>
        </div>
        <div class="temp-detail">
          <div class="detail-row"><span class="detail-icon">💧</span><span class="detail-label">Humidity</span><span class="detail-value">${current.humidity}%</span></div>
          <div class="detail-row"><span class="detail-icon">💨</span><span class="detail-label">Wind</span><span class="detail-value">${formatWind(current.windSpeed, current.windDir)}</span></div>
          <div class="detail-row"><span class="detail-icon">☁</span><span class="detail-label">Cloud</span><span class="detail-value">${current.cloudCover}%</span></div>
          <div class="detail-row"><span class="detail-icon">🌧</span><span class="detail-label">Rain</span><span class="detail-value">${current.rainProb}%</span></div>
        </div>
      </div>
    </header>
    
    ${warningsHtml ? `<section class="warnings-section">
      <h2 class="warnings-title"><span>⚠</span> Weather Warnings</h2>
      <div class="warnings-list">${warningsHtml}</div>
    </section>` : ""}
    
    <section class="forecast-section">
      <div class="forecast-grid">
        ${dayBlocks.map(day => `
        <article class="day-card">
          <div class="day-header">
            <span class="day-label">${day.dayLabel}</span>
            <span class="day-date">${day.date}</span>
          </div>
          <div class="slots-grid">
            ${day.slots.map(slot => `
            <div class="slot-col">
              <div class="slot-time">${slot.timeStr}</div>
              <pre class="slot-art" aria-hidden="true">${slot.art}</pre>
              <div class="slot-temp ${getTempClass(slot.temp)}">${formatTemp(slot.temp)}</div>
              <div class="slot-condition" title="${slot.condition}">${slot.condition}</div>
              <div class="slot-meta">
                <span>💧${slot.humidity}%</span>
                <span>☁${slot.cloudCover}%</span>
                <span>${windArrow(slot.windDir)}${slot.windSpeed.toFixed(1)}</span>
                <span>🌧${slot.rainProb}%</span>
              </div>
            </div>`).join("")}
          </div>
        </article>`).join("")}
      </div>
    </section>
    
    <footer>
      <p>Data: <a href="https://bmkg.go.id" target="_blank" rel="noopener">BMKG</a> • Geo: <a href="https://api.wilayah.workers.dev" target="_blank" rel="noopener">wilayah.workers.dev</a></p>
      <div class="footer-links">
        <a href="https://github.com/yourusername/cuaca-worker" target="_blank" rel="noopener">Source</a>
        <a href="https://wttr.in" target="_blank" rel="noopener">wttr.in</a>
        <span>Built with Cloudflare Workers</span>
      </div>
    </footer>
  </div>
</body></html>`;
}

function getTempClass(temp: number): string {
  if (temp >= 35) return "temp-hot";
  if (temp >= 30) return "temp-warm";
  if (temp >= 25) return "temp-mild";
  if (temp >= 20) return "temp-cool";
  return "temp-cold";

// Helper to get current icon lines for header
}

// Helper to get current icon lines for header

// Detect if request wants HTML (browser) or plain text (curl)
export function wantsHTML(request: Request): boolean {
  const accept = request.headers.get("accept") || "";
  const userAgent = request.headers.get("user-agent") || "";
  // Return HTML if:
  // 1. Explicitly requested text/html in Accept header
  // 2. Not a known CLI tool (curl, wget, httpie, etc.)
  const isCli = /curl|wget|httpie|axios|fetch/i.test(userAgent);
  return accept.includes("text/html") && !isCli;
}