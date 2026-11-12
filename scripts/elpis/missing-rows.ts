// The book rows JANIS lists that I hold no section for and no release's MT 5 produces (brief 72, 5e).
// Run: npx tsx scripts/elpis/missing-rows.ts > docs/analysis/elpis-missing-rows.html
import { readFileSync } from "node:fs"
import { mtLabel, parseBookNuclide, railMts, residualZa, productName, type BookIndex } from "@/lib/elpis"
import { symbolOfZ } from "@/lib/janis-tree"

const BOOKS: [string, string][] = [["n", "Neutrons"], ["g", "Photons"], ["p", "Protons"], ["d", "Deuterons"], ["t", "Tritons"], ["h", "Helium-3"], ["a", "Alphas"]]
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;")
let total = 0
const parts: string[] = []
for (const [key, name] of BOOKS) {
  const idx = JSON.parse(readFileSync(`public/elpis/book-${key}.json`, "utf8")) as BookIndex
  const rows: string[] = []
  for (const n of idx.nuclides) {
    if (!n.j) continue
    const nuc = parseBookNuclide(n.l)
    for (const r of railMts(idx, n)) {
      if (!r.janis || r.mine || r.prod) continue
      const za = nuc ? residualZa(key, nuc.z, nuc.a, r.mt) : null
      const sym = nuc ? symbolOfZ(nuc.z) : ""
      rows.push(`<tr><td>${esc(n.l)}</td><td>${r.mt}</td><td>${esc(mtLabel(r.mt, key === "h" ? "h" : key === "a" ? "α" : key === "g" ? "γ" : key, key))}</td><td>${za ? productName(za) : ""}</td></tr>`)
      void sym
    }
  }
  total += rows.length
  parts.push(`<h2>${name} · ${rows.length}</h2><table><tr><th>Nuclide</th><th>MT</th><th>Reaction</th><th>Residual</th></tr>${rows.join("")}</table>`)
}
console.log(`<!doctype html><meta charset="utf-8"><title>Elpis: book rows JANIS lists and I lack</title><style>body{margin:0;background:#f6f5f1;color:#1f2328;font:14px/1.5 -apple-system,BlinkMacSystemFont,Inter,sans-serif}main{max-width:820px;margin:40px auto;padding:0 24px}h1{font-size:22px;margin:0 0 4px}.d{color:#6b7280;font-size:13px}h2{font-size:13px;margin:28px 0 8px;text-transform:uppercase;letter-spacing:.05em;color:#6b7280}table{width:100%;border-collapse:collapse;background:#fff;border:1px solid #e5e2da}th,td{text-align:left;padding:6px 12px;border-top:1px solid #e5e2da}th{background:#faf9f6;font-size:12px;color:#6b7280}td:nth-child(2){font-variant-numeric:tabular-nums}</style><main><h1>Book rows JANIS lists and I lack: ${total}</h1><div class="d">From public/elpis/book-*.json, built 2026-11-11</div>${parts.join("")}</main>`)
