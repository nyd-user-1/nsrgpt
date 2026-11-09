// The structure index (brief 35, 2026-11-09): the old nsr app's StructureIndex (src/lib/structure.ts), rebuilt from the
// lake instead of the scraped ensdf_index table. Feeds /viz/structure (the chart and the evaluation index), the colour
// modes on /viz/chart and the nuclides table.
//
//   node scripts/viz/structure-index.mjs            build, write public/viz-data/structure-index.json, publish
//   node scripts/viz/structure-index.mjs --no-publish
//
// Reads Athena (workgroup nsrgpt, database nsr, profile nysgpt-new, us-east-2), one query at a time:
//   chains    the mass chain's history card in its COMMENTS dataset (nsr.ensdf_cards, rtype H, NUCID the bare mass):
//             TYP, AUT (evaluators), CIT (citation), CUT (literature cutoff). A chain whose card gives no cutoff
//             takes the evaluation most of its nuclides' Adopted Levels datasets carry.
//   nuclides  per NUCID, its ENSDF datasets (nsr.ensdf_datasets): the count, the latest date, and the parsed history
//             of its Adopted Levels dataset (else its own COMMENTS dataset, else its latest dataset). A nuclide whose
//             latest full evaluation cites something other than its chain's is a nuclide evaluation of its own.
//   xundl     per NUCID and date, the XUNDL datasets (nsr.xundl_datasets); "since cutoff" counts those dated after
//             the month of the nuclide's cutoff.
//   exfor     distinct EXFOR entries per target ZA (nsr.exfor_serve_search_index, the rows exfor_serve_targets is
//             built from; the targets table counts a target's ground and isomeric states apart).
//   keys      NSR key numbers for evaluation citations that match exactly one NSR reference (nsr.search_nsr).
//
// Publishes to the chart CDN (site/viz-data/v20261108/structure-index.json) and the lake (lake/serve/viz/), with the
// file's row in lake/serve/viz/manifest.json (scripts/viz/lib.mjs).
import { athena, publish } from "./lib.mjs";

const NAME = "structure-index.json";
const ENSDF_RELEASE = "2026-11-05"; // the lake's ENSDF tables (lake/ensdf/2026-11-05/)

// ── ENSDF history records ────────────────────────────────────────────────────────────────────────────────────────
const MONTHS = { JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6, JUL: 7, AUG: 8, SEP: 9, OCT: 10, NOV: 11, DEC: 12 };
const pad = (v) => String(v).padStart(2, "0");
/** "31-Dec-2012", "27-MAY-2014", "Oct-2006", "2006-10-01", "2006" → "2012-12-31" (day 1 when none; null unreadable). */
function isoDate(raw) {
  const s = String(raw ?? "").trim().toUpperCase().replace(/[.,;]+$/, "");
  let m = /^(\d{1,2})[-\s/]*([A-Z]{3})[A-Z]*[-\s/,]*(\d{4})$/.exec(s);
  if (m && MONTHS[m[2]]) return `${m[3]}-${pad(MONTHS[m[2]])}-${pad(m[1])}`;
  m = /^([A-Z]{3})[A-Z]*[-\s/,]*(\d{4})$/.exec(s);
  if (m && MONTHS[m[1]]) return `${m[2]}-${pad(MONTHS[m[1]])}-01`;
  m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (m) return `${m[1]}-${pad(m[2])}-${pad(m[3])}`;
  m = /^(\d{4})$/.exec(s);
  if (m) return `${m[1]}-01-01`;
  return null;
}
const yyyymm = (iso) => (iso ? Number(iso.slice(0, 4) + iso.slice(5, 7)) : null);

/** One history record's fields, upper-cased keys: "TYP=FUL$AUT=…$CIT=…$CUT=…$", or the older comment form
 *  "COMM$Typ=ful; aut=…; cit=…; cut=…;". */
function fieldsOf(body) {
  const s = body.replace(/^\s*COMM\$/i, "");
  const sep = /\$/.test(s) ? "$" : ";";
  const out = {};
  for (const part of s.split(sep)) {
    const m = /^\s*([A-Za-z]{3})\s*=\s*(.*?)\s*$/.exec(part);
    if (m) out[m[1].toUpperCase()] = m[2];
  }
  return out;
}

