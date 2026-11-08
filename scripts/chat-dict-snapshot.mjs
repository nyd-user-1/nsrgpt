// The chat plus menu's pickers (2026-11-07): nuclides, reactions and authors with their NSR record counts,
// read once from the lake (Athena, database nsr, New account) and written to public/viz-data/dict/<type>.json
// as [{ value, record_count }], most-cited first, 20,000 at most. The same lists the old nsr app's /api/dict
// served from Neon, now static files.
//
//   node scripts/chat-dict-snapshot.mjs
// Upload with `scripts/viz-data-publish.sh <version>`.
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";

const aws = (...args) => execFileSync("aws", [...args, "--profile", "nysgpt-new", "--region", "us-east-2", "--output", "json"], { encoding: "utf8", maxBuffer: 1 << 30 });

const LIMIT = 20000;
const SQL = {
  nuclides: `SELECT v AS value, count(*) AS record_count FROM nsr CROSS JOIN UNNEST(nuclides) AS t(v) WHERE v <> '' GROUP BY v ORDER BY record_count DESC, v LIMIT ${LIMIT}`,
  reactions: `SELECT v AS value, count(*) AS record_count FROM nsr CROSS JOIN UNNEST(reactions) AS t(v) WHERE v <> '' GROUP BY v ORDER BY record_count DESC, v LIMIT ${LIMIT}`,
  authors: `SELECT concat(coalesce(a.initial1, ''), CASE WHEN a.initial2 IS NOT NULL AND a.initial2 <> '' THEN '.' || a.initial2 ELSE '' END, '.',
              upper(substr(lower(a.last_name), 1, 1)), substr(lower(a.last_name), 2)) AS value, count(*) AS record_count
            FROM authors a JOIN nsr_authors na ON na.author_key = a.author_key
            GROUP BY a.author_key, a.initial1, a.initial2, a.last_name ORDER BY record_count DESC, value LIMIT ${LIMIT}`,
};

/** Athena's CSV: every field quoted, quotes doubled. */
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

mkdirSync("public/viz-data/dict", { recursive: true });
for (const [type, sql] of Object.entries(SQL)) {
  const qid = JSON.parse(aws("athena", "start-query-execution", "--work-group", "nsrgpt", "--query-execution-context", "Database=nsr", "--query-string", sql)).QueryExecutionId;
  let exec;
  for (;;) {
    exec = JSON.parse(aws("athena", "get-query-execution", "--query-execution-id", qid)).QueryExecution;
    if (exec.Status.State === "SUCCEEDED") break;
    if (["FAILED", "CANCELLED"].includes(exec.Status.State)) throw new Error(`${type}: ${exec.Status.StateChangeReason}`);
    await new Promise((r) => setTimeout(r, 1000));
  }
  const csv = execFileSync("aws", ["s3", "cp", "--profile", "nysgpt-new", exec.ResultConfiguration.OutputLocation, "-"], { encoding: "utf8", maxBuffer: 1 << 30 });
  const rows = parseCsv(csv).slice(1).filter((r) => r[0]).map(([value, n]) => ({ value, record_count: Number(n) }));
  writeFileSync(`public/viz-data/dict/${type}.json`, JSON.stringify(rows));
  console.log(`${type}: ${rows.length} (top: ${rows.slice(0, 3).map((r) => `${r.value} ${r.record_count}`).join(", ")})`);
}
