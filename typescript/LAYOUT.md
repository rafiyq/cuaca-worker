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
│ │   │ ASCII  │   │                                              │   │   │
│ │   │ ART    │   │  [1d] LOCATION-NAME (h1, gradient text)      │   │   │
│ │   │ 5-line │   │        "Kemayoran"                           │   │   │
│ │   │ pre    │   │                                              │   │   │
│ │   │ colored│   │  [1e] LOCATION-META (flex-wrap row)          │   │   │
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
│   Source  |  Built with Cloudflare Workers                                │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## [3d] SLOTS-GRID + SLOT-COL Detail

Each day card's slots are a **horizontal, scrollable row of columns** —
one column per BMKG 3-hour slot, each with its own mini ASCII art.

```
┌─ [3b] DAY-CARD ────────────────────────────────────────────────────┐
│ [3c] Today                                    Wed, Oct 21          │
│ ┌─ [3d] slots-grid (flex, overflow-x, gap:4px) ───────────────────┐ │
│ │ ┌─ slot-col ─┐ ┌─ slot-col ─┐ ┌─ slot-col ─┐ ┌─ slot-col ─┐   │ │
│ │ │ [a] 13:00  │ │    16:00    │ │    19:00   │ │    22:00   │   │ │
│ │ │            │ │             │ │            │ │            │   │ │
│ │ │ [b] ART    │ │ \ . /       │ │ \__/       │ │    *       │   │ │
│ │ │  \ . /    │ │ - .-. -      │ │ __/  .-.   │ │  .--.  *   │   │ │
│ │ │  - .-. -  │ │ ‒ (   ) ‒    │ │   \_(   ). │ │ (    )     │   │ │
│ │ │  ‒ (   ) ‒ │ │ . `-᾿ .     │ │   /(___(__)│ │  `--'   *   │   │ │
│ │ │  / ' \    │ │             │ │            │ │            │   │ │
│ │ │ [c] +32°C │ │   +33°C     │ │   +30°C    │ │   +29°C     │   │ │
│ │ │ [d] Cerah │ │ Cerah Berawan│ │ Cerah Ber. │ │ Cerah      │   │ │
│ │ │ [e] 💧60% │ │   💧57%      │ │   💧64%    │ │   💰72%     │   │ │
│ │ │     ☁20% │ │     ☁71%     │ │     ☁37%   │ │     ☁2%     │   │ │
│ │ │     ↗7.2 │ │     ↖13.5    │ │     ↖4.8   │ │     ←1.0    │   │ │
│ │ │     🌧10% │ │     🌧30%     │ │     🌧0%   │ │     🌧0%     │   │ │
│ │ └───────────┘ └─────────────┘ └────────────┘ └────────────┘   │ │
│ └────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
```

### Slot-col breakdown

| Part | Element | Content |
|------|---------|---------|
| `[a]` slot-time | `<div>` | `13:00` (accent color) |
| `[b]` slot-art | `<pre>` | 5-line colored ASCII art (`ac-NNN` spans, 12px mono) |
| `[c]` slot-temp | `<div>` | `+32°C` (bold, temp-class color) |
| `[d]` slot-condition | `<div>` | raw BMKG `weather_desc`, ellipsis on overflow |
| `[e]` slot-meta | `<div>` grid 2×2 | 💧 humidity / ☁ cloud / ↗ wind / 🌧 rain |

- `min-width: 100px`, `flex: 0 0 auto` → columns never squish; grid scrolls on narrow screens
- Art colors (xterm-256): 226 sun · 250/251 cloud/fog · 244 heavy · 111/33 rain · 228 ⚡/moon
- Light mode darkens the palette for readability (see CSS `@media (prefers-color-scheme: light)`)

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
│ [3] FORECAST-GRID (1 col)    │
│   ┌───────────────────────┐  │
│   │ Today     │ date      │  │
│   │ [slots-grid scrolls →]│  │
│   │ 13:00  16:00  19:00  │  │  ← horizontal scroll
│   │  art   art    art    │  │
│   │ +32°C +33°C +30°C    │  │
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
| **3. Forecast** | `.forecast-section`, `.forecast-grid`, `.day-card`, `.day-header`, `.day-label`, `.day-date`, `.slots-grid`, `.slot-col`, `.slot-time`, `.slot-art`, `.slot-temp`, `.slot-condition`, `.slot-meta`, `.ascii-art`, `.ac-226/250/251/244/33/111/228`, `.ac-bold` |
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
                                            ├─ asciiIconHtml()  → 5-line art as
                                            │     colored <span>s (hero + slots)
                                            ├─ windArrow()        → ↑ ↗ → (web meta)
                                            └─ getTempClass()      → color classes

ASCII icon codes (real BMKG):
  0,1 sun/moon · 2 partly · 3 cloudy · 4 heavy cloud · 5,10,45 fog
  60,61 light rain · 63,80 heavy rain · 95,97 thunder (⚡)
  day/night only affects: clear sky (sun vs moon) + emoji
  (web renders the same art via asciiIconHtml: tokens → <span class=ac-NNN>)
```