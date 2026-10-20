# Weather Display Patterns (Beyond wttr.in)

## 1. Dashboard Cards (Web/App)
```
┌─────────────────────────────────────┐
│  Jakarta          ☀️  31°C          │
│  Feels like: 34°C  Humidity: 61%    │
│  Wind: NE 12.7 km/h  UV: 8 (High)   │
├─────────────────────────────────────┤
│  Today                    3-Day     │
│  ┌────┬────┬────┬────┐             │
│  │09:00│12:00│15:00│18:00│  Mon 31°│
│  │☀️31°│☀️33°│☀️32°│🌤️30°│  Tue 32°│
│  └────┴────┴────┴────┘  Wed 29°   │
└─────────────────────────────────────┘
```
**Use**: Web dashboards, mobile apps, smart displays

---

## 2. Minimal Status Bar (Waybar/Polybar/tmux)
```
☀️ 31°C | 🌤️ 33°/28° | 💧 61% | 💨 NE 13
```
**Use**: Desktop status bars, terminal multiplexers

---

## 3. JSON API (Machine Consumption)
```json
{
  "location": "Kemayoran, Jakarta",
  "current": {
    "temp": 31,
    "condition": "Cerah",
    "humidity": 61,
    "wind": { "speed": 12.7, "dir": "NE" },
    "uv": 8
  },
  "forecast": [
    { "time": "09:00", "temp": 31, "icon": "☀️", "rain": 0 },
    { "time": "12:00", "temp": 33, "icon": "☀️", "rain": 0 }
  ],
  "alerts": []
}
```
**Use**: Other services, home automation, mobile apps

---

## 4. Terminal Widgets (Rich/TUI)
```
┌─ Weather ──────────────────────────┐
│ Jakarta, ID                        │
│ ████████████ 31°C Cerah            │
│ ░░░░░░░░░░░░ Feels: 34°C           │
│ ┌────────────────────────────────┐ │
│ │ ▁ ▂ ▃ ▅ ▆ ▇ ▅ ▃ ▂ ▁  Temp 24h  │ │
│ └────────────────────────────────┘ │
│ ☀️ 09:00  ☀️ 12:00  🌤️ 15:00  🌙 18:00│
│  31°       33°       32°       30°   │
└────────────────────────────────────┘
```
**Use**: `rich` (Python), `ratatui` (Rust), `blessed` (Node)

---

## 5. ASCII Art / Figlet Style
```
  \   /     Jakarta
   .-.      31°C Cerah
  ― (   ) ― 
   `-'      NE 13 km/h
  /   \     61% 💧
```
**Use**: MOTD, login screens, terminal art

---

## 6. Voice/Accessibility (Screen Readers)
> "Current weather in Kemayoran, Jakarta: Sunny, 31 degrees Celsius. 
> Humidity 61 percent. Wind from northeast at 13 kilometers per hour. 
> Today: Sunny, high 33, low 27. No rain expected."
**Use**: Voice assistants, accessibility

---

## 7. Embedded/Widget (iframe/Web Component)
```html
<weather-widget location="jakarta" theme="dark" format="compact">
</weather-widget>
<script src="https://cuaca.workers.dev/widget.js"></script>
```
**Use**: Blogs, documentation, internal tools

---

## 8. Notification/Alert Format
```
⚠️ WEATHER ALERT - Jakarta
🌧️ Heavy rain expected 14:00-17:00
💧 80% chance, 15-25mm
🌡️ Temp drop to 26°C
📱 Tap for details
```
**Use**: Push notifications, Telegram/Discord bots, SMS

---

## 9. Historical/Analytics View
```
Temperature (°C)    35 ┤        ╭──╮
                    30 ┤   ╭──╯  ╰──╮
                    25 ┤  ╯         ╰──╮
                    20 ┤╯             ╰╮
                       1  2  3  4  5  6  7  Days
```
**Use**: Agriculture, energy, planning dashboards

---

## 10. Map Overlay (Geo-visualization)
```
Leaflet/Mapbox + Weather tiles:
- Radar overlay
- Temperature contours  
- Wind barbs
- Alert polygons
```
**Use**: Travel, logistics, emergency management

---

## Our Worker Supports Multiple Outputs

| Format | Endpoint | Example |
|--------|----------|---------|
| **Terminal (ANSI)** | `GET /` (curl) | wttr.in style |
| **HTML** | `GET /` (browser) | Styled terminal |
| **Short** | `GET /Jakarta?format=3` | `Kemayoran: ☀️ +31°C` |
| **Custom** | `GET /Jakarta?format={t}°C` | `31°C` |
| **JSON** | `GET /api/forecast?adm4=...` | Full data |
| **Warnings** | `GET /api/warnings?adm4=...` | Alert objects |

---

## Recommendation by Consumer

| Consumer | Best Format |
|----------|-------------|
| Human (terminal) | `GET /` or `GET /:location` |
| Human (browser) | `GET /` (auto HTML) |
| Waybar/Polybar | `GET /:location?format={ICON} {t}°C` |
| Mobile app | `GET /api/forecast` |
| Home Assistant | `GET /api/forecast` + `GET /api/warnings` |
| Telegram bot | `GET /:location?format=3` or custom |
| Dashboard widget | `GET /api/forecast` + custom render |
| Voice assistant | `GET /api/forecast` → TTS |
