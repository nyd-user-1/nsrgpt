// EXFOR reactions (brief 36, Part 3, 2026-11-09): the table behind /viz/data/reactions. One row per target, reaction
// and quantity in nsr.exfor_serve_search_index (the rows the API's /exfor/search reads and nsr.exfor_serve_reactions, the
// /exfor/pickers/reactions table, is counted from), with its entries, subentries, datasets and data points, and the
// quantity's description from nsr.exfor_serve_quantities. The picker itself counts per reaction only, with no target,
// quantity or points, so the table needs the finer grouping.
//
//   node scripts/viz/exfor-reactions.mjs            build, write public/viz-data/exfor-reactions.json, publish
//   node scripts/viz/exfor-reactions.mjs --no-publish
//
// Output: { source, cols, quantities, rows }: rows as arrays in cols' order, most entries first, and each quantity's
// description once in quantities, to keep the file small.
import { athena, publish } from "./lib.mjs";

const NAME = "exfor-reactions.json";

const rows = athena("EXFOR reactions", `
  WITH q AS (SELECT quantity, max(description) AS description FROM exfor_serve_quantities GROUP BY quantity)
  SELECT s.target_sym AS target, s.reaction, s.quantity, max(q.description) AS description,
         count(DISTINCT s.entry) AS entries, count(DISTINCT s.subent) AS subentries, count(*) AS datasets,
         sum(s.points) AS points
  FROM exfor_serve_search_index s LEFT JOIN q ON q.quantity = s.quantity
  WHERE s.reaction IS NOT NULL AND s.target_sym IS NOT NULL
  GROUP BY s.target_sym, s.reaction, s.quantity`);

/** "(Partial cross section)" → "Partial cross section"; EXFOR's dictionary runs words together at its line breaks. */
const tidy = (d) => (d ? d.replace(/^\(|\)$/g, "").replace(/\s+/g, " ").trim() : null);
/** ",SIG" → "SIG"; "PAR,DA" stays. */
const qty = (q) => (q ? q.replace(/^,+/, "") : "");
/** The commonest quantities the dictionary leaves blank (EXFOR dictionary 236 carries no text for them), in the EXFOR
 *  manual's words. SIG alone is 65,456 datasets. */
const BLANK = {
  SIG: "Cross section",
  "PAR,SIG,G": "Partial cross section, gamma emission",
  "CUM,FY": "Cumulative fission yield",
  "IND,SIG": "Independent cross section",
  "PAR,DA,G": "Partial differential cross section d/dA, gamma emission",
  ETA: "Neutrons emitted per neutron absorbed (eta)",
  "IND,FY,,FRC": "Independent fission yield, fractional",
  "CUM,FY,,FRC": "Cumulative fission yield, fractional",
  "DA,P": "Differential cross section d/dA, outgoing protons",
  "DA,N": "Differential cross section d/dA, outgoing neutrons",
  "DA,A": "Differential cross section d/dA, outgoing alphas",
};

const cols = ["target", "reaction", "quantity", "entries", "subentries", "datasets", "points"];
const quantities = {};
const out = rows
  .map((r) => {
    const q = qty(r.quantity);
    const d = tidy(r.description) ?? BLANK[q] ?? null;
    if (d && !quantities[q]) quantities[q] = d;
    return [r.target, r.reaction, q, Number(r.entries), Number(r.subentries), Number(r.datasets), Number(r.points ?? 0)];
  })
  .sort((p, q) => q[3] - p[3] || q[6] - p[6]);

const total = out.reduce((s, r) => s + r[6], 0);
console.log(`${out.length} target · reaction · quantity rows; ${out.reduce((s, r) => s + r[5], 0)} datasets; ${total} data points; ${Object.keys(quantities).length} quantities described`);
publish(NAME, {
  source: "EXFOR (IAEA X4Pro and J4), nsr.exfor_serve_search_index and nsr.exfor_serve_quantities, built " + new Date().toISOString().slice(0, 10),
  cols,
  // each quantity's description once, keyed by the code the rows carry
  quantities,
  rows: out,
}, {
  script: "scripts/viz/exfor-reactions.mjs",
  sources: ["nsr.exfor_serve_search_index", "nsr.exfor_serve_quantities"],
  rows: { reactions: out.length },
});
