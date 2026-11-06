// The IAEA Live Chart of Nuclides data, pulled through its download API (nds.iaea.org/relnsd/v1/data, guide at
// nds.iaea.org/relnsd/vcharthtml/api_v0_guide.html), 2026-11-06. Raw CSV, as served, one file per request:
//
//   ground_states.csv                        every ground state: half-life, decay modes, Q-values, Sₙ, Sₚ, binding,
//                                            mass excess, Jπ, moments, charge radius, abundance (ENSDF, AME20, NUBASE20)
//   fy/{cumulative,independent}_<parent>.csv JEFF-3.1.1 fission yields, thermal, fast and 14 MeV, for the 8 parents
//   decay_rads/<type>/<nuclide>.csv          each radioactive ground state's emitted radiation, by type:
//                                            a (α), bm (β−), bp (β+ and EC), g (γ), e (Auger, conversion), x (X-ray)
//
// The API takes one nuclide per request, so the radiation pull is a few thousand requests: four at a time, with a
// retry, and files already on disk are skipped, so a rerun resumes. The API asks for a User-Agent header.
//
//   node scripts/iaea-livechart-pull.mjs <out dir> [types=a,bm,bp,g,e,x]
// Then copy the folder to s3://govblock-lake-638175140432/lake/v1/nsr/iaea-livechart/<date>/.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { parseCsv } from "./iaea-livechart-csv.mjs";

const out = process.argv[2];
if (!out) throw new Error("usage: node scripts/iaea-livechart-pull.mjs <out dir> [types]");
const TYPES = (process.argv[3] ?? "a,bm,bp,g,e,x").split(",");
const API = "https://nds.iaea.org/relnsd/v1/data?";
const PARENTS = ["232th", "233u", "235u", "238u", "237np", "239pu", "241pu", "241am"];
const AT_ONCE = 4;

async function get(query, file) {
  const path = join(out, file);
  if (existsSync(path)) return "skip";
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const r = await fetch(API + query, { headers: { "User-Agent": "Livechart/1.0" } });
      if (r.ok) {
        mkdirSync(dirname(path), { recursive: true });
        writeFileSync(path, await r.text());
        return "ok";
      }
      if (r.status < 500 && r.status !== 429) return `http ${r.status}`;
    } catch {}
    await new Promise((res) => setTimeout(res, 1000 * 2 ** attempt));
  }
  return "failed";
}

async function pool(jobs) {
  const tally = {};
  let next = 0;
  let done = 0;
  await Promise.all(
    Array.from({ length: AT_ONCE }, async () => {
      while (next < jobs.length) {
        const [q, f] = jobs[next++];
        const res = await get(q, f);
        tally[res] = (tally[res] ?? 0) + 1;
        if (++done % 500 === 0) console.log(`${done}/${jobs.length}`, JSON.stringify(tally));
      }
    }),
  );
  return tally;
}

console.log("ground states:", await get("fields=ground_states&nuclides=all", "ground_states.csv"));
console.log(
  "fission yields:",
  JSON.stringify(await pool(PARENTS.flatMap((p) => ["cumulative", "independent"].map((k) => [`fields=${k}_fy&parents=${p}`, `fy/${k}_${p}.csv`])))),
);

// Every ground state with a half-life and a decay mode.
const gs = parseCsv(readFileSync(join(out, "ground_states.csv"), "utf8"));
const radioactive = gs.filter((x) => Number(x.z) > 0 && x.half_life_sec && x.decay_1).map((x) => `${Number(x.z) + Number(x.n)}${x.symbol.toLowerCase()}`);
console.log(`${radioactive.length} radioactive ground states × ${TYPES.length} radiation types`);
const jobs = TYPES.flatMap((t) => radioactive.map((nuc) => [`fields=decay_rads&nuclides=${nuc}&rad_types=${t}`, `decay_rads/${t}/${nuc}.csv`]));
console.log("decay radiation:", JSON.stringify(await pool(jobs)));
