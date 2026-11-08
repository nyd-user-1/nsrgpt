// The nsr-fetch page with a working button. Serves page.html on localhost; its
// "Put in the lake" button posts here, this server calls Lambda nsr-fetch with the Mac's nysgpt-new profile,
// then reads back each file from the lake for its card: type, size and a preview (a short-lived signed link
// for PDFs, images and pages; the first 2,000 bytes for text).
//   node scripts/nsr-fetch-ui/server.mjs        # then open http://localhost:4317
// Localhost only. Posts must come from this page (Origin check, JSON body); the Lambda's role can write only
// under raw/ in the lake.
import http from "node:http"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { execFile } from "node:child_process"
import { promisify } from "node:util"

const run = promisify(execFile)
const PORT = Number(process.env.PORT || 4317)
const PAGE = new URL("./page.html", import.meta.url)
const BUCKET = "nsr-lake-613473203863"
const AWS = ["--profile", "nysgpt-new", "--region", "us-east-2"]
const ORIGINS = [`http://localhost:${PORT}`, `http://127.0.0.1:${PORT}`]

// Same rule as the page and scripts/nndc/list.py: the lake path follows the site's own path.
function keyFor(url, folder) {
  const u = new URL(url)
  let p = decodeURIComponent(u.pathname)
  if (p === "" || p.endsWith("/")) p += "index.html"
  if (u.search) p += "__" + encodeURIComponent(u.search.slice(1))
  return `${folder.replace(/\/+$/, "")}/${u.hostname}${p}`
}

const tmp = (ext) => path.join(os.tmpdir(), `nsr-fetch-ui-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`)

async function invoke(items) {
  const out = tmp(".json")
  await run("aws", ["lambda", "invoke", "--function-name", "nsr-fetch", ...AWS, "--cli-binary-format", "raw-in-base64-out",
    "--cli-read-timeout", "0", "--payload", JSON.stringify({ items }), out], { maxBuffer: 1 << 24 })
  const body = JSON.parse(fs.readFileSync(out, "utf8"))
  fs.unlinkSync(out)
  if (body.errorMessage) throw new Error(body.errorMessage)
  return body
}

async function card(key) {
  const head = JSON.parse((await run("aws", ["s3api", "head-object", "--bucket", BUCKET, "--key", key, ...AWS, "--output", "json"])).stdout)
  const type = head.ContentType || ""
  const link = (await run("aws", ["s3", "presign", `s3://${BUCKET}/${key}`, "--expires-in", "3600", ...AWS])).stdout.trim()
  let text = null
  if (/^text\/(?!html)|json|xml|csv/.test(type) || /\.(txt|csv|json|xml|endf|ens|dat|md|all|upd)$/i.test(key)) {
    const f = tmp(".part")
    await run("aws", ["s3api", "get-object", "--bucket", BUCKET, "--key", key, "--range", "bytes=0-1999", ...AWS, f])
    text = fs.readFileSync(f, "utf8"); fs.unlinkSync(f)
  }
  return { type, size: head.ContentLength, stored: head.LastModified, storage: head.StorageClass || "STANDARD", link, text }
}

async function handle(body) {
  const folder = String(body.folder || "").trim()
  if (!/^raw\/[A-Za-z0-9._\/-]+$/.test(folder) || folder.includes("..")) throw new Error("The lake folder must start with raw/")
  const proxy = body.proxy === "" || body.proxy == null ? null : Number(body.proxy)
  const urls = String(body.urls || "").split("\n").map((s) => s.trim()).filter(Boolean)
  const bad = urls.filter((u) => !/^https?:\/\/[^\s]+$/i.test(u))
  const items = urls.filter((u) => !bad.includes(u)).map((url) => ({ url, key: keyFor(url, folder), ...(proxy == null ? {} : { proxy }) }))
  const results = []
  for (let i = 0; i < items.length; i += 40) results.push(...(await invoke(items.slice(i, i + 40))))
  for (const r of results) {
    if (r.status !== "error") {
      try { r.card = await card(r.key) } catch (e) { r.cardError = String(e.message).slice(0, 200) }
    }
  }
  return [...results, ...bad.map((url) => ({ url, status: "error", error: "Not a web address" }))]
}

http.createServer(async (req, res) => {
  try {
    if (req.method === "GET" && (req.url === "/" || req.url.startsWith("/?"))) {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" })
      return res.end(fs.readFileSync(PAGE))
    }
    if (req.method === "POST" && req.url === "/api/fetch") {
      if (!ORIGINS.includes(req.headers.origin) || !String(req.headers["content-type"]).startsWith("application/json")) {
        res.writeHead(403); return res.end()
      }
      let raw = ""
      for await (const chunk of req) raw += chunk
      const out = await handle(JSON.parse(raw))
      res.writeHead(200, { "Content-Type": "application/json" })
      return res.end(JSON.stringify(out))
    }
    res.writeHead(404); res.end()
  } catch (e) {
    res.writeHead(400, { "Content-Type": "application/json" })
    res.end(JSON.stringify({ error: String(e.message).slice(0, 300) }))
  }
}).listen(PORT, "127.0.0.1", () => console.log(`nsr-fetch page: http://localhost:${PORT}`))
