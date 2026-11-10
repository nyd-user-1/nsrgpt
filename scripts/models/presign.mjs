// Brief 61: presigned GET links for the lake objects the Old-account GPU box needs (cross-account reads are refused),
// written as JSON {local path: url}. Signed by the New account's CLI user; links last HOURS hours.
//   node scripts/models/presign.mjs <out.json> [hours]
import { writeFileSync } from "node:fs"
import { S3Client, GetObjectCommand, ListObjectsV2Command } from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"
import { fromIni } from "@aws-sdk/credential-provider-ini"

const out = process.argv[2]
const hours = Number(process.argv[3] ?? 12)
const Bucket = "nsr-lake-613473203863"
const s3 = new S3Client({ region: "us-east-2", credentials: fromIni({ profile: "nysgpt-new" }) })
// local path on the box -> lake prefix (every object under it) or key
const WANT = [
  ["/opt/v1/", "raw/huggingface/2026-11-10/NYSgpt/nsr-encoder/"],
  ["/opt/v2in/", "lake/models/nsr-encoder-v2/train/"],
  ["/opt/v2in/", "lake/models/nsr-encoder-v2/bench/"],
  ["/opt/v2in/", "lake/models/nsr-encoder-v2/corpus/"],
  ["/opt/v2in/", "lake/models/nsr-encoder-v2/scripts/"],
]
const links = {}
for (const [dir, prefix] of WANT) {
  const r = await s3.send(new ListObjectsV2Command({ Bucket, Prefix: prefix }))
  for (const o of r.Contents ?? []) {
    const rel = prefix.startsWith("lake/models/nsr-encoder-v2/") ? o.Key.slice("lake/models/nsr-encoder-v2/".length) : o.Key.slice(prefix.length)
    links[dir + rel] = await getSignedUrl(s3, new GetObjectCommand({ Bucket, Key: o.Key }), { expiresIn: hours * 3600 })
  }
}
writeFileSync(out, JSON.stringify(links, null, 1))
console.log(Object.keys(links).length, "links,", hours, "hours")
