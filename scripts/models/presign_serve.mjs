// Brief 61, Part D: presigned links for v2_serve.sh, signed by the New account (the lake refuses the Old account's role):
// GET v1's records.jsonl.gz (for vec_index) and PUT the four v2 files under work/search/v2/.
//   node scripts/models/presign_serve.mjs <out.json> [hours]
import { writeFileSync } from "node:fs"
import { S3Client, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"
import { fromIni } from "@aws-sdk/credential-provider-ini"

const [out, hours = "6"] = process.argv.slice(2)
const Bucket = "nsr-lake-613473203863"
const s3 = new S3Client({ region: "us-east-2", credentials: fromIni({ profile: "nysgpt-new" }) })
const exp = { expiresIn: Number(hours) * 3600 }
const links = { get: {}, put: {} }
links.get["records.jsonl.gz"] = await getSignedUrl(s3, new GetObjectCommand({ Bucket, Key: "work/search/v1/records.jsonl.gz" }), exp)
for (const name of ["vectors.f16.npy", "vec_index.npy", "encoder/model.onnx", "encoder/tokenizer.json"])
  links.put[name] = await getSignedUrl(s3, new PutObjectCommand({ Bucket, Key: `work/search/v2/${name}` }), exp)
writeFileSync(out, JSON.stringify(links, null, 1))
console.log("serve links:", Object.keys(links.get).length, "get,", Object.keys(links.put).length, "put")