/** A dataset's H cards as records: a card with a blank continuation column starts one, the rest continue it. */
function recordsOf(cards) {
  const recs = [];
  for (const text of cards) {
    const cont = text[5] ?? " ";
    const body = text.slice(9).replace(/\s+$/, "");
    if (cont === " " || !recs.length) recs.push(body);
    else {
      const prev = recs[recs.length - 1];
      // a field split across cards joins without a space; a field ending at the card's end keeps its "$" or ";"
      recs[recs.length - 1] = /[$;]$/.test(prev) ? `${prev}${body.trimStart()}` : `${prev} ${body.trimStart()}`;
    }
  }
  return recs.map(fieldsOf);
}

/** The latest full evaluation among a list of history records (FUL with a readable cutoff), as { cit, aut, cut }. */
function latestFull(recs) {
  let best = null;
  for (const r of recs ?? []) {
    if ((r.TYP ?? "").toUpperCase() !== "FUL") continue;
    const cut = isoDate(r.CUT);
    if (!cut) continue;
    if (!best || cut > best.cut) best = { cit: tidyCit(r.CIT), aut: tidyAut(r.AUT), cut };
  }
  return best;
}
/** One spelling per journal: "Nuclear Data Sheets 94,131 (2001)" and "NDS 94, 131 (2001)" both read "NDS 94, 131 (2001)";
 *  "NP 564 1 (1993)" reads "NP A564, 1 (1993)". */
