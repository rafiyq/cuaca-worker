# cuaca-worker Web Layout

Layout wireframe for `renderHTML()` in `src/render.ts` — helps identify each part when styling/debugging.

---

## Desktop Layout (≥900px container, centered)

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          [1] HEADER (‹header›)                          │
│ ┌───────────────────────────────────────────────────────────────────┐   │
│ │ [1a] LOCATION-HEADER                     (flex row, gap:16px)      │   │
│ │                                                                  │   │
│ │   ┌─────────┐   ┌─────────────────────────────────────────────┐   │   │
│ │   │ [1b]    │   │ [1c] LOCATION-INFO            (flex:1)       │   │   │
│ │   │ ICON    │   │                                              │   │   │
│ │   │  ☀️    │   │  [1d] LOCATION-NAME (h1, gradient text)      │   │   │
│ │   │ 48px   │   │        "Kemayoran"                           │   │   │
│ │   │ float  │   │                                              │   │   │
│ │   │ anim   │   │  [1e] LOCATION-META (flex-wrap row)          │   │   │
│ │   └─────────┘   │  "Kemayoran, Kota Adm. Jakarta Pusat        │   │   │
│ │                 │   • DKI Jakarta                              │   │   │
│ │                 │   • -6.1647, 106.8454"                      │   │   │
│ │                 └─────────────────────────────────────────────┘   │   │
│ │                                                                  │   │
│ │   [1f] CURRENT-CONDITION  "Cerah • Updated 13:00"                 │   │
│ │                                                                  │   │
│ │   [1g] CURRENT-TEMP  (inline-flex card, rounded 16px, shadow)    │   │
│ │   ┌───────────────────────────────────────────────────────────┐  │   │
│ │   │           │    │           ┌─────────────────────────────┐ │  │   │
│ │   │  [1h]    │[1i]│            │ [1j] TEMP-DETAIL           │ │  │   │
│ │   │  +32     │ °C │            │  (column, border-left)      │ │  │   │
│ │   │  56px    │20px│            │                             │ │  │   │
│ │   │  bold    │    │            │  💧 Humidity      56%       │ │  │   │
│ │   │  colored │    │            │  💨 Wind    ↖ 13.0 km/h    │ │  │   │
│ │   │  number  │    │            │  ☁  Cloud Cover   41%      │ │  │   │
│ │   │  only    │    │            │  🌧 Rain            30%     │ │  │   │
│ │   │          │    │            └─────────────────────────────┘ │  │   │
│ │   └───────────────────────────────────────────────────────────┘  │   │
│ └───────────────────────────────────────────────────────────────────┘   │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│                 [2] WARNINGS-SECTION (⚠ only if warnings)                │
│   ┌──────────────────────────────────────────────────────────────────┐ │
│   │ ⚠ Weather Warnings                                                │ │
│   │ ┌──────────────────────────────────────────────────────────────┐ │ │
│   │ │ [2a] WARNING-CARD (severity-colored border)                    │ │ │
│   │ │  ⚠  Hujan Lebat                     [SEVERE]  ← severity pill │ │ │
│   │ │  Area: DKI Jakarta dan sekitarnya                              │ │ │
│   │ │  2026-10-20T13:00 → 2026-10-21T13:00                           │ │ │
│   │ │  ────────────────────────────────                              │ │ │
│   │ │  Description first line...                                      │ │ │
│   │ └──────────────────────────────────────────────────────────────┘ │ │
│   └──────────────────────────────────────────────────────────────────┘ │
│                                                                          │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│                    [3] FORECAST-SECTION (‹section›)                       │
│   [3a] FORECAST-GRID  (grid: auto-fit minmax(280px, 1fr), gap:16px)     │
│                                                                          │
│   ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐      │
│   │ [3b] DAY-CARD 1  │  │ [3b] DAY-CARD 2  │  │ [3b] DAY-CARD 3  │      │
│   │                  │  │                  │  │                  │      │
│   │ ┌──────────────┐ │  │ ┌──────────────┐ │  │ ┌──────────────┐ │      │
│   │ │[3c] DAY-HDR  │ │  │ │ Tomorrow     │ │  │ │ Day after    │ │      │
│   │ │ Today │ date │ │  │ │      │ date  │ │  │ │      │ date  │ │      │
│   │ └──────────────┘ │  │ └──────────────┘ │  │ └──────────────┘ │      │
│   │ ┌──────────────┐ │  │                  │  │                  │      │
│   │ │[3d] SLOT-ROW  │ │  │                  │  │                  │      │
│   │ │ (see detail   │ │  │                  │  │                  │      │
│   │ │  below)       │ │  │                  │  │                  │      │
│   │ └──────────────┘ │  │                  │  │                  │      │
│   │        ...       │  │                  │  │                  │      │
│   └──────────────────┘  └──────────────────┘  └──────────────────┘      │
│                                                                          │
├─────────────────────────────────────────────────────────────────────────┤
│                              [4] FOOTER (‹footer›)                       │
│   Data: BMKG • Geo: wilayah.workers.dev                                  │
│   Source  |  wttr.in  |  Built with Cloudflare Workers                   │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## [3d] SLOT-ROW Detail (the forecast line item)

