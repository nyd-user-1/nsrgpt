// Brief 61, Part D: invoke the search Lambda (nsr-search) directly with a few queries, one per pair type, and print the
// top hits and the time each took. The API key is read from the function's own configuration and never printed.
//   node scripts/models/search_probe.mjs [k]
import { LambdaClient, InvokeCommand, GetFunctionConfigurationCommand } from "@aws-sdk/client-lambda"
import { fromIni } from "@aws-sdk/credential-provider-ini"

const k = Number(process.argv[2] ?? 3)
const lambda = new LambdaClient({ region: "us-east-2", credentials: fromIni({ profile: "nysgpt-new" }) })
const cfg = await lambda.send(new GetFunctionConfigurationCommand({ FunctionName: "nsr-search" }))
const key = cfg.Environment.Variables.NSR_SEARCH_KEY
console.log("SEARCH_PREFIX:", cfg.Environment.Variables.SEARCH_PREFIX ?? "(unset: work/search/v1/)")
const call = async (rawPath, body) => {
  const t = Date.now()
  const r = await lambda.send(new InvokeCommand({ FunctionName: "nsr-search", Payload: Buffer.from(JSON.stringify({
    rawPath, headers: { "x-api-key": key }, body: JSON.stringify(body) })) }))
  const p = JSON.parse(Buffer.from(r.Payload).toString())
  return { ms: Date.now() - t, body: JSON.parse(p.body ?? "{}"), status: p.statusCode }
}
const h = await call("/health", {})
console.log("health", h.status, `${h.ms} ms`, JSON.stringify(h.body))
const QUERIES = {
  exfor: "Th-229(N,F) cross section: neutron-induced fission of 229Th, lead slowing-down spectrometer",
  ensdf: "60Co · 60FE B- DECAY (2.62E6 Y)",
  endf: "U-235 evaluated neutron data, ENDF/B-VIII.1, resonance parameters and covariances",
  nuclide: "Lu-176 thermal capture cross section",
  reaction: "gadolinium-157 neutron-induced radiative capture cross section",
}
for (const [type, q] of Object.entries(QUERIES)) {
  const r = await call("/search", { q, k, mode: "semantic" })
  const hits = (r.body.results ?? r.body.hits ?? []).map((x) => `${x.key_number ?? x.key ?? ""} ${(x.title ?? "").slice(0, 80)}`)
  console.log(`\n${type}: ${q}\n  ${r.status} ${r.ms} ms${r.body.warm === false ? " (cold)" : ""}\n  ` + hits.join("\n  "))
}