const tidyCit = (c) => {
  if (!c) return null;
  let s = c.replace(/\s+/g, " ").replace(/\.$/, "").trim();
  s = s.replace(/^Nucl(?:ear|\.)\s*Data\s*Sheets\b\.?/i, "NDS").replace(/^Nucl(?:ear|\.)\s*Phys(?:ics|\.)\s*/i, "NP ");
  s = s.replace(/^NP\s*(\d)/i, "NP A$1").replace(/^(NDS|NP)\s+(A?\d+)\s*,?\s+(\d+)/i, "$1 $2, $3").replace(/,(\S)/g, ", $1");
  // "69(2015)" and "509, 2021" close as "69 (2015)" and "509 (2021)"
  return s.replace(/(\d)\((\d{4})\)/, "$1 ($2)").replace(/^((?:NDS|NP) A?\d+, \d+), (\d{4})$/, "$1 ($2)");
};
const tidyAut = (a) => (a ? a.replace(/\{[^}]*\}/g, "").replace(/\s+/g, " ").trim() : null);
const citKey = (c) => (c ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const parseHistory = (h) => { try { return h ? JSON.parse(h) : null; } catch { return null; } };

const SYMBOLS = ["n","H","He","Li","Be","B","C","N","O","F","Ne","Na","Mg","Al","Si","P","S","Cl","Ar","K","Ca","Sc","Ti","V","Cr","Mn","Fe","Co","Ni","Cu","Zn","Ga","Ge","As","Se","Br","Kr","Rb","Sr","Y","Zr","Nb","Mo","Tc","Ru","Rh","Pd","Ag","Cd","In","Sn","Sb","Te","I","Xe","Cs","Ba","La","Ce","Pr","Nd","Pm","Sm","Eu","Gd","Tb","Dy","Ho","Er","Tm","Yb","Lu","Hf","Ta","W","Re","Os","Ir","Pt","Au","Hg","Tl","Pb","Bi","Po","At","Rn","Fr","Ra","Ac","Th","Pa","U","Np","Pu","Am","Cm","Bk","Cf","Es","Fm","Md","No","Lr","Rf","Db","Sg","Bh","Hs","Mt","Ds","Rg","Cn","Nh","Fl","Mc","Lv","Ts","Og"];
/** "60CO" → { a: 60, z: 27, el: "Co" }; "1NN" the neutron. Element 118 is the heaviest named, and nothing known reaches
 *  A = 300 (the old chart's guard against mis-parsed IDs). */
function nuclideOf(nucid) {
  const m = /^(\d+)([A-Z]{1,2})$/.exec(String(nucid).trim());
  if (!m) return null;
  const a = Number(m[1]);
  const z = m[2] === "NN" ? 0 : SYMBOLS.findIndex((s) => s.toUpperCase() === m[2]);
  if (z < 0 || a < 1 || a > 300 || a - z < 0) return null;
  return { a, z, n: a - z, el: z === 0 ? "n" : SYMBOLS[z] };
}

// ── Queries ──────────────────────────────────────────────────────────────────────────────────────────────────────
const NUCID = "regexp_like(nucid, '^[0-9]+[A-Z]+$')";
const chainCards = athena("chain history cards",
  "SELECT nucid, dataset_seq, card_seq, text FROM ensdf_cards WHERE regexp_like(nucid, '^[0-9]+$') AND rtype = 'H'");
const ensdf = athena("ENSDF nuclides", `SELECT nucid, count(*) AS datasets, max(date) AS revised,
    max(CASE WHEN dstype = 'adopted' THEN history END) AS adopted,
    max(CASE WHEN dstype = 'comments' THEN history END) AS comments,
    max_by(history, date) FILTER (WHERE history IS NOT NULL) AS latest
  FROM ensdf_datasets WHERE ${NUCID} GROUP BY nucid`);
const xundl = athena("XUNDL by date", `SELECT nucid, date, count(*) AS c FROM xundl_datasets WHERE ${NUCID} GROUP BY nucid, date`);
const exfor = athena("EXFOR entries per target", `SELECT target_za AS za, count(DISTINCT entry) AS entries
  FROM exfor_serve_search_index WHERE target_za IS NOT NULL AND target_za % 1000 > 0 GROUP BY target_za`);

// ── Mass chains ──────────────────────────────────────────────────────────────────────────────────────────────────
const cardsByChain = new Map();
for (const r of chainCards.sort((p, q) => Number(p.dataset_seq) - Number(q.dataset_seq) || Number(p.card_seq) - Number(q.card_seq))) {
  const a = Number(r.nucid);
  if (!cardsByChain.has(a)) cardsByChain.set(a, []);
  cardsByChain.get(a).push(r.text);
}

const nuclides = new Map(); // nucid → row
const touch = (nucid) => {
  const p = nuclideOf(nucid);
  if (!p) return null;
  let r = nuclides.get(nucid);
  if (!r) nuclides.set(nucid, (r = { nucid, ...p, ensdf: 0, xundl: 0, revised: null, own: null, xdates: [] }));
  return r;
};
for (const d of ensdf) {
  const r = touch(d.nucid);
  if (!r) continue;
  r.ensdf = Number(d.datasets);
  r.revised = d.revised && /^\d{6}$/.test(d.revised) ? d.revised : null;
  r.own = latestFull(parseHistory(d.adopted)) ?? latestFull(parseHistory(d.comments)) ?? latestFull(parseHistory(d.latest));
}
for (const x of xundl) {
  const r = touch(x.nucid);
  if (!r) continue;
  const c = Number(x.c);
  r.xundl += c;
  const ym = x.date && /^\d{6}$/.test(x.date) ? Number(x.date) : null;
  r.xdates.push([ym, c]);
  if (ym && (!r.revised || String(ym) > r.revised)) r.revised = String(ym);
}

// The chain's evaluation: its COMMENTS history card, else the evaluation most of its nuclides carry.
const byA = new Map();
for (const r of nuclides.values()) {
  if (!byA.has(r.a)) byA.set(r.a, []);
  byA.get(r.a).push(r);
}
const chains = new Map();
let fromCard = 0, fromMode = 0;
for (const a of [...new Set([...cardsByChain.keys(), ...byA.keys()])].sort((p, q) => p - q)) {
  let ev = latestFull(recordsOf(cardsByChain.get(a) ?? []));
  if (ev) fromCard++;
  else {
    const tally = new Map();
    for (const r of byA.get(a) ?? []) {
      if (!r.own) continue;
      const k = `${citKey(r.own.cit)}|${r.own.cut}`;
      const t = tally.get(k) ?? { ev: r.own, n: 0 };
      t.n++;
      tally.set(k, t);
    }
    const top = [...tally.values()].sort((p, q) => q.n - p.n || (q.ev.cut > p.ev.cut ? 1 : -1))[0];
    ev = top?.ev ?? null;
    if (ev) fromMode++;
  }
  chains.set(a, ev);
}
console.log(`chains ${chains.size}: ${fromCard} from the COMMENTS card, ${fromMode} from their nuclides, ${chains.size - fromCard - fromMode} with none`);

// ── NSR keys for the citations ───────────────────────────────────────────────────────────────────────────────────
const JOURNALS = { NDS: "Nucl.Data Sheets", NP: "Nucl.Phys." };
const refOf = (c) => {
  const m = (c ?? "").trim().match(/^(NDS|NP)\s*(A?\d+)[,\s]+(\d+)\s*[(,]\s*(\d{4})\)?\.?$/i);
  return m ? `${JOURNALS[m[1].toUpperCase()]} ${m[2].toUpperCase()}, ${m[3]} (${m[4]})` : null;
};
const allCits = [...chains.values(), ...[...nuclides.values()].map((r) => r.own)].filter(Boolean).map((e) => e.cit);
const wanted = [...new Set(allCits.map(refOf).filter(Boolean))];
const keyByRef = new Map();
if (wanted.length) {
  const found = athena("NSR keys", `SELECT reference AS ref, min(key_number) AS key FROM search_nsr
    WHERE reference IN (${wanted.map((w) => `'${w.replaceAll("'", "''")}'`).join(",")})
    GROUP BY reference HAVING count(*) = 1`);
  for (const f of found) keyByRef.set(f.ref, f.key);
}
const keyOf = (cit) => keyByRef.get(refOf(cit) ?? "") ?? null;
console.log(`citations resolved to NSR keys: ${keyByRef.size}/${wanted.length}`);

// ── Assemble ─────────────────────────────────────────────────────────────────────────────────────────────────────
const GENERATED = new Date().toISOString().slice(0, 10);
const NOW = Date.parse(GENERATED);
/** Whole years from the cutoff to the build, 0–11; 12 = no cutoff (the old AGE_COLORS index). */
const bucket = (cut) => (cut ? Math.max(0, Math.min(11, Math.floor((NOW - Date.parse(cut)) / 3.15576e10))) : 12);
const since = (r, cut) => {
  const ym = yyyymm(cut);
  return r.xdates.reduce((s, [d, c]) => s + (ym === null || (d !== null && d > ym) ? c : 0), 0);
};

const rows = [...nuclides.values()].sort((p, q) => p.a - q.a || p.z - q.z);
const out = { generated: GENERATED, masses: [], grid: [], nuclides: [], exfor: [] };
for (const r of rows) {
  const chain = chains.get(r.a) ?? null;
  // the nuclide's own evaluation when it has one, else its chain's
  const ev = r.own ?? chain;
  r.ev = ev;
  r.since = since(r, ev?.cut ?? null);
  r.age = bucket(ev?.cut ?? null);
  out.grid.push([r.z, r.n, r.a, r.age, r.since]);
  out.nuclides.push({
    code: `${r.a}${r.el}`, z: r.z, n: r.n, a: r.a, el: r.el, ensdf: r.ensdf, xundl: r.xundl, xundlSince: r.since,
    revised: r.revised ? `${r.revised.slice(0, 4)}-${r.revised.slice(4, 6)}` : null, age: r.age, cutoff: ev?.cut ?? null,
  });
}
for (const [a, ev] of chains) {
  const members = byA.get(a) ?? [];
  // a nuclide evaluated on its own: another citation and another cutoff than its chain's
  const own = members.filter((r) => r.own && ev && citKey(r.own.cit) !== citKey(ev.cit) && r.own.cut !== ev.cut);
  out.masses.push({
    a, citation: ev?.cit ?? null, key: keyOf(ev?.cit), cutoff: ev?.cut ?? null, authors: ev?.aut ?? null,
    // XUNDL sets since the chain's cutoff, over the nuclides that follow the chain's evaluation
    xundl_sets: members.filter((r) => !own.includes(r)).reduce((s, r) => s + since(r, ev?.cut ?? null), 0),
    nuclideEvals: own.sort((p, q) => p.z - q.z).map((r) => ({
      el: r.el.toUpperCase(), citation: r.own.cit, key: keyOf(r.own.cit), cutoff: r.own.cut, authors: r.own.aut, xundl_sets: r.since,
    })),
  });
}
for (const e of exfor) {
  const za = Number(e.za);
  const z = Math.floor(za / 1000), a = za % 1000;
  if (a >= z && a <= 300) out.exfor.push([z, a - z, Number(e.entries)]);
}
out.exfor.sort((p, q) => p[0] - q[0] || p[1] - q[1]);
out.source = `ENSDF ${ENSDF_RELEASE} (nsr.ensdf_cards, nsr.ensdf_datasets), XUNDL (nsr.xundl_datasets), ` +
  `EXFOR (nsr.exfor_serve_search_index), NSR (nsr.search_nsr); built ${GENERATED}`;

const noCut = out.masses.filter((m) => !m.cutoff).map((m) => m.a);
console.log(`${out.masses.length} chains (no cutoff: ${noCut.join(", ") || "none"}) · ` +
  `${out.masses.reduce((s, m) => s + m.nuclideEvals.length, 0)} nuclide evaluations · ${out.nuclides.length} nuclides · ${out.exfor.length} EXFOR targets`);
publish(NAME, out, {
  script: "scripts/viz/structure-index.mjs",
  sources: ["nsr.ensdf_cards", "nsr.ensdf_datasets", "nsr.xundl_datasets", "nsr.exfor_serve_search_index", "nsr.search_nsr"],
  rows: { masses: out.masses.length, nuclides: out.nuclides.length, exfor: out.exfor.length },
});
