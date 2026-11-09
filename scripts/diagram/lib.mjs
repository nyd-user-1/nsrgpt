// Shared helpers for the diagram data scripts (brief 29, 2026-11-08). Reads: Athena (workgroup nsrgpt, database nsr)
// and the nsr-api through CloudFront. Writes: public/viz-data/diagram/<name>.json, then publish() copies the file to
// the chart CDN (site/viz-data/v20261108/diagram/) and to lake/serve/diagram/, and adds it to the lake manifest.
// Uses the local AWS CLI's credentials (profile nysgpt-new), one call at a time.
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const BUCKET = "nsr-lake-613473203863";
export const VERSION = "v20261108";
export const API = "https://daw1qggkn69lv.cloudfront.net";
export const CDN = "https://dcl3kyt3ynmb2.cloudfront.net";

const PROFILE = ["--profile", "nysgpt-new", "--region", "us-east-2"];
export const aws = (...args) =>
  execFileSync("aws", [...args, ...PROFILE, "--output", "json"], { encoding: "utf8", maxBuffer: 1 << 28 });

const sleep = (ms) => execFileSync("sleep", [String(ms / 1000)]);

/** Run one Athena query; rows as objects keyed by column name (all values strings or null). */
export function athena(sql) {
  const { QueryExecutionId: id } = JSON.parse(aws("athena", "start-query-execution", "--work-group", "nsrgpt",
    "--query-execution-context", "Database=nsr", "--query-string", sql));
  for (;;) {
    const s = JSON.parse(aws("athena", "get-query-execution", "--query-execution-id", id)).QueryExecution.Status;
    if (s.State === "SUCCEEDED") break;
    if (s.State === "FAILED" || s.State === "CANCELLED") throw new Error(`${s.State}: ${s.StateChangeReason}\n${sql}`);
    sleep(1000);
  }
  const out = [];
  let token, cols;
  do {
    const r = JSON.parse(aws("athena", "get-query-results", "--query-execution-id", id, ...(token ? ["--next-token", token] : [])));
    const rows = r.ResultSet.Rows.map((x) => x.Data.map((c) => c.VarCharValue ?? null));
    if (!cols) cols = rows.shift();
    for (const v of rows) out.push(Object.fromEntries(cols.map((c, i) => [c, v[i]])));
    token = r.NextToken;
  } while (token);
  return out;
}

/** GET a JSON route of the nsr-api. */
export async function api(path) {
  const r = await fetch(API + path);
  if (!r.ok) throw new Error(`${r.status} ${path}`);
  return r.json();
}

export const num = (v) => (v === null || v === undefined || v === "" ? null : Number(v));

/** Write public/viz-data/diagram/<name>, upload it to the CDN folder and the lake, record it in the lake manifest
 *  (sources, plus any `extra` fields for that entry). */
export function publish(name, obj, sources, extra = {}) {
  const local = join(ROOT, "public", "viz-data", "diagram", name);
  mkdirSync(dirname(local), { recursive: true });
  const body = JSON.stringify(obj);
  writeFileSync(local, body);
  aws("s3", "cp", local, `s3://${BUCKET}/site/viz-data/${VERSION}/diagram/${name}`, "--content-type", "application/json",
    "--cache-control", "public, max-age=31536000, immutable", "--only-show-errors");
  aws("s3", "cp", local, `s3://${BUCKET}/lake/serve/diagram/${name}`, "--content-type", "application/json", "--only-show-errors");
  // the manifest lists every file with its sources; read, update this file's entry, write back
  let manifest = { description: "Data files for the diagram library (brief 29): one JSON per figure, also served at "
    + `${CDN}/viz-data/${VERSION}/diagram/<name>. Scripts: scripts/diagram/.`, files: {} };
  try {
    manifest = JSON.parse(execFileSync("aws", ["s3", "cp", `s3://${BUCKET}/lake/serve/diagram/manifest.json`, "-", ...PROFILE], { encoding: "utf8" }));
  } catch { /* first file */ }
  manifest.files[name] = { bytes: Buffer.byteLength(body), written: new Date().toISOString().slice(0, 19) + "Z", sources, ...extra };
  const mpath = join(ROOT, "public", "viz-data", "diagram", "manifest.json");
  writeFileSync(mpath, JSON.stringify(manifest, null, 1));
  aws("s3", "cp", mpath, `s3://${BUCKET}/lake/serve/diagram/manifest.json`, "--content-type", "application/json", "--only-show-errors");
  console.log(`published ${name}: ${Buffer.byteLength(body)} bytes → ${CDN}/viz-data/${VERSION}/diagram/${name}`);
}
