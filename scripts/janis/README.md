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
