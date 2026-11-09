import { SEED_FILES } from "@/lib/community-seeds"
import { signedInName, store, storeConfigured, type LibFile } from "@/lib/community"

// The canvas's file drop and the Library list (brief 34). Files go to s3://nsr-lake-613473203863/files/pdfs/workspace/
// <yyyy-mm>/<name> through Lambda nsr-api's /files (lib/community.ts); the app holds no AWS keys. The page's flow stays:
//   GET  ?name=&type=   reserves a free key and answers {key, url}, url being this route's PUT for that key
//   PUT  ?key=&type=    takes the file (25 MB at most), gets an S3 upload URL from the store and puts it there;
//                       answers with the file as the Library lists it
//   GET  ?list=1        the Library: the store's files and the three seeds (brief 30), which stay where they are
// Uploads need a signed-in reader. Without NSR_API_WRITE_KEY the list is the seeds and an upload says it isn't set up.

const MAX = 25 * 1024 * 1024
const PREFIX = "files/pdfs/workspace/"

export async function GET(req: Request) {
  const params = new URL(req.url).searchParams
  if (params.get("list")) {
    let files: LibFile[] = []
    if (storeConfigured()) {
      try {
        files = (await store<{ files: LibFile[] }>("/files")).files
      } catch {
        // the store is down: the seeds still list
      }
    }
    const seeded = new Set(SEED_FILES.map((f) => f.key))
    const all = [...SEED_FILES, ...files.filter((f) => !seeded.has(f.key))].sort((a, b) => String(b.modified).localeCompare(String(a.modified)))
    return Response.json({ files: all })
  }
  if (!storeConfigured()) return Response.json({ error: "File upload isn't set up on this server." }, { status: 503 })
  if (!(await signedInName())) return Response.json({ error: "Sign in to upload files." }, { status: 401 })
  const name = params.get("name")?.trim()
  if (!name) return Response.json({ error: "Give the file's name." }, { status: 400 })
  const type = params.get("type") || "application/octet-stream"
  try {
    const { key } = await store<{ key: string }>("/files", { method: "POST", body: { name, type } })
    return Response.json({ key, url: `/api/upload?key=${encodeURIComponent(key)}&type=${encodeURIComponent(type)}` })
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: (e as { status?: number }).status ?? 502 })
  }
}

export async function PUT(req: Request) {
  if (!storeConfigured()) return Response.json({ error: "File upload isn't set up on this server." }, { status: 503 })
  if (!(await signedInName())) return Response.json({ error: "Sign in to upload files." }, { status: 401 })
  const params = new URL(req.url).searchParams
  const key = params.get("key") ?? ""
  const type = params.get("type") || "application/octet-stream"
  if (!key.startsWith(PREFIX) || key.includes("..")) return Response.json({ error: "Not an upload key." }, { status: 400 })
  if (Number(req.headers.get("content-length") ?? 0) > MAX) return Response.json({ error: "Files go up to 25 MB." }, { status: 413 })
  const bytes = await req.arrayBuffer()
  if (bytes.byteLength > MAX) return Response.json({ error: "Files go up to 25 MB." }, { status: 413 })
  try {
    const { url } = await store<{ url: string }>("/files", { method: "POST", body: { key, type } })
    const put = await fetch(url, { method: "PUT", headers: { "Content-Type": type }, body: bytes })
    if (!put.ok) return Response.json({ error: `The upload to S3 answered ${put.status}.` }, { status: 502 })
    const file: LibFile = { key, name: key.slice(key.lastIndexOf("/") + 1), size: bytes.byteLength, modified: new Date().toISOString().slice(0, 10) }
    return Response.json(file)
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: (e as { status?: number }).status ?? 502 })
  }
}
