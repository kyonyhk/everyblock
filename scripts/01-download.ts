// Download the HDB datasets from data.gov.sg as full CSVs via the
// initiate-download / poll-download API. No API key required, but the
// anonymous rate limit is 2 download calls per 10s, so downloads run
// sequentially with a pause between them.
import { rename } from "node:fs/promises";
import { RAW, sleep } from "./lib";

const DATASETS = [
  { id: "d_ebc5ab87086db484f88045b47411ebc5", name: "resale-1990-1999" },
  { id: "d_43f493c6c50d54243cc1eab0df142d6a", name: "resale-2000-2012" },
  { id: "d_2d5ff9ea31397b66239f245f57751537", name: "resale-2012-2014" },
  { id: "d_ea9ed51da2787afaf8e51f827c304208", name: "resale-2015-2016" },
  { id: "d_8b84c4ee58e3cfc0ece0d773c8ca6abc", name: "resale-2017-present" },
  { id: "d_17f5382f26140b1fdae0ba2ef6239d2f", name: "hdb-property-info" },
  { id: "d_16b157c52ed637edd6ba1232e026258d", name: "hdb-buildings", ext: "geojson" },
  { id: "d_b39d3a0871985372d7e1637193335da5", name: "mrt-exits", ext: "geojson" },
];

const API = "https://api-open.data.gov.sg/v1/public/api/datasets";
const refresh = Bun.argv.includes("--refresh");
const only = Bun.argv.find((a) => a.startsWith("--only="))?.slice(7).split(",");
if (only?.some((name) => !DATASETS.some((d) => d.name === name))) {
  throw new Error(`Unknown dataset. Choose from: ${DATASETS.map((d) => d.name).join(", ")}`);
}

async function request(url: string): Promise<Response> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const res = await fetch(url, { signal: AbortSignal.timeout(120000) });
    if (res.ok) return res;
    if (res.status !== 429 && res.status < 500) throw new Error(`Download API: HTTP ${res.status}`);
    if (attempt < 4) await sleep(6000 * (attempt + 1));
  }
  throw new Error("Download API unavailable after 5 attempts");
}

async function signedUrl(id: string): Promise<string> {
  const init = await request(`${API}/${id}/initiate-download`).then((r) => r.json());
  if (init.data?.url) return init.data.url;
  for (let i = 0; i < 20; i++) {
    await sleep(3000);
    const poll = await request(`${API}/${id}/poll-download`).then((r) => r.json());
    if (poll.data?.url) return poll.data.url;
  }
  throw new Error(`No download URL for ${id} after polling: ${JSON.stringify(init)}`);
}

for (const dataset of DATASETS) {
  const { id, name } = dataset;
  if (only && !only.includes(name)) continue;
  const path = `${RAW}/${name}.${"ext" in dataset ? dataset.ext : "csv"}`;
  if (!refresh && await Bun.file(path).exists()) {
    console.log(`skip ${name} (exists)`);
    continue;
  }
  const url = await signedUrl(id);
  console.log(`get  ${name} ...`);
  const res = await request(url);
  // Buffer fully before writing: Bun.write(path, response) can spin on
  // streamed bodies, and these files are small enough to hold in memory.
  // Replace only after a complete download, so an interrupted refresh is resumable.
  await Bun.write(`${path}.tmp`, await res.arrayBuffer());
  await rename(`${path}.tmp`, path);
  const size = ((Bun.file(path).size ?? 0) / 1e6).toFixed(1);
  console.log(`ok   ${name} (${size} MB)`);
  await sleep(6000);
}
console.log("downloads complete");
