# Brief 76: Data lake chart

## Objective
One page Brendan can read top to bottom to see everything the lake holds and how each piece relates to the others. He is not a nuclear physicist; the chart is how he learns the structure and the vocabulary.

## Deliverable
`docs/sketches/2026-11-11-data-lake-chart.html`: one self-contained HTML file (inline CSS and SVG or nested boxes, no libraries, no build), styled like `docs/sketches/2026-11-06-efficiency-voice.html`. Open it in his browser with `open` when done. Commit and push it.

## Shape
A vertical org chart, read top down, as wide as it needs (horizontal scroll is fine).
- Level 1: NSRgpt data lake.
- Level 2: the kinds of data, one box each. Expected: literature (NSR), structure and decay (ENSDF, XUNDL, Nubase, decay libraries, ICRP 107), measured reactions (EXFOR, CINDA), evaluated reaction libraries (the ENDF-format family), reference data (RIPL-4, stopping, CoNDERC, BetaShape, GNDS copies), JANIS reference (crawl tree, the 72 `janis/data` packages), derived work (sweep, encoder, Elpis book index). Correct this list from what the lake really holds.
- Level 3: under evaluated reaction libraries, the families (ENDF/B, JEFF, JENDL, TENDL, CENDL, BROND, RUSFOND, FENDL, IRDFF/IRDF, EAF, GEFY, IAEA-PD, PADF), then every release under its family (all served releases plus the ones brief 73 is adding, marked "arriving").
- Level 4: for one release, the forms it exists in, drawn once as a pattern and referenced by the others: publisher's files (raw) → parsed tables (name each `nsr.endfb_*` table and the ENDF File number it holds: File 2 resonance parameters, File 3 cross sections, Files 4–15, File 8, File 32/33) → serving copies (`xs_index`, `series.bin`, POINT files) → JANIS's package for the same release (its computed curves) → the pages and API routes that read each.
- Do the same form chain, shorter, for EXFOR, ENSDF/XUNDL and NSR.

## Each box carries
- The name, and the acronym spelled out once (ENDF: Evaluated Nuclear Data File; ENSDF: Evaluated Nuclear Structure Data File; EXFOR: Exchange Format; XUNDL: Experimental Unevaluated Nuclear Data List; NSR: Nuclear Science References; verify each).
- One plain line saying what it is, 12 words or fewer.
- Where it lives (S3 prefix or Athena table) and its size as a compact count (304K, 9.1M).

## A terms table at the foot
Library, release, material, section (MF/MT), evaluation, original, package, parsed table, serving copy, resonance, reconstructed curve. One line each, in plain words, each pointing at the box where it appears on the chart. One term per thing: if the codebase or docs use two words for the same thing, list both and say which one the chart uses.

## Rules
- Facts from the lake itself: S3 listings (one AWS CLI call at a time), Athena `nsr.*`, `services/nsr-api/structure.py`, `docs/HANDOFF-2026-11-11.md`, the README files under `scripts/`. Nothing from memory. Where a count is unknown, find it; do not leave a gap or a guess.
- Plain language, no metaphors. First person where a voice is needed. No headings or captions that restate what the layout shows.
- No app code changes, no build, nothing heavy on the Mac (no python3).
- Shared tree: `git pull --rebase --autostash origin main`, then `git commit -- <path>`.

## Report
Message `new-lead-agent` one line when the page is open in Brendan's browser. Then go straight on to `docs/briefs/75-elpis-finish-janis-crawl.md` (read `docs/briefs/72-elpis-match-janis.md` first) and execute it to done; lanes A and B are `worker-1-11` and `worker 2-11`.
