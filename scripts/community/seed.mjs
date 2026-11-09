// Write the Views and Recipes seeds (lib/community-seeds.ts) into the store once, under their own ids, through Lambda
// nsr-api's POST /community (brief 34). Writing again replaces them in place. The write key comes from
// NSR_API_WRITE_KEY or, failing that, SSM /nsrgpt/devbox/nsr-api-write-key with the nysgpt-new profile.
//   node --experimental-strip-types scripts/community/seed.mjs
import { execFileSync } from "node:child_process"
import { SEEDS } from "../../lib/community-seeds.ts"

const ORIGIN = process.env.NSR_API_ORIGIN ?? "https://3o2ps7jan4.execute-api.us-east-2.amazonaws.com"
const KEY = process.env.NSR_API_WRITE_KEY ?? execFileSync("aws", ["ssm", "get-parameter", "--profile", "nysgpt-new", "--region", "us-east-2",
  "--name", "/nsrgpt/devbox/nsr-api-write-key", "--with-decryption", "--query", "Parameter.Value", "--output", "text"]).toString().trim()

for (const s of SEEDS) {
  const r = await fetch(`${ORIGIN}/community`, {
    method: "POST",
    headers: { "x-nsr-write-key": KEY, "content-type": "application/json" },
    body: JSON.stringify({ id: s.id, name: s.name, saved_by: s.saved_by, created_at: s.created_at, state: s.state }),
  })
  const j = await r.json()
  console.log(r.status, s.id, s.name, j.view?.kind ?? j.error)
}
