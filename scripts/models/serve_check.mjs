// Brief 61, Part D: R@10 and MRR as the search Lambda serves them (int8 ONNX queries over the served float16 vectors),
// on a fixed sample: 1,000 KW and 1,000 EX queries of nsr-eval-v1 and 300 of each paper-side pair type of the frozen
// benchmark. Run once with SEARCH_PREFIX on v1 and once on v2. Reads the queries from the lake (small files).
//   node scripts/models/serve_check.mjs <label>
import { LambdaClient, InvokeCommand, GetFunctionConfigurationCommand } from "@aws-sdk/client-lambda"
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3"
import { fromIni } from "@aws-sdk/credential-provider-ini"

const label = process.argv[2] ?? "run"
const credentials = fromIni({ profile: "nysgpt-new" })
const lambda = new LambdaClient({ region: "us-east-2", credentials })
const s3 = new S3Client({ region: "us-east-2", credentials })
const text = async (Key) => (await s3.send(new GetObjectCommand({ Bucket: "nsr-lake-613473203863", Key }))).Body.transformToString()
const P = "lake/models/nsr-encoder-v2/bench/"
const qrels = {}
for (const l of (await text(P + "nsr-eval-v1/qrels.tsv")).trim().split("\n")) {
  const [q, k] = l.split("\t")
  ;(qrels[q] ??= new Set()).add(k)
}
let seed = 61
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648)
const sample = (arr, n) => arr.map((x) => [rand(), x]).sort((a, b) => a[0] - b[0]).slice(0, n).map((x) => x[1])
const v1 = (await text(P + "nsr-eval-v1/queries.jsonl")).trim().split("\n").map((l) => JSON.parse(l))
const bench = (await text(P + "queries.jsonl")).trim().split("\n").map((l) => JSON.parse(l))
const tasks = [
  ...sample(v1.filter((q) => q.family === "KW"), 1000).map((q) => ({ group: "nsr-eval-v1 KW", q: q.text, rel: qrels[q.qid] })),
  ...sample(v1.filter((q) => q.family === "EX"), 1000).map((q) => ({ group: "nsr-eval-v1 EX", q: q.text, rel: qrels[q.qid] })),
  ...["ex_nsr", "ensdf_nsr", "endf_nsr"].flatMap((t) =>
    sample(bench.filter((b) => b.type === t), 300).map((b) => ({ group: `cross-source ${t}`, q: b.query, rel: new Set(b.relevant) }))),
]
const cfg = await lambda.send(new GetFunctionConfigurationCommand({ FunctionName: "nsr-search" }))
const key = cfg.Environment.Variables.NSR_SEARCH_KEY
const prefix = cfg.Environment.Variables.SEARCH_PREFIX ?? "work/search/v1/"
const acc = {}
const times = []
let i = 0
const worker = async () => {
  while (i < tasks.length) {
    const t = tasks[i++]
    const t0 = Date.now()
    const r = await lambda.send(new InvokeCommand({ FunctionName: "nsr-search", Payload: Buffer.from(JSON.stringify({
      rawPath: "/search", headers: { "x-api-key": key }, body: JSON.stringify({ q: t.q.slice(0, 500), k: 10, mode: "semantic" }) })) }))
    times.push(Date.now() - t0)
    const body = JSON.parse(JSON.parse(Buffer.from(r.Payload).toString()).body ?? "{}")
    const keys = (body.results ?? body.hits ?? []).map((x) => x.key_number ?? x.key)
    const first = keys.findIndex((k) => t.rel?.has(k))
    for (const g of [t.group, t.group.split(" ")[0] + " all"]) {
      const a = (acc[g] ??= { n: 0, r10: 0, mrr: 0 })
      a.n++
      if (first >= 0) { a.r10++; a.mrr += 1 / (first + 1) }
    }
  }
}
await Promise.all(Array.from({ length: 4 }, worker))
times.sort((a, b) => a - b)
console.log(`${label} (${prefix}), ${tasks.length} queries, invoke median ${times[times.length >> 1]} ms, p90 ${times[Math.floor(times.length * 0.9)]} ms`)
for (const [g, a] of Object.entries(acc).sort()) console.log(`  ${g.padEnd(26)} n ${String(a.n).padStart(5)}  R@10 ${(a.r10 / a.n).toFixed(3)}  MRR ${(a.mrr / a.n).toFixed(3)}`)
