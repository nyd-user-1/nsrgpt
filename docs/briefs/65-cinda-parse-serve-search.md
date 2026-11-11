# 65 — CINDA: parse the held archive, one table, one route, the search page (2026-11-10, 21:30 ET)

You're `new-worker-1`. Written by `lead-agent` (Fable). CINDA (the Computer Index of Nuclear Reaction Data, kept by
the NRDC network since 1964) is in the lake and nowhere else on the site. Brendan's order: parse it, serve it, remake
its search page. Report to `lead-agent` by SendMessage, Efficiency Voice, one line per part, one at the end. No
questions; decide and record.

## What is held
`raw/iaea/2026-11-07/exfor-master/cinda/`: 645 files, 2.2 GB, mirrored 2026-11-07. Prefixes `000-cinda-main/`
(with `cinda-updates.txt`, the `manual-2006-06-22/` folder holding `CINDA-2009-04-21.zip` and the `cinda*.c2k.lst`
format listings), `111-cinda-store/`, `backup/`, and dated `cinda-YYYY-MM-DD/` snapshots. Start by reading the manual
zip and the `.lst` files on a box: they define the CINDA block format (fixed-column lines: target, quantity, energy
range, laboratory, work type, reference with journal, volume, page and year, the NSR key where present, the EXFOR
entry where present, comments). Record the format you used in the manifest with the file it came from. Where the
manual and the data disagree, the data wins and the manifest says where.

## Rules
1. Mac rules: no python3 locally; AWS CLI one call at a time; parsing on a box (`scripts/parse/box/create.sh`, the
   Free-Tier types the New account allows are enough; this is 2 GB of text). `~/Code/nsrgpt` on main, shared: pull
   `--rebase --autostash`, commit with explicit paths, push your own files only (never `components/nsrcpt/`). You
   own `scripts/parse/cinda/**` (new), `lake/cinda/**`, `services/nsr-api/cinda.py` (new; its README rows and
   `MODULES` line), `app/(site)/cinda/**` and `components/cinda/**` (new), the sidebar row, plate box and header
   title for it, the dictionary entries and INVENTORY rows.
2. Copy the pattern (EV rule 17): `scripts/parse/exfor/` for a fixed-field parser with a dictionary;
   `scripts/parse/box/lake.py` for Parquet and Glue; `services/nsr-api/structure.py`'s `route` for the route;
   `app/(site)/datasets/[source]/page.tsx` and `components/datasets/DatasetIndex.tsx` for a static shell reading the
   API; nds.iaea.org/exfor/cinda.htm for the search form's fields (its screenshot is what Brendan expects remade).
3. Spend cap $3; terminate the box.

## Part A: parse
1. Pick the newest complete snapshot (by the dated folders and `cinda-updates.txt`; say which) and the manual.
2. `scripts/parse/cinda/parse.py`: every block to rows in `nsr.cinda_lines` (`lake/cinda/<snapshot-date>/lines/`):
   block_id, target_za, target (symbol form), quantity (the CINDA quantity code and its word from the manual's
   table), e_min_ev, e_max_ev, lab (code and name), work_type (expt, eval, theo, revw, comp, as coded), reference
   (journal or report code, volume, page, year), reference_text, nsr_key, exfor_entry, comment, date_entered,
   source_file. Dictionaries for quantity, lab and work type as `nsr.cinda_dict_*` from the manual's tables.
3. Checks: block count against the snapshot's own count if it carries one; every `nsr_key` tested against
   `nsr.nsr_parquet` and every `exfor_entry` against `nsr.exfor_entries`, with the matched and unmatched counts in the
   manifest (`lake/cinda/<date>/manifest.json`: files, blocks, rows, matches, rejects, format source, spend). The
   lines before 2010 that no NSR key or EXFOR entry resolves are the ones nobody else holds; count them.
4. INVENTORY row; dictionary entries; README rerun line.

## Part B: serve
`GET /cinda?target=U-235&quantity=&emin=&emax=&lab=&type=&year=&author=&page=` (100 rows a page, the fields the
IAEA form offers; `target` accepts the symbol forms the EXFOR routes accept), `GET /cinda/pickers/{quantities|labs|types}`,
`GET /cinda/block/{block_id}`. Read from the Parquet by target_za row groups as `/exfor/points` reads. README rows.
Deploy from the dev box (pull first). Latency for U-235.

## Part C: the page
`/cinda`, header title "CINDA", sidebar row under Data, plate box ("The index of nuclear reaction data since 1964:
every measurement, evaluation and review, by target, quantity, energy and laboratory."). The form at the top in the
IAEA page's shape (target, quantity, energy range, laboratory, work type, year, author), the results table beneath
(target, quantity, energy range, lab, type, reference, year), a row linking to the NSR record (`/datasets/nsr/<key>`)
and the EXFOR entry (`/datasets/exfor/<entry>`) where resolved. Static shell reading the API; both themes checked on
the box (http://18.216.193.38:3000 until 02:00 ET); lint and types on the box.

## Done means
`nsr.cinda_lines` and its dictionaries registered with the manifest's counts and matches; the route and page live
on the box; INVENTORY, dictionary, README; the box terminated; one final report with blocks, rows, matched and
unmatched counts, the pre-2010 unmatched count, latency, spend, and the page URL.

## Kickoff
`Read ~/Code/nsrgpt/docs/briefs/65-cinda-parse-serve-search.md and do it; report to lead-agent after each part.`
