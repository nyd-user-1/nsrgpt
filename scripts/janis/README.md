# JANIS Web's browse tree, crawled and marked (brief 68)

https://www.oecd-nea.org/janisweb/tree, every row at every level, marked against the lake, for the /janis replica
(brief 67) and for finding the lake's remaining holes.

- `crawl.py`: breadth first from Base, one request a second, User-Agent naming NSRgpt. Every page is cached under
  `s3://nsr-lake-613473203863/lake/_work/janis/pages/<path>.html`, so a rerun fetches only what is new. Levels: Base (0)
  → category (1) → library (2) → data type (3) → element (4) → isotope (5) → the leaf rows on the isotope page (an Open
  button and a renderer id). Labels verbatim. Writes `lake/janis/2026-11-10/tree-raw.json` every five minutes and
  `progress.json` (pages fetched, cached, failed; nodes per level; what is still queued).
- `mark.py`: reads `tree-raw.json`, builds `held.json` once from Athena (`nsr.endfb_sections` joined to
  `nsr.endfb_materials` for the six JANIS releases the lake holds and the three it adds, and
  `nsr.exfor_serve_search_index` for EXFOR's projectiles and targets), marks every node `missing`, `same` or `ours` with
  the `rule` that decided it (the rules are in its docstring), adds the lake's own rows as `ours`, and writes
  `lake/janis/2026-11-10/tree.json`. `public/janis-tree.json` is the copy the page reads.

## The tree file
`{ label, path, href, children: [...], leaf?: { renderer_id }, crawled, mark, rule, counts: { children, leaves, missing,
same, ours } }`, recursively from Base. `path` is JANIS's own path below `/janisweb/tree` (`/N/'ENDF/B-VII.1'/SIG/Ni/Ni58`);
`href` the live page (null on `ours` rows). `crawled: false` on a node means its page is still queued, so its children
are not listed yet.

## The size, and the method (lead-agent, 2026-11-11 00:20 ET)
The isotope pages list every reaction as a leaf, so the whole tree is hundreds of thousands of pages: days at one
request a second. The tree has no JSON endpoint (each level is a server-rendered page; the only script copies
`data-renderer` into `href` on leaf rows), and NEA's per-library content page answers a Cloudflare challenge. So:
- every page down to the data types is fetched (1,270 pages: Base, 16 categories, 188 libraries, 618 data types, whose
  pages list the elements);
- for the libraries the lake holds (EXFOR, ENDF/B-VI.8, VII.0, VII.1, VIII.0, JEFF-3.3, CENDL-3.2, Nubase 2020) no
  element or isotope page is fetched: `mark.py` builds their isotope rows from the lake (`--skip-held-from 4`);
- for the libraries it does not hold, the element pages are fetched (21,286 of them, about 6.5 hours), which list the
  isotopes; no isotope page and so no leaf row is fetched (`--max-depth 4`).
The box re-marks the tree every 30 minutes while it crawls (`remark.sh`) and once at the end.

## Counts
Levels 1 and 2, marked (2026-11-11 00:40 ET): categories 16 same and 1 ours (CINDA); libraries 146 missing, 42 same,
30 ours. Whole tree so far: 3,431 missing, 24,990 same, 45 ours.

## Rerun
`./scripts/parse/box/create.sh nsr-janis-1 t3.micro ../../janis/userdata.sh 12` (role nsr-parse-box with inline policy
`nsr-parse-box-janis` = `box-policy.json`), copy `crawl.py` and `mark.py` to `s3://nsr-lake-613473203863/lake/_work/janis/scripts/`,
then on the box: `cd /opt/janis && nohup python3 crawl.py --hours 20 --max-depth 4 --skip-held-from 4 &` and `./remark.sh &`; whenever a fresh tree is
wanted, `python3 mark.py`.

## JANIS's own data packages (brief 73)
NEA's public GitLab project `janis/data` ("The data sets for JANIS offline installation") holds the library files JANIS
itself draws: 72 generic packages, 434 files, 117.1 GB, no token. List:
`https://git.oecd-nea.org/api/v4/projects/janis%2Fdata/packages?per_page=100`; files per package at
`…/packages/<id>/package_files`; download at `…/packages/generic/<NAME>/<VERSION>/<file>`. Held in the lake, every file,
by `fill/janisdata.py`: `lake/_raw/janis-data/<NAME>/<VERSION>/<file>`, with `manifest.json` (bytes, SHA-256 checked
against GitLab's).

**The .jpk format** (zip comment "JANIS Packed ENDF"; decoder `scripts/recon/jpk.py`, lane B):
- one zip member per ENDF section, `nsub<NSUB>/mat<MAT>/mf<MF>/mt<MT>`, in tape order; columns 67-80 and SEND lines
  are not stored;
- a numeric line is the byte 0x01, then 33 bytes holding columns 1-66 as nibbles, high nibble first: 1-9 the digit,
  a `0`, b `.`, c `+`, d `-`, e `E`, f space; a text line (MF1/451's description) is its own characters ended by `\n`;
- numeric fields may be F-format (` 26056.0000`), which `parse.py`'s fixed-column reader takes.
- **Processed, not the evaluation, for neutron MF3**: resonances reconstructed and broadened, NJOY's MTs 203-207,
  301-303 and 442-447 added; ENDF/B-VIII.0 Fe-56 MT102 decodes to the same 40,561 points JANIS's Tabler prints. MF1/451
  is the original evaluation's (TEMP 0, the NJOY MTs absent from its directory). Other Files are carried as evaluated.
- Beside each library's .jpk: `<lib>.inter.zip` (JANIS's interface settings) and for some `<lib>.boxer.zip`
  (covariances in BOXER format).

**How the lake uses them.** `fill/jpk2endf.py` writes each package back to ENDF-6 tapes (one zipped tape per NSUB,
`lake/_raw/janis-data-endf/<release>/`), which `parse/endfb/fill.sh` parses like any tape. A library whose original
files the lake holds (IAEA, JAEA, NEA, Imperial) keeps the original as its `nsr.endfb_*` source, since those tables hold
the evaluation (MF2 parameters and MF3 background); the package is checked against it by materials and by sections
outside MF3. A library JANIS alone holds is parsed from its package, and its manifest says the MF3 is JANIS's processed
data. JANIS's curves themselves are served by lane B (brief 74) from the packages.
