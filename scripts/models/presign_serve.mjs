// Brief 61, Part D: presigned links for v2_serve.sh, signed by the New account (the lake refuses the Old account's role):
// GET v1's records.jsonl.gz (for vec_index); PUT the four v2 files under work/search/v2/; and PUT the run's files and
// nsr-eval-v1 into lake/models/nsr-encoder-v2/ (listed from the rig's bucket with the Old account's profile).
//   node scripts/models/presign_serve.mjs <out.json> <run id> [hours]
import { writeFileSync } from "node:fs"
import { S3Client, GetObjectCommand, PutObjectCommand, ListObjectsV2Command } from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"
import { fromIni } from "@aws-sdk/credential-provider-ini"

const [out, run, hours = "6"] = process.argv.slice(2)
if (!run) throw new Error("usage: presign_serve.mjs <out.json> <run id> [hours]")
const Bucket = "nsr-lake-613473203863"
const s3 = new S3Client({ region: "us-east-2", credentials: fromIni({ profile: "nysgpt-new" }) })
const rig = new S3Client({ region: "us-east-1", credentials: fromIni({ profile: "default" }) })
const exp = { expiresIn: Number(hours) * 3600 }
const links = { get: {}, put: {}, copy: {} }
links.get["records.jsonl.gz"] = await getSignedUrl(s3, new GetObjectCommand({ Bucket, Key: "work/search/v1/records.jsonl.gz" }), exp)
for (const name of ["vectors.f16.npy", "vec_index.npy", "encoder/model.onnx", "encoder/tokenizer.json"])
  links.put[name] = await getSignedUrl(s3, new PutObjectCommand({ Bucket, Key: `work/search/v2/${name}` }), exp)
// rig key -> lake key, for every file of the run and of nsr-eval-v1
for (const [prefix, to] of [[`models/nsr-encoder-v2/run-${run}/`, `lake/models/nsr-encoder-v2/run-${run}/`],
                            ["eval/nsr-eval-v1/", "lake/models/nsr-encoder-v2/bench/nsr-eval-v1/"]]) {
  const r = await rig.send(new ListObjectsV2Command({ Bucket: "nsr-embed-v2", Prefix: prefix }))
  for (const o of r.Contents ?? [])
    links.copy[o.Key] = await getSignedUrl(s3, new PutObjectCommand({ Bucket, Key: to + o.Key.slice(prefix.length) }), exp)
}
writeFileSync(out, JSON.stringify(links, null, 1))
console.log("serve links:", Object.keys(links.get).length, "get,", Object.keys(links.put).length, "put,", Object.keys(links.copy).length, "copy")
