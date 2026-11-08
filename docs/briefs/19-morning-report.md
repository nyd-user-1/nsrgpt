# 19 — Morning report (2026-11-08, written about 04:20 ET by agent-1, the night lead)

## The lakehouse, phase by phase (done / remaining)
1. **Raw layer** … 99%. 117,824 files, 430.7 GB. Everything the IAEA Quick Links serve, TENDL-2023 and 2021, NEA's JEFF
   sets, JAEA's JENDL, the NRDC archive, CIELO, IDB, PSF, CoNDERC, NGATLAS. Listed, not taken: 3,034 IAEA files (DXS data,
   leftovers; the proxy plan ran out), one dead JENDL file, 4 internal NRDC pages, phases 3–4 by design.
2. **Parsed layer** … 90%. In Athena `nsr`: NSR (42 tables), ENSDF (16), XUNDL (16), ENDF/B all nine releases plus the
   reconstructed POINT releases (B-VIII.1 and B-VIII.0 at 0 K and 293.6 K), EXFOR (X4Pro 2023 and 2025, J4, C5, the
   dictionary). Every count matches the reference or is explained in its manifest. Not parsed: ENDF sections beyond MF1
   and MF3 as value tables; JEFF, JENDL, TENDL, CENDL (held as files, not tables); POINT above 293.6 K.
3. **Serving layer** … 70%. `lake/serve/`: nuclide summary, adopted levels, gammas, decays; ENDF materials and cross
   sections as arrays (13 releases); EXFOR search index, targets, reactions, quantities; the search documents.
4. **Catalog** … 90%. 240-odd tables in Glue database `nsr`, every parsed and serving table registered.
5. **Cached API** … 80%. `https://daw1qggkn69lv.cloudfront.net` (Lambda `nsr-api`, API Gateway, CloudFront, 1-hour
   cache): `/exfor/search`, `/exfor/subentry/{id}`, `/exfor/pickers/{name}`, `/nuclide/{name}` (+`/levels`, `/gammas`),
   `/endf/materials`, `/endf/xs` (POINT by default, `release_served` says which), `/endf/mt`, `/search`, `/suggest`,
   `/nsr/{key}`. Warm 0.1–0.4 s, cached 0.05–0.13 s, cold 3–5 s. Routes: `services/nsr-api/README.md`.
6. **Search** … 70%. One keyword index over 675,427 records (EXFOR, ENSDF, XUNDL, ENDF/B, NSR) in `search.duckdb`,
   served by `/search` and `/suggest`; 5 of 6 checks pass (the sixth asks for JEFF, not parsed). The NSR meaning search
   is unchanged. On the app's /search page, "Records across the lake" shows the hits under the search bar.

**UI layer** … 100% of brief 13 on branch `ui-layer`, plus tonight's graph and chart work. Not merged: your sign-off.

## The graph page tonight (branch `ui-layer`, dev server https://nsrgpt-dev-jjg4wr96jqg9cqx7x-3000.app.github.dev/graph)
- Rail tabs on both inset panels; the right panel draggable (the shell's gripper), 500 ms; the ideas list, ranked, with
  your two PDFs; the zoom controls in the paper palette; the catalog rail scrolls.
- Decay chains: the four series from ENSDF's decay data on the series grid (Z across, A down); a ²⁴¹Pu sample; the
  thorium series drawn as the Wikipedia figure (bubbles, element colours, α down, β− up-right).
- Sample canvases for the layout review: s-process Ag to Sb and mass 201–210 on the chart grid; U-238 to Cm-244; the
  Sasahara figure drawn to its design (class colours, capture blue, α magenta, β and EC green, fission shares);
  Mo-99/Tc-99m and Lu-177 routes; the U-235 fission fan; Co-60 and Cs-137 level schemes.
- Nuclide cards wear their decay family's colour, the charts' palette.
- `/viz/chart`: the chart of nuclides, every nuclide a box at (N, Z), magic numbers ruled; a click opens the IAEA-style
  card with Jπ, half-life, mass excess, binding, mass, Q-values, Sn, Sp, decay modes and major radiations.
- Placeholders on the plate for the ²⁴¹Pu chain and the four-series grid, linking their illustrations.

## Spend tonight
- AWS: raw layer $0.90, parsing and serving about $0.45 (boxes $0.35, Athena and S3 requests under $0.10); the API,
  CloudFront and Lambda inside their free tiers. Storage added: about 17 GB of Parquet, about $0.40 a month.
- Proxy: the Webshare plan, about all of it (140 GB); it ends 2026-11-19 unrenewed.

## Your decisions, in order
1. **Merge `ui-layer` to main** … the push deploys through GitHub Actions with the chart-data address set. Say go.
2. **The dev server** … running in the codespace for your review; say stop and I stop it, and remove the two worktrees.
3. **Data domain** … charts load from `dcl3kyt3ynmb2.cloudfront.net`; a custom name and certificate are yours to buy.
4. **Next parsing** … JEFF-3.3, JENDL-5, TENDL into `endfb_*`-shaped tables (one brief, a few hours), ENDF sections
   beyond MF3, POINT at the other temperatures.
5. **Next UI** … the EXFOR search page from the remake sketch over the live API; a nuclide page over `/nuclide`; the
   chart page's boxes linking to it; the graph's sample canvases replaced by API data.
6. **The ideas list** … ranked in the graph's right panel; the top three (our own evaluated library, a nuclear data
   model, the validation fleet) each need a sizing brief before anyone funds them.

## Where things are
- Repo main: every agent deliverable committed (scripts/parse/*, services/nsr-api/*, scripts/iaea/*, briefs 13–19,
  nsr-lake.html). Branch `ui-layer`: the UI, pushed, 20 commits since 32d4e9d.
- Lake: `INVENTORY.md` current; a manifest in every folder; `docs/sketches/nsr-lake.html` Stats tab lists the parsed
  and serving tables and the API.
- Sessions: raw-layer, parsing-1 and parsing-2 are idle and done; no EC2 box is running; caffeinate is on.
