// Reuse shipped, previously resolved coordinates after a fresh clone.
// New addresses still go through OneMap / footprint propagation.
import { INTERIM, OUT, addressKey } from "./lib";

const path = `${INTERIM}/geocode-cache.json`;
const cache = await Bun.file(path).exists() ? await Bun.file(path).json() : {};
const buildings = await Bun.file(`${OUT}/buildings.json`).json();
let added = 0;
for (const b of buildings) {
  const key = addressKey(b.block, b.street);
  if (cache[key] || !Number.isFinite(b.lat) || !Number.isFinite(b.lon)) continue;
  cache[key] = { lat: b.lat, lon: b.lon, postal: b.postal };
  added++;
}
await Bun.write(path, JSON.stringify(cache));
console.log(`seeded ${added} existing building coordinates`);
