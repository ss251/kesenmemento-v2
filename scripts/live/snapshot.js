// [v3:life] Save the fixture (サンプル) live state as data/live/sample.json: the static fallback the anime app reads when
// /api/live is not served (tools/anime dev servers, static hosting). Always flagged sample: true.
//   env -u NODE_OPTIONS bun scripts/live/snapshot.js
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { buildState } from "../live.js";
import { ROOT } from "./http.js";

const s = await buildState({ fixtures: true, now: new Date("2026-09-29T09:20:00Z") });
const out = { ...s, sample: true, fixture: true, sampleNote: s.sampleNote || "Saved public pages from 2026-09-29 (sample data)" };
mkdirSync(join(ROOT, "data/live"), { recursive: true });
writeFileSync(join(ROOT, "data/live/sample.json"), JSON.stringify(out));
console.log("data/live/sample.json", out.port?.arrivals?.length, "arrivals;", out.weather?.sky, "weather");
