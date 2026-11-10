// Brief 62 Part B.5: IAEA's CD-ROM catalog (nds.iaea.org/cdroms/cd-catalog.js, held in raw/iaea/2026-11-07/cdroms/)
// evaluated as the page evaluates it, every product printed as JSON.   node cdroms.js cd-catalog.js > catalog.json
const fs = require('fs')
const vm = require('vm')
const src = fs.readFileSync(process.argv[2], 'latin1')
const ctx = { document: { write() {}, writeln() {}, getElementById() { return null } }, window: {}, navigator: { userAgent: '' } }
vm.createContext(ctx)
vm.runInContext(src, ctx)
const out = []
for (const [k, v] of Object.entries(ctx)) {
  if (Array.isArray(v) && v.length && v[0] && typeof v[0] === 'object' && 'name' in v[0]) out.push(...v.map((p) => ({ array: k, ...p })))
}
process.stdout.write(JSON.stringify(out))
