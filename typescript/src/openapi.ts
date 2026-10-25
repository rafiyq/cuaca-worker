// OpenAPI 3.1 spec for the cuaca API

export function getOpenApiSpec(): Record<string, unknown> {
  return {
        openapi: "3.1.0",
        info: {
          title: "cuaca",
          description: "Terminal-first weather for Indonesia, powered by BMKG",
          version: "0.5.0",
        },
        servers: [{ url: "https://cuaca.wilayah.workers.dev" }],
        paths: {
          "/": {
            get: {
              summary: "Weather by location (terminal or HTML based on Accept/User-Agent)",
              parameters: [
                { name: "adm4", in: "query", schema: { type: "string" }, description: "Village code (e.g., 31.71.03.1001)" },
                { name: "lat", in: "query", schema: { type: "number" }, description: "Latitude" },
                { name: "lon", in: "query", schema: { type: "number" }, description: "Longitude" },
                { name: "format", in: "query", schema: { type: "string" }, description: "3, short, prometheus, or custom template" },
              ],
              responses: { "200": { description: "Weather output" } },
            },
          },
          "/{location}": {
            get: {
              summary: "Weather by location name",
              parameters: [{ name: "location", in: "path", required: true, schema: { type: "string" } }],
              responses: { "200": { description: "Weather output" } },
            },
          },
          "/api/forecast": {
            get: {
              summary: "3-day forecast (JSON)",
              parameters: [{ name: "adm4", in: "query", required: true, schema: { type: "string" } }],
              responses: { "200": { description: "Forecast JSON" } },
            },
          },
          "/api/warnings": {
            get: {
              summary: "Weather warnings (JSON, CAP XML parsed)",
              parameters: [{ name: "adm4", in: "query", required: true, schema: { type: "string" } }],
              responses: { "200": { description: "Warnings JSON" } },
            },
          },
          "/api/resolve": {
            get: {
              summary: "Search villages by name",
              parameters: [
                { name: "q", in: "query", required: true, schema: { type: "string" } },
                { name: "limit", in: "query", schema: { type: "integer", default: 10 } },
              ],
              responses: { "200": { description: "Matching villages" } },
            },
          },
          "/api/nearest": {
            get: {
              summary: "Nearest village to coordinates",
              parameters: [
                { name: "lat", in: "query", required: true, schema: { type: "number" } },
                { name: "lon", in: "query", required: true, schema: { type: "number" } },
              ],
              responses: { "200": { description: "Nearest village" } },
            },
          },
          "/api/locate": {
            get: {
              summary: "Full admin hierarchy for coordinates",
              parameters: [
                { name: "lat", in: "query", required: true, schema: { type: "number" } },
                { name: "lon", in: "query", required: true, schema: { type: "number" } },
              ],
              responses: { "200": { description: "Admin hierarchy" } },
            },
          },
          "/api/ai-report": {
            get: {
              summary: "AI-generated weather report (requires Workers AI)",
              parameters: [
                { name: "adm4", in: "query", required: true, schema: { type: "string" } },
                { name: "style", in: "query", schema: { type: "string", enum: ["brief", "detailed", "conversational"] } },
              ],
              responses: { "200": { description: "Natural language weather report" } },
            },
          },
          "/api/locations": {
            get: {
              summary: "Example location codes",
              responses: { "200": { description: "List of examples" } },
            },
          },
        },
      };
}