```
┌──────────────────────────────────────────────────────────────────────┐
│  [a]        [b]         [c] SLOT-INFO (flex:1)             [f]       │
│  TIME       ICON          [c1] CONDITION                TEMP         │
│  (52px,     (32px,                                        (right,     │
│  fixed)     fixed)                                         auto)      │
│                                                                      │
│  ┌─────┐   ┌─────┐   ┌──────────────────────────┐    ┌─────────┐    │
│  │     │   │     │   │ Cerah Berawan  [c1]      │    │ +32°C   │    │
│  │ 13:00    ☀️     │ ◀─┤                          ├──▶ │ (bold,  │    │
│  │  [a]  │  [b]    │   │ [c2] SLOT-DETAILS:       │    │ colored)│    │
│  │ accent │ emoji   │   │  💧 56%  ↖️ 13.0 km/h   │    │  [f]    │    │
│  │ color  │         │   │  ☁️ 41%  🌧️ 30%         │    └─────────┘    │
│  │        │         │   └──────────────────────────┘                   │
│  └─────┘   └─────┘                                                      │
│                                                                      │
│  gap:10px ───────────── flex row, align center ──────────── gap:10px │
└──────────────────────────────────────────────────────────────────────┘
```

### Slot-row column breakdown

| Part | Element | Width | Content |
|------|---------|-------|---------|
| `[a]` slot-time | `<span>` | 52px fixed | `13:00` (accent color, mono) |
| `[b]` slot-icon | `<span>` | 32px fixed | ☀️ emoji (weather code + day/night) |
| `[c]` slot-info | `<div>` | flex:1 (fills) | condition + details |
| `[c1]` slot-condition | `<div>` | full | "Cerah Berawan" (500 weight) |
| `[c2]` slot-details | `<div>` | flex-wrap | 💧 humidity, ↖️ wind, ☁️ cloud, 🌧️ rain |
| `[f]` slot-temp | `<span>` | shrink:0, right | `+32°C` (bold, temp-class color) |

---

## Mobile Layout (≤600px)

```
┌───────────────────────────────┐
│ [1] HEADER                    │
│   ☀️ Kemayoran               │  ← icon 36px, name 22px
│   meta (wraps)                │
│   ┌───────────────────────┐  │
│   │ +32°C °C │ 💧56%      │  │  ← temp 44px, details stack
│   │          │ 💨13.0     │  │
│   │          │ ☁ 41%      │  │
│   │          │ 🌧 30%     │  │
│   └───────────────────────┘  │
├───────────────────────────────┤
│ [2] WARNINGS (if any)         │
├───────────────────────────────┤
│ [3] FORECAST-GRID             │
│   ┌───────────────────────┐  │  ← 1 column only
│   │ Today     │ date      │  │
│   │ ┌───────────────────┐ │  │
│   │ │ 13:00 ☀️  +32°C   │ │  │  ← tighter gaps
│   │ │ Cerah Berawan     │ │  │
│   │ │ 💧56% ↖️13.0 ...  │ │  │
│   │ └───────────────────┘ │  │
│   └───────────────────────┘  │
│   ┌───────────────────────┐  │
│   │ Tomorrow │ date       │  │
│   └───────────────────────┘  │
├───────────────────────────────┤
│ [4] FOOTER                    │
└───────────────────────────────┘
```

---

## CSS Class Map

| Section | Classes |
|---------|---------|
| **1. Header** | `header`, `.location-header`, `.location-icon`, `.location-info`, `.location-name`, `.location-meta`, `.current-condition`, `.current-temp`, `.temp-value` (number only), `.temp-unit` (°C, 20px), `.temp-detail`, `.detail-row`, `.detail-icon`, `.detail-label`, `.detail-value` |
| **2. Warnings** | `.warnings-section`, `.warnings-title`, `.warning-card` (+ `.extreme` `.severe` `.moderate` `.minor`), `.warning-header`, `.warning-icon`, `.warning-event`, `.warning-severity`, `.warning-area`, `.warning-time`, `.warning-desc` |
| **3. Forecast** | `.forecast-section`, `.forecast-grid`, `.day-card`, `.day-header`, `.day-label`, `.day-date`, `.slots-container`, `.slot-row`, `.slot-time`, `.slot-icon`, `.slot-info`, `.slot-condition`, `.slot-details`, `.detail`, `.detail-emoji`, `.slot-temp` |
| **4. Footer** | `footer`, `.footer-links` |

### Shared state classes

| Class | Applies to | Purpose |
|-------|-----------|---------|
| `.temp-hot` | `.temp-value`, `.slot-temp` | ≥35°C (hot pink) |
| `.temp-warm` | " | ≥30°C (orange) |
| `.temp-mild` | " | ≥25°C (cyan) |
| `.temp-cool` | " | ≥20°C (cool blue) |
| `.temp-cold` | " | <20°C (light blue) |

---

## Data flow

```
BMKG JSON ──▶ fetchForecast() ──▶ SimpleForecast[]
                                     │        (condition = raw weather_desc)
                                     ├─▶ renderTerminal()  → ANSI (curl)
                                     │      └─ asciiArt() → 5-line 256-color art
                                     │           (cuaca-rs icons, expandColorTokens)
                                     │
                                     └─▶ renderHTML()       → styled page
                                            ├─ getWeatherEmoji()  → ☀️ 🌧️ (web)
                                            ├─ windEmoji()        → ⬆️ ↗️ (web)
                                            └─ getTempClass()      → color classes

ASCII icon codes (real BMKG):
  0,1 sun/moon · 2 partly · 3 cloudy · 4 heavy cloud · 5,10,45 fog
  60,61 light rain · 63,80 heavy rain · 95,97 thunder (⚡)
  day/night only affects: clear sky (sun vs moon) + emoji
```