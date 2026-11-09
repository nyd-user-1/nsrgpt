// Shared by the chart-data scripts in scripts/viz/ (brief 35, 2026-11-09): Athena (workgroup nsrgpt, database nsr,
// profile nysgpt-new, us-east-2), one query at a time, and the publish step: the file to public/viz-data/<name>, the
// chart CDN (site/viz-data/<version>/<name>), the lake (lake/serve/viz/<name>) and its row in lake/serve/viz/manifest.json.
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const BUCKET = "nsr-lake-613473203863";
export const VERSION = "v20261108";
export const CDN = "https://dcl3kyt3ynmb2.cloudfront.net";
const PROFILE = ["--profile", "nysgpt-new", "--region", "us-east-2"];
export const aws = (...args) => execFileSync("aws", [...args, ...PROFILE, "--output", "json"], { encoding: "utf8", maxBuffer: 1 << 28 });

function parseCsv(text) {
  const rows = [];
  let row = [], field = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') q = false;
      else field += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (c !== "\r") field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}

/** One Athena query, waited on, its CSV result read in one call; rows as objects of strings (empty → null). */
export function athena(label, sql) {
  const { QueryExecutionId: id } = JSON.parse(aws("athena", "start-query-execution", "--work-group", "nsrgpt",
    "--query-execution-context", "Database=nsr", "--query-string", sql));
  for (;;) {
    const exec = JSON.parse(aws("athena", "get-query-execution", "--query-execution-id", id)).QueryExecution;
    const s = exec.Status.State;
    if (s === "SUCCEEDED") {
      const csv = execFileSync("aws", ["s3", "cp", exec.ResultConfiguration.OutputLocation, "-", ...PROFILE], { encoding: "utf8", maxBuffer: 1 << 28 });
      const [cols, ...rows] = parseCsv(csv);
      console.log(`${label}: ${rows.length} rows, ${(exec.Statistics.DataScannedInBytes / 1e6).toFixed(1)} MB scanned`);
      return rows.map((r) => Object.fromEntries(cols.map((c, i) => [c, r[i] === "" ? null : r[i]])));
    }
    if (s === "FAILED" || s === "CANCELLED") throw new Error(`${label}: ${s}: ${exec.Status.StateChangeReason}`);
    execFileSync("sleep", ["1"]);
  }
}

/** Write public/viz-data/<name>; unless --no-publish was given, copy it to the CDN folder and the lake and record it
 *  in the lake manifest with `entry` (script, sources, row counts). Returns the local path. */
export function publish(name, obj, entry) {
  const body = JSON.stringify(obj);
  const local = join(ROOT, "public", "viz-data", name);
  mkdirSync(dirname(local), { recursive: true });
  writeFileSync(local, body);
  console.log(`wrote ${local}: ${(body.length / 1024).toFixed(0)} KB`);
  if (process.argv.includes("--no-publish")) return local;
  aws("s3", "cp", local, `s3://${BUCKET}/site/viz-data/${VERSION}/${name}`, "--content-type", "application/json",
    "--cache-control", "public, max-age=31536000, immutable", "--only-show-errors");
  aws("s3", "cp", local, `s3://${BUCKET}/lake/serve/viz/${name}`, "--content-type", "application/json", "--only-show-errors");
  let manifest = { description: `Chart data files kept in the lake as well as on the chart CDN (${CDN}/viz-data/${VERSION}/<name>). ` +
    "Each file names its script and sources.", files: {} };
  try {
    manifest = JSON.parse(execFileSync("aws", ["s3", "cp", `s3://${BUCKET}/lake/serve/viz/manifest.json`, "-", ...PROFILE], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }));
  } catch { /* first file */ }
  manifest.files[name] = { bytes: Buffer.byteLength(body), written: new Date().toISOString().slice(0, 19) + "Z", ...entry };
  const mpath = join(ROOT, "public", "viz-data", "viz-manifest.json");
  writeFileSync(mpath, JSON.stringify(manifest, null, 1));
  aws("s3", "cp", mpath, `s3://${BUCKET}/lake/serve/viz/manifest.json`, "--content-type", "application/json", "--only-show-errors");
  console.log(`published → ${CDN}/viz-data/${VERSION}/${name} and s3://${BUCKET}/lake/serve/viz/${name}`);
  return local;
}
